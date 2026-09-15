import { supabase } from "@/lib/supabase";
import { MEETINGS_BUCKET } from "@/lib/meetingModels";

// ============================================================
// LINK FILE CỦA MODULE BIÊN BẢN HỌP
//
// Từ migration 078 bucket `meetings` là PRIVATE: link dạng
// /object/public/meetings/... không còn mở được. Mọi chỗ cần nghe lại ghi âm
// hay tải file Word phải đi qua `signMeetingFile()`.
//
// VÌ SAO CẦN `meetingPathFromRef`: cột `audio_url` và `document_url` trong CSDL
// đang chứa HAI dạng giá trị khác nhau —
//   • dòng cũ  : URL public đầy đủ, có khi kèm ?v=... chống cache CDN
//   • dòng mới : đường dẫn trần trong kho (recordings/…/part_000.webm)
// Hàm này quy cả hai về đường dẫn trần, nhờ vậy không phải đi sửa dữ liệu cũ.
// ============================================================

/** Link ký sống 1 giờ — đủ cho một buổi ngồi soát biên bản mà không phải ký lại. */
export const MEETING_SIGNED_TTL = 60 * 60;

/** Quy một URL public kiểu cũ (hoặc một đường dẫn trần) về đường dẫn trong kho. */
export function meetingPathFromRef(ref: string | null | undefined): string {
  const raw = (ref || "").trim();
  if (!raw) return "";
  const clean = raw.split("?")[0];
  const marker = `/${MEETINGS_BUCKET}/`;
  const at = clean.indexOf(marker);
  if (at === -1) return clean.replace(/^\/+/, "");   // vốn đã là đường dẫn trần
  return clean.substring(at + marker.length);
}

/**
 * Ký link xem/tải một file của cuộc họp.
 * Ném lỗi có chữ tiếng Việt thay vì trả rỗng: chỗ gọi đều là thao tác người dùng
 * vừa bấm, im lặng không làm gì sẽ khiến họ tưởng phần mềm treo.
 */
export async function signMeetingFile(
  ref: string | null | undefined,
  ttl: number = MEETING_SIGNED_TTL,
): Promise<string> {
  const path = meetingPathFromRef(ref);
  if (!path) throw new Error("Biên bản này không còn đường dẫn file trong kho.");

  const { data, error } = await supabase.storage
    .from(MEETINGS_BUCKET)
    .createSignedUrl(path, ttl);

  if (error || !data?.signedUrl) {
    const msg = error?.message || "không rõ nguyên nhân";
    const hint = /not found|does not exist/i.test(msg)
      ? " — file đã bị xoá khỏi kho."
      : /row-level security|policy|unauthorized|403/i.test(msg)
      ? " — file này thuộc về tài khoản khác. Từ 15/09/2026 mỗi tài khoản chỉ mở được ghi âm của chính mình (Admin xem được tất cả)."
      : "";
    throw new Error(`Không mở được file: ${msg}${hint}`);
  }
  return data.signedUrl;
}
