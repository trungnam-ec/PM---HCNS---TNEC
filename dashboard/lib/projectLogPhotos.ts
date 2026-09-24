// ============================================================
// projectLogPhotos — ảnh hiện trường của nhật ký sản lượng (bucket riêng tư
// `pc-log-photos`, migration 099). Đường dẫn LUÔN bắt đầu bằng "<project_id>/"
// vì policy của kho đọc thư mục đầu để biết ảnh thuộc dự án nào.
// ============================================================

import { supabase } from "./supabase";
import type { LogPhoto } from "./projectControl";

export const LOG_PHOTOS_BUCKET = "pc-log-photos";
export const LOG_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const SIGNED_TTL = 7 * 24 * 60 * 60;

export async function uploadLogPhoto(projectId: string, file: File): Promise<LogPhoto> {
  if (!file.type.startsWith("image/")) throw new Error(`"${file.name}" không phải ảnh.`);
  if (file.size > LOG_PHOTO_MAX_BYTES) throw new Error(`"${file.name}" vượt mức 2MB cho phép.`);
  const clean = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const path = `${projectId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${clean}`;
  const { error } = await supabase.storage
    .from(LOG_PHOTOS_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
  if (error) {
    const hint = /bucket not found/i.test(error.message)
      ? " — chưa có kho ảnh. Chạy migrations/099_project_control_block_c.sql."
      : /row-level security|policy/i.test(error.message)
      ? " — tài khoản chưa có quyền nhập nhật ký dự án này."
      : "";
    throw new Error(`Không tải lên được "${file.name}": ${error.message}${hint}`);
  }
  return { path, name: file.name };
}

// Chép 1 ảnh sang đường dẫn MỚI (cùng dự án) — dùng khi nhân đôi phiếu báo cáo ngày,
// để 2 phiếu không trỏ chung 1 tệp (xoá ảnh ở phiếu này sẽ không làm mất ảnh phiếu kia).
export async function copyLogPhoto(projectId: string, photo: LogPhoto): Promise<LogPhoto> {
  const clean = photo.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const path = `${projectId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${clean}`;
  const { error } = await supabase.storage.from(LOG_PHOTOS_BUCKET).copy(photo.path, path);
  if (error) throw new Error(`Không chép được ảnh "${photo.name}": ${error.message}`);
  return { path, name: photo.name };
}

export async function resolveLogPhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(LOG_PHOTOS_BUCKET).createSignedUrl(path, SIGNED_TTL);
  if (error || !data) return null;
  return data.signedUrl;
}

// Chỉ gọi SAU khi CSDL đã thôi trỏ vào ảnh (ghi CSDL trước rồi mới xoá tệp).
export async function removeLogPhotos(paths: string[]): Promise<void> {
  if (!paths.length) return;
  try {
    await supabase.storage.from(LOG_PHOTOS_BUCKET).remove(paths);
  } catch {
    // không chặn luồng chính
  }
}
