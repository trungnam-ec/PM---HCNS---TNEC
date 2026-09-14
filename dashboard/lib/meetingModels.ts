// ============================================================
// meetingModels.ts — hằng số dùng chung của module Biên bản họp
//
// Gom về một chỗ vì các con số này ràng buộc lẫn nhau: trần 25MB của OpenAI
// quyết định độ dài đoạn cắt, độ dài đoạn cắt lại phụ thuộc bitrate ghi âm.
// Sửa một chỗ mà quên chỗ kia là đúng 20 phút họp bị API từ chối.
// ============================================================

// ─── Model gỡ băng ───
// Bắt buộc dùng bản "diarize" thì mới có người nói + mốc giờ trong kết quả.
// LƯU Ý: model này KHÔNG nhận tham số `prompt` (API trả 400). Mọi gợi ý từ vựng
// phải đẩy sang khâu dựng biên bản.
export const TRANSCRIBE_MODEL = "gpt-4o-transcribe-diarize";

// ─── Model dựng biên bản ───
export const ANALYSIS_MODELS = [
  {
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol — chính xác nhất (mặc định)",
    hint: "Họp 1–2 tiếng, nhiều số liệu. ~$0.35/cuộc họp.",
  },
  {
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra — nhanh & rẻ hơn",
    hint: "Họp nội bộ ngắn, ít số liệu. ~$0.20/cuộc họp.",
  },
] as const;

export const DEFAULT_ANALYSIS_MODEL = "gpt-5.6-sol";

// Dòng 5.6 là model suy luận: KHÔNG truyền temperature, dùng reasoning_effort.
export const ANALYSIS_REASONING_EFFORT = "high";

// ─── Giới hạn của OpenAI ───
// 25MB mỗi lần gọi API gỡ băng, áp dụng cho MỌI model. Không có endpoint nhận
// URL hay chạy bất đồng bộ để lách.
export const MAX_TRANSCRIBE_BYTES = 25 * 1024 * 1024;

// Tối đa 4 mẫu giọng mỗi lần gọi, mỗi mẫu 2–10 giây.
export const MAX_KNOWN_SPEAKERS = 4;
export const VOICE_SAMPLE_MIN_SEC = 2;
export const VOICE_SAMPLE_MAX_SEC = 10;

// Mẫu giọng có thể là file ghi trong app (.webm) hoặc file sẵn người dùng tải
// lên (.mp3/.m4a/.wav...). Phải gửi ĐÚNG mime cho OpenAI trong data URL, đoán
// sai thì API từ chối file dù nội dung hợp lệ.
export const VOICE_SAMPLE_MIME: Record<string, string> = {
  webm: "audio/webm",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  mpeg: "audio/mpeg",
  m4a: "audio/m4a",
  mp4: "audio/mp4",
};

/** Suy mime từ đuôi file mẫu giọng; không nhận ra thì coi như mp3. */
export function voiceSampleMime(path: string): string {
  const ext = (path.split(".").pop() || "").toLowerCase();
  return VOICE_SAMPLE_MIME[ext] || "audio/mpeg";
}

// ─── Tham số ghi âm trong app ───
// opus mono 32kbps ≈ 240KB/phút -> chạm trần 25MB ở khoảng phút thứ 87.
//
// ĐỘ DÀI ĐOẠN KHÔNG DO DUNG LƯỢNG QUYẾT ĐỊNH, MÀ DO THỜI GIAN CHẠY:
// đo thật ngày 14/09/2026 — 80 giây tiếng mất 49 giây gỡ băng (≈ 0,61× thời
// lượng). Nền tảng serverless cắt hàm ở 300 giây, nên một đoạn 20 phút cần
// khoảng 570 giây là chết chắc: cổng cắt kết nối trước khi có phản hồi, trình
// duyệt báo "Failed to fetch" (đã xảy ra thật với đoạn 15:31).
//
// 5 phút tiếng ≈ 185 giây gỡ băng, cộng tải file lên xuống vẫn còn dư xa 300s.
// Nếu đổi model gỡ băng hoặc nâng trần thời gian chạy thì tính lại số này.
export const RECORD_AUDIO_BITRATE = 32000;
export const RECORD_SEGMENT_SEC = 5 * 60;

// ─── Bucket ───
export const MEETINGS_BUCKET = "meetings";

export type TimelineMode = "clock" | "relative" | "none";

/** Đổi số giây thành HH:MM:SS để hiển thị mốc trích dẫn. */
export function formatTs(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}
