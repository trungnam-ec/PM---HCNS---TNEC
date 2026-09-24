// ============================================================
// projectFiles — tệp đính kèm của "Vị trí dự án" (bucket riêng tư
// `project-files`, migration 095). Mỗi Ban điều hành đúng MỘT tệp ảnh/PDF,
// lưu ở cột project_locations.attachment_path + attachment_name.
// ============================================================

import { supabase } from "./supabase";

export const PROJECT_FILES_BUCKET = "project-files";

/** Hạn link ký (giây) — 7 ngày, đồng bộ với task-files. */
const SIGNED_TTL = 7 * 24 * 60 * 60;

/** 10MB — trùng đúng file_size_limit đặt cho bucket ở migration 095. */
export const PROJECT_FILE_MAX_BYTES = 10 * 1024 * 1024;

export function isAllowedProjectFile(file: File): boolean {
  return file.type === "application/pdf" || file.type.startsWith("image/");
}

function safeName(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${clean}`;
}

/** Tải tệp lên kho. Ném lỗi kèm gợi ý xử lý. Trả về đường dẫn trong kho. */
export async function uploadProjectFile(file: File): Promise<string> {
  if (!isAllowedProjectFile(file)) {
    throw new Error(`"${file.name}" không phải ảnh hoặc PDF — chỉ nhận hai loại này.`);
  }
  if (file.size > PROJECT_FILE_MAX_BYTES) {
    throw new Error(`"${file.name}" vượt mức 10MB cho phép.`);
  }

  const path = safeName(file.name);
  const { error } = await supabase.storage
    .from(PROJECT_FILES_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });

  if (error) {
    const hint = /bucket not found/i.test(error.message)
      ? ` — chưa có kho "${PROJECT_FILES_BUCKET}". Chạy migrations/095_project_location_sheet_and_file.sql trong Supabase > SQL Editor.`
      : /row-level security|policy/i.test(error.message)
      ? " — tài khoản chưa có quyền tải tệp lên kho vị trí dự án."
      : /exceeded the maximum allowed size|payload too large/i.test(error.message)
      ? " — tệp vượt mức 10MB."
      : "";
    throw new Error(`Không tải lên được "${file.name}": ${error.message}${hint}`);
  }
  return path;
}

/** Ký link xem/tải. Trả null khi không ký được (hết quyền, tệp đã bị xoá). */
export async function resolveProjectFileUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(PROJECT_FILES_BUCKET)
    .createSignedUrl(path, SIGNED_TTL);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Xoá tệp khỏi kho. Chỉ gọi SAU khi CSDL đã thôi trỏ vào tệp (ghi CSDL trước). */
export async function removeProjectFile(path: string): Promise<void> {
  try {
    await supabase.storage.from(PROJECT_FILES_BUCKET).remove([path]);
  } catch {
    // không chặn luồng chính
  }
}
