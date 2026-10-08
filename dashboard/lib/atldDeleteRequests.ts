"use client";

// ============================================================
// Yêu cầu xoá chờ TP/PP duyệt (migration 142, user yêu cầu 08/10/2026).
// Thủ kho / NV nhập xử phạt bấm Xoá -> gửi yêu cầu; người có cờ "Duyệt xuất kho
// ATLĐ" nhận chuông, mở popup (trang /an-toan-lao-dong?delReq=<id>) rồi Xác nhận
// xoá hoặc Không xoá. Nội dung popup do CSDL chụp lúc gửi, không lấy từ client.
// ============================================================

import { supabase } from "./supabase";
import { atldErrorMessage } from "./atldStock";

export type DeleteKind = "item" | "issue" | "penalty";

export type DeleteRequest = {
  id: string;
  kind: DeleteKind;
  title: string;
  detail: { label: string; value: string | null; wide?: boolean }[];
  status: "pending" | "approved" | "rejected";
  requested_by: string;
  requested_by_name: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
};

export const DELETE_KIND_LABEL: Record<DeleteKind, string> = {
  item: "Mã SP — Tổng Danh mục kho",
  issue: "Phiếu xuất kho",
  penalty: "Hồ sơ khấu trừ xử phạt",
};

// Câu báo sau khi gửi — dùng chung cho 3 tab.
export const DELETE_REQUEST_SENT = "Đã gửi yêu cầu xoá. TP/PP có cờ \"Duyệt xuất kho ATLĐ\" xác nhận xong thì hệ thống mới xoá.";

function deleteRequestError(err: { message?: string } | null): string {
  if (/atld_request_delete|atld_decide_delete|atld_delete_requests/i.test(err?.message || "") &&
      /Could not find|does not exist/i.test(err?.message || "")) {
    return "Chưa chạy migration 142 (yêu cầu xoá chờ duyệt) trong Supabase > SQL Editor.";
  }
  return atldErrorMessage(err);
}

export async function requestDelete(kind: DeleteKind, targetId: string): Promise<string | null> {
  const { error } = await supabase.rpc("atld_request_delete", { p_kind: kind, p_target: targetId });
  return error ? deleteRequestError(error) : null;
}

export async function fetchDeleteRequest(id: string): Promise<{ row: DeleteRequest | null; error: string | null }> {
  const { data, error } = await supabase.from("atld_delete_requests").select("*").eq("id", id).maybeSingle();
  if (error) return { row: null, error: deleteRequestError(error) };
  if (!data) return { row: null, error: "Không tìm thấy yêu cầu xoá — hoặc tài khoản không có quyền xem." };
  return { row: data as DeleteRequest, error: null };
}

// Xác nhận xoá / không xoá. CSDL xoá xong mới dọn tệp trong Storage
// (Storage không chịu RLS của bảng — xem bẫy thứ tự ghi).
export async function decideDeleteRequest(id: string, approve: boolean): Promise<string | null> {
  const { data, error } = await supabase.rpc("atld_decide_delete", { p_id: id, p_approve: approve });
  if (error) return deleteRequestError(error);
  const files = ((data as { files?: { bucket: string; path: string }[] } | null)?.files) || [];
  for (const f of files) {
    try {
      await supabase.storage.from(f.bucket).remove([f.path]);
    } catch {
      // tệp mồ côi không ảnh hưởng ai
    }
  }
  return null;
}
