import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import os from "os";
import { normalizePlan, isFeatureAllowed } from "@/lib/planShared";
import {
  TRANSCRIBE_MODEL,
  MAX_TRANSCRIBE_BYTES,
  MAX_KNOWN_SPEAKERS,
  MEETINGS_BUCKET,
} from "@/lib/meetingModels";

// Gỡ băng một đoạn 20 phút mất vài phút; mặc định Vercel cắt function sớm hơn
// khiến client nhận trang lỗi HTML/text ("A server error...") thay vì JSON.
export const maxDuration = 300;

type DiarizedSegment = { speaker: string; start: number; end: number; text: string };

/**
 * Nhận diện lỗi lặp vòng của model gỡ băng: cùng một câu trả về hàng chục lần,
 * dấu hiệu model không nghe được nội dung thật (thu âm quá nén, im lặng dài).
 *
 * QUAN TRỌNG: hàm này CHỈ để cảnh báo. Không bao giờ dùng kết quả của nó để vứt
 * nội dung đi — mất 20 phút họp mà chỉ đổi lấy một dòng log là cái giá quá đắt
 * cho một phép đoán.
 */
function detectHallucination(text: string): { isHallucination: boolean; warning: string } {
  if (!text || text.length < 50) {
    return { isHallucination: true, warning: "Bản gỡ băng quá ngắn hoặc rỗng. File âm thanh có thể bị hỏng hoặc không có giọng nói." };
  }

  // Chỉ xét các câu đủ dài (>15 ký tự) để bỏ qua các câu đệm ngắn tự nhiên trong hội thoại
  // (VD: "Vâng ạ.", "Dạ đúng rồi.", "Cảm ơn anh.") - những câu này lặp lại nhiều lần là bình thường.
  const sentences = text.split(/[.!?。]+/).map(s => s.trim()).filter(s => s.length > 15);

  if (sentences.length < 15) {
    return { isHallucination: false, warning: "" };
  }

  const counts: Record<string, number> = {};
  for (const s of sentences) counts[s] = (counts[s] || 0) + 1;
  const uniqueSentences = new Set(sentences);
  const uniqueRatio = uniqueSentences.size / sentences.length;
  const mostRepeated = findMostRepeatedSentence(sentences);
  const mostRepeatedCount = counts[mostRepeated] || 0;

  // Chỉ báo khi vừa có tỉ lệ trùng lặp cao (< 15% câu độc nhất) VỪA có 1 câu dài lặp lại
  // rất nhiều lần (>= 8 lần) — kết hợp 2 điều kiện để giảm báo sai với họp dài, tự nhiên.
  if (uniqueRatio < 0.15 && mostRepeatedCount >= 8) {
    return {
      isHallucination: true,
      warning: `Nghi ngờ AI gỡ băng bị lặp vòng: chỉ ${uniqueSentences.size} câu độc nhất trong ${sentences.length} câu (${(uniqueRatio * 100).toFixed(0)}%), câu "${mostRepeated.substring(0, 80)}..." lặp ${mostRepeatedCount} lần. Nguyên nhân thường gặp: thu âm quá nén hoặc nhiều đoạn im lặng. Nội dung VẪN được giữ lại — hãy đọc kiểm tra đoạn này ở màn Review.`
    };
  }

  const hallucinationPhrases = [
    "tạm biệt",
    "hẹn gặp lại",
    "cảm ơn các bạn đã theo dõi",
    "đừng quên like",
    "đăng ký kênh",
    "subscribe",
    "video tiếp theo",
    "thank you for watching",
  ];

  const lowerText = text.toLowerCase();
  for (const phrase of hallucinationPhrases) {
    const regex = new RegExp(phrase, "gi");
    const matches = lowerText.match(regex);
    if (matches && matches.length > 8) {
      return {
        isHallucination: true,
        warning: `Nghi ngờ AI gỡ băng bị lặp vòng: cụm "${phrase}" xuất hiện ${matches.length} lần. Nội dung VẪN được giữ lại — hãy đọc kiểm tra đoạn này ở màn Review.`
      };
    }
  }

  return { isHallucination: false, warning: "" };
}

function findMostRepeatedSentence(sentences: string[]): string {
  const counts: Record<string, number> = {};
  for (const s of sentences) {
    counts[s] = (counts[s] || 0) + 1;
  }
  let maxSentence = "";
  let maxCount = 0;
  for (const [sentence, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      maxSentence = sentence;
    }
  }
  return maxSentence;
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

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;

  let tempFilePath = "";
  try {
    const authHeader = req.headers.get("Authorization");
    const apiKey = (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null) || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Mã khoá OpenAI API Key chưa được cấu hình. Vui lòng kiểm tra cài đặt." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { meetingId, audioPath } = body;
    const offsetSec = Number(body.offsetSec) || 0;
    const knownSpeakerIds: string[] = Array.isArray(body.knownSpeakerIds) ? body.knownSpeakerIds : [];

    if (!meetingId || !audioPath) {
      return NextResponse.json({ error: "Thiếu meetingId hoặc audioPath." }, { status: 400 });
    }

    // RLS on meetings/storage blocks the shared anon client — use the caller's
    // session token (same pattern as /api/export-template).
    const supabaseToken = req.headers.get("x-supabase-auth");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const dbClient = (supabaseToken && supabaseUrl && supabaseAnonKey)
      ? createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: `Bearer ${supabaseToken}` } }
        })
      : supabase;

    // GATE GÓI DỊCH VỤ: module Biên bản họp mở từ gói Basic (lib/planShared.ts)
    const { data: planRow } = await dbClient
      .from("tenant_config").select("value").eq("key", "plan").maybeSingle();
    if (!isFeatureAllowed(normalizePlan(planRow?.value), "meeting_ai")) {
      return NextResponse.json({
        error: "Tính năng Biên bản họp AI chưa được mở cho gói dịch vụ hiện tại. Vui lòng liên hệ Quản trị viên để nâng cấp."
      }, { status: 403 });
    }

    // 1. Tải đoạn ghi âm từ Storage
    const { data: fileData, error: downloadError } = await dbClient.storage
      .from(MEETINGS_BUCKET)
      .download(audioPath);

    if (downloadError || !fileData) {
      console.error("Storage download error:", downloadError);
      return NextResponse.json(
        { error: `Không thể tải file ghi âm từ storage: ${downloadError?.message || "File rỗng"}` },
        { status: 500 }
      );
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());

    // Chặn sớm thay vì để OpenAI trả lỗi sau khi đã chờ upload xong: trần 25MB
    // áp cho MỌI model gỡ băng, không có endpoint nhận URL để lách.
    if (buffer.length > MAX_TRANSCRIBE_BYTES) {
      return NextResponse.json({
        error: `Đoạn ghi âm nặng ${(buffer.length / (1024 * 1024)).toFixed(1)}MB, vượt trần 25MB mỗi lần gọi API gỡ băng của OpenAI. Hãy cắt nhỏ file (dưới 20 phút mỗi đoạn) rồi tải lên lại.`
      }, { status: 400 });
    }

    // 2. Ghi ra file tạm để truyền stream cho OpenAI
    const ext = audioPath.split(".").pop() || "mp3";
    tempFilePath = path.join(os.tmpdir(), `temp_transcribe_${meetingId}_${Date.now()}.${ext}`);
    fs.writeFileSync(tempFilePath, buffer);

    // 3. Nạp mẫu giọng của những người đã đăng ký (tối đa 4, mỗi mẫu 2–10 giây).
    // Có mẫu giọng thì kết quả gọi thẳng tên thật, không có thì ra nhãn Speaker 1/2/3.
    const knownSpeakerNames: string[] = [];
    const knownSpeakerReferences: string[] = [];

    if (knownSpeakerIds.length > 0) {
      const { data: speakerRows } = await dbClient
        .from("employees_directory")
        .select("id, name, voice_sample_path")
        .in("id", knownSpeakerIds.slice(0, MAX_KNOWN_SPEAKERS));

      for (const row of speakerRows || []) {
        if (!row.voice_sample_path || !row.name) continue;
        const { data: sampleBlob } = await dbClient.storage
          .from(MEETINGS_BUCKET)
          .download(row.voice_sample_path);
        if (!sampleBlob) continue;
        const sampleBuffer = Buffer.from(await sampleBlob.arrayBuffer());
        const mime = row.voice_sample_path.endsWith(".webm") ? "audio/webm" : "audio/mpeg";
        knownSpeakerNames.push(row.name);
        knownSpeakerReferences.push(`data:${mime};base64,${sampleBuffer.toString("base64")}`);
      }
    }

    // 4. Gọi OpenAI
    const openai = new OpenAI({ apiKey });
    const fileStream = fs.createReadStream(tempFilePath);

    // KHÔNG truyền `prompt`: model diarization từ chối thẳng với
    // "400 Prompt is not supported for diarization models". Gợi ý từ vựng cho
    // AI nằm ở khâu dựng biên bản (/api/meeting/process).
    const params: any = {
      file: fileStream,
      model: TRANSCRIBE_MODEL,
      response_format: "diarized_json", // bắt buộc mới có speaker + start/end
      chunking_strategy: "auto",        // bắt buộc với audio dài hơn 30 giây
    };
    if (knownSpeakerNames.length > 0) {
      params.known_speaker_names = knownSpeakerNames;
      params.known_speaker_references = knownSpeakerReferences;
    }

    // Các tham số trên mới hơn type của openai@6.32.0 — ép kiểu, payload vẫn chuẩn.
    const transcription: any = await openai.audio.transcriptions.create(params as any);

    // 5. Quy mốc giờ của đoạn về trục thời gian CẢ cuộc họp
    const rawSegments: any[] = Array.isArray(transcription?.segments) ? transcription.segments : [];
    const segments: DiarizedSegment[] = rawSegments.map((s: any) => ({
      speaker: String(s.speaker || "Speaker ?"),
      start: Number(s.start || 0) + offsetSec,
      end: Number(s.end || 0) + offsetSec,
      text: String(s.text || "").trim(),
    })).filter(s => s.text.length > 0);

    const segmentText = segments.length > 0 ? segmentsToText(segments) : String(transcription?.text || "");
    const speakers = Array.from(new Set(segments.map(s => s.speaker)));

    // 6. Cảnh báo lặp vòng — CHỈ cảnh báo, nội dung luôn được giữ
    const hallucinationCheck = detectHallucination(segmentText);

    // 7. NỐI THÊM vào bản gỡ băng, KHÔNG ghi đè.
    // Cuộc họp 2 tiếng gồm 6 đoạn; ghi đè thì tiến trình chết giữa chừng chỉ còn
    // lại đoạn cuối cùng và phải gỡ băng lại từ đầu (tốn tiền API thật).
    const { data: current, error: readError } = await dbClient
      .from("meetings")
      .select("transcript_raw, transcript_segments")
      .eq("id", meetingId)
      .single();

    if (readError) {
      throw new Error(`Không đọc được biên bản để nối bản gỡ băng: ${readError.message}`);
    }

    const prevText = current?.transcript_raw || "";
    const prevSegments: DiarizedSegment[] = Array.isArray(current?.transcript_segments)
      ? current.transcript_segments
      : [];

    const mergedText = prevText ? `${prevText}\n\n${segmentText}` : segmentText;
    const mergedSegments = [...prevSegments, ...segments];

    const { data: updatedRows, error: dbError } = await dbClient
      .from("meetings")
      .update({
        transcript_raw: mergedText,
        transcript_segments: mergedSegments,
      })
      .eq("id", meetingId)
      .select("id");

    if (dbError) {
      throw new Error(`Lỗi cập nhật CSDL: ${dbError.message}`);
    }
    // RLS chặn UPDATE thì Supabase trả 0 dòng mà KHÔNG báo lỗi — phải bắt tường
    // minh, nếu không client tưởng đã lưu trong khi bản gỡ băng rơi mất.
    if (!updatedRows || updatedRows.length === 0) {
      throw new Error("Không lưu được bản gỡ băng (bị chặn bởi quyền truy cập CSDL). Vui lòng đăng nhập lại và thử lần nữa.");
    }

    return NextResponse.json({
      success: true,
      text: segmentText,
      segments,
      speakers,
      known_speakers_used: knownSpeakerNames,
      is_hallucination: hallucinationCheck.isHallucination,
      hallucination_warning: hallucinationCheck.warning,
    });
  } catch (err: any) {
    console.error("Transcription API Error:", err);
    return NextResponse.json({ error: err.message || "Lỗi xử lý file âm thanh" }, { status: 500 });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupErr) {
        console.error("Temp file cleanup error:", cleanupErr);
      }
    }
  }
}
