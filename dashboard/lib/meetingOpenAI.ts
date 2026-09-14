"use client";

// ============================================================
// meetingOpenAI — GỌI OPENAI TỪ TRÌNH DUYỆT (không qua máy chủ).
//
// VÌ SAO PHẢI LÀM THẾ NÀY:
// Gỡ băng 1 phút tiếng mất ~37 giây, tức 0,6× thời lượng. Dự án chạy trên gói
// Vercel Free, trần thời gian mỗi hàm là 60 GIÂY — khai `maxDuration = 300`
// cũng bị bỏ qua. Nghĩa là đoạn ghi âm dài hơn khoảng 1 phút là chắc chắn bị
// cổng cắt kết nối giữa chừng ("Failed to fetch", đã xảy ra thật với đoạn
// 15:31 ngày 14/09/2026). Cắt đoạn ngắn hơn không cứu được: họp 2 tiếng sẽ
// thành 120 mảnh, và mỗi mảnh vẫn cưỡi lên trần.
//
// Trình duyệt thì KHÔNG có trần nào. Nên cuộc gọi dài chuyển hẳn sang đây, còn
// máy chủ chỉ giữ hai việc nhanh gọn mà nó phải giữ:
//   • dựng prompt chống bịa + quyết chế độ timeline (không tin client)
//   • kiểm tra quyền, gác gói dịch vụ, và LƯU kết quả
//
// Dùng SDK `openai` chứ không tự dựng multipart: tham số mẫu giọng
// (known_speaker_names/references) là mảng, SDK tuần tự hoá đúng cách mà OpenAI
// chờ đợi — tự viết tay rất dễ sai mà lỗi lại im lặng (mất tên thật, ra
// "Speaker 1/2/3" mà không báo gì).
//
// Khoá API là khoá của CHÍNH người dùng, họ tự dán và lưu ở localStorage —
// quyết định có chủ đích từ đầu, nên đưa xuống trình duyệt không làm lộ thêm gì.
// ============================================================

import OpenAI from "openai";
import { supabase } from "./supabase";
import {
  MEETINGS_BUCKET,
  TRANSCRIBE_MODEL,
  MAX_TRANSCRIBE_BYTES,
  voiceSampleMime,
} from "./meetingModels";

export type DiarizedSegment = { speaker: string; start: number; end: number; text: string };

export type KnownSpeaker = { name: string; path: string };

export type BrowserTranscribeResult = {
  text: string;
  segments: DiarizedSegment[];
  speakers: string[];
  knownSpeakersUsed: string[];
};

function client(apiKey: string) {
  return new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true,
    // SDK mặc định bỏ cuộc sau 10 PHÚT — mà một đoạn 20 phút tiếng mất khoảng
    // 12 phút gỡ băng, tức sẽ bị chính SDK cắt ngang dù OpenAI vẫn đang chạy.
    timeout: 45 * 60 * 1000,
    // Mặc định SDK tự thử lại 2 lần. Với cuộc gọi vừa lâu vừa tốn tiền, thử lại
    // ngầm là đốt tiền mà người dùng không biết — để họ tự bấm "Gỡ record".
    maxRetries: 0,
  });
}

/** Đọc Blob thành data URL — dạng OpenAI yêu cầu cho mẫu giọng đối chiếu. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Không đọc được mẫu giọng."));
    reader.readAsDataURL(blob);
  });
}

/** Ghép các câu đã tách người nói thành văn bản đọc được. */
function segmentsToText(segments: DiarizedSegment[]): string {
  const lines: string[] = [];
  let lastSpeaker = "";
  for (const seg of segments) {
    const text = (seg.text || "").trim();
    if (!text) continue;
    if (seg.speaker && seg.speaker !== lastSpeaker) {
      lines.push(`${seg.speaker}: ${text}`);
      lastSpeaker = seg.speaker;
    } else {
      lines.push(text);
    }
  }
  return lines.join("\n");
}

/**
 * Gỡ băng MỘT đoạn ghi âm, chạy hoàn toàn trong trình duyệt.
 * `offsetSec` là vị trí đoạn này trên trục thời gian cả cuộc họp.
 */
export async function transcribeSegmentInBrowser(opts: {
  apiKey: string;
  audioPath: string;
  offsetSec: number;
  knownSpeakers: KnownSpeaker[];
}): Promise<BrowserTranscribeResult> {
  const { apiKey, audioPath, offsetSec, knownSpeakers } = opts;

  const { data: audioBlob, error: dlErr } = await supabase.storage
    .from(MEETINGS_BUCKET)
    .download(audioPath);
  if (dlErr || !audioBlob) {
    throw new Error(`Không tải được đoạn ghi âm từ kho: ${dlErr?.message || "file rỗng"}`);
  }

  // Trần 25MB áp cho MỌI model gỡ băng, không có endpoint nhận URL để lách.
  if (audioBlob.size > MAX_TRANSCRIBE_BYTES) {
    throw new Error(`Đoạn ghi âm nặng ${(audioBlob.size / (1024 * 1024)).toFixed(1)}MB, vượt trần 25MB mỗi lần gọi API gỡ băng của OpenAI.`);
  }

  // Nạp mẫu giọng -> data URL. Mẫu nào hỏng thì bỏ qua, không làm chết cả đoạn.
  const names: string[] = [];
  const references: string[] = [];
  for (const spk of knownSpeakers) {
    try {
      const { data: sample } = await supabase.storage.from(MEETINGS_BUCKET).download(spk.path);
      if (!sample) continue;
      const typed = sample.type ? sample : new Blob([sample], { type: voiceSampleMime(spk.path) });
      names.push(spk.name);
      references.push(await blobToDataUrl(typed));
    } catch {
      // bỏ qua mẫu giọng hỏng
    }
  }

  const fileName = audioPath.split("/").pop() || "audio.webm";
  const file = new File([audioBlob], fileName, { type: audioBlob.type || "audio/webm" });

  // KHÔNG truyền `prompt`: model diarization từ chối thẳng với
  // "400 Prompt is not supported for diarization models".
  const params: any = {
    file,
    model: TRANSCRIBE_MODEL,
    response_format: "diarized_json", // bắt buộc mới có speaker + start/end
    chunking_strategy: "auto",        // bắt buộc với audio dài hơn 30 giây
  };
  if (names.length > 0) {
    params.known_speaker_names = names;
    params.known_speaker_references = references;
  }

  // Các tham số trên mới hơn type của openai@6.32.0 — ép kiểu, payload vẫn chuẩn.
  const transcription: any = await client(apiKey).audio.transcriptions.create(params as any);

  const rawSegments: any[] = Array.isArray(transcription?.segments) ? transcription.segments : [];
  const segments: DiarizedSegment[] = rawSegments
    .map((s: any) => ({
      speaker: String(s.speaker || "Speaker ?"),
      // Quy mốc giờ của đoạn về trục thời gian CẢ cuộc họp
      start: Number(s.start || 0) + offsetSec,
      end: Number(s.end || 0) + offsetSec,
      text: String(s.text || "").trim(),
    }))
    .filter((s: DiarizedSegment) => s.text.length > 0);

  return {
    text: segments.length > 0 ? segmentsToText(segments) : String(transcription?.text || ""),
    segments,
    speakers: Array.from(new Set(segments.map(s => s.speaker))),
    knownSpeakersUsed: names,
  };
}

/**
 * Dựng biên bản từ prompt do MÁY CHỦ soạn — trình duyệt chỉ là đường truyền,
 * không được tự chế prompt (luật chống bịa phải giống nhau cho mọi biên bản).
 */
export async function analyzeInBrowser(opts: {
  apiKey: string;
  model: string;
  reasoningEffort: string;
  systemPrompt: string;
  userContent: string;
}): Promise<any> {
  const { apiKey, model, reasoningEffort, systemPrompt, userContent } = opts;

  // Dòng 5.6 là model suy luận: KHÔNG truyền temperature, dùng reasoning_effort.
  const completion: any = await client(apiKey).chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    reasoning_effort: reasoningEffort,
    response_format: { type: "json_object" },
  } as any);

  return JSON.parse(completion.choices?.[0]?.message?.content || "{}");
}
