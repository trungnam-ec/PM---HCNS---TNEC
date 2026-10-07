"use client";

// ============================================================
// Khấu trừ xử phạt — P.ATLĐ nhập đầu vào, P.KHĐT nhập đầu ra (migration 139).
// Thay bảng Excel "BẢNG THEO DÕI HỒ SƠ KHẤU TRỪ - XỬ PHẠT VI PHẠM AN TOÀN".
// Giá trị còn lại là cột sinh sẵn ở CSDL; trạng thái / số ngày theo dõi / cảnh báo
// tính ở đây theo ngày hôm nay (giờ VN) nên không bao giờ lệch như công thức Excel.
// Chặn từng cột theo phòng nằm ở trigger CSDL — giao diện chỉ khoá ô cho dễ hiểu.
// ============================================================

import { supabase } from "./supabase";
import { atldErrorMessage } from "./atldStock";

export const PENALTY_TYPES = ["Xử phạt vi phạm an toàn", "Khấu trừ cấp phát BHLĐ"];

export type Penalty = {
  id: string;
  ma_ho_so: string;
  loai_ho_so: string;
  so_quyet_dinh: string | null;
  qd_file_path: string | null;
  qd_file_name: string | null;
  qd_link: string | null;
  ngay_ban_hanh: string | null;
  project_code: string | null;
  project_name: string | null;
  contractor_id: string | null;
  contractor_name: string;
  noi_dung: string | null;
  gia_tri_phai_tru: number;
  nguoi_lap: string | null;
  ngay_gui_khdt: string | null;
  ngay_tiep_nhan: string | null;
  dot_thanh_toan: string | null;
  gia_tri_da_tru: number;
  ngay_khau_tru: string | null;
  so_chung_tu: string | null;
  nguoi_nhap: string | null;
  ghi_chu: string | null;
  // Tệp / link của Số chứng từ (P.KHĐT, migration 141)
  ct_file_path?: string | null;
  ct_file_name?: string | null;
  ct_link?: string | null;
  gia_tri_con_lai: number;
  created_at: string;
};

// Cột P.ATLĐ / P.KHĐT — form chỉ gửi nhóm cột người dùng được sửa.
export type PenaltyInput = Pick<
  Penalty,
  | "loai_ho_so" | "so_quyet_dinh" | "qd_link" | "ngay_ban_hanh" | "project_code" | "project_name"
  | "contractor_id" | "contractor_name" | "noi_dung" | "gia_tri_phai_tru" | "nguoi_lap" | "ngay_gui_khdt"
>;
export type PenaltyOutput = Pick<
  Penalty,
  "ngay_tiep_nhan" | "dot_thanh_toan" | "gia_tri_da_tru" | "ngay_khau_tru" | "so_chung_tu" | "nguoi_nhap" | "ghi_chu" | "ct_link"
>;

// Hai loại tài liệu đính kèm: Số QĐ (P.ATLĐ) và Số chứng từ (P.KHĐT).
export type PenaltyDoc = "qd" | "ct";
export const DOC_LABEL: Record<PenaltyDoc, string> = { qd: "Số QĐ", ct: "Số chứng từ" };
export function docOf(p: Penalty, kind: PenaltyDoc): { no: string | null; path: string | null; name: string | null; link: string | null } {
  return kind === "qd"
    ? { no: p.so_quyet_dinh, path: p.qd_file_path, name: p.qd_file_name, link: p.qd_link }
    : { no: p.so_chung_tu, path: p.ct_file_path ?? null, name: p.ct_file_name ?? null, link: p.ct_link ?? null };
}

export type PenaltyAccess = { view: boolean; input: boolean; process: boolean; stock: boolean };
export const NO_PENALTY_ACCESS: PenaltyAccess = { view: false, input: false, process: false, stock: false };

export async function fetchPenaltyAccess(): Promise<PenaltyAccess> {
  const { data, error } = await supabase.rpc("atld_penalty_my_access");
  if (error || !data) return NO_PENALTY_ACCESS;
  const d = data as Partial<PenaltyAccess>;
  return { view: !!d.view, input: !!d.input, process: !!d.process, stock: !!d.stock };
}

export async function fetchPenalties(): Promise<{ rows: Penalty[]; error: string | null }> {
  const { data, error } = await supabase.from("atld_penalties").select("*").order("nam", { ascending: false }).order("seq", { ascending: false });
  if (error) {
    const missing = /atld_penalties/i.test(error.message || "") && /find|exist/i.test(error.message || "");
    return { rows: [], error: missing ? "Chưa chạy migration 139 (khấu trừ xử phạt) trong Supabase > SQL Editor." : atldErrorMessage(error) };
  }
  return {
    rows: ((data as Penalty[]) || []).map((r) => ({
      ...r,
      gia_tri_phai_tru: Number(r.gia_tri_phai_tru) || 0,
      gia_tri_da_tru: Number(r.gia_tri_da_tru) || 0,
      gia_tri_con_lai: Number(r.gia_tri_con_lai) || 0,
    })),
    error: null,
  };
}

const clean = (s: string | null | undefined) => {
  const t = (s ?? "").trim().replace(/\s+/g, " ");
  return t === "" ? null : t;
};

function cleanInput(v: PenaltyInput) {
  return {
    loai_ho_so: clean(v.loai_ho_so) || PENALTY_TYPES[0],
    so_quyet_dinh: clean(v.so_quyet_dinh),
    qd_link: clean(v.qd_link),
    ngay_ban_hanh: v.ngay_ban_hanh || null,
    project_code: clean(v.project_code),
    project_name: clean(v.project_name),
    contractor_id: v.contractor_id || null,
    contractor_name: clean(v.contractor_name) || "",
    noi_dung: (v.noi_dung ?? "").trim() || null,
    gia_tri_phai_tru: Math.max(0, Math.round(Number(v.gia_tri_phai_tru) || 0)),
    nguoi_lap: clean(v.nguoi_lap),
    ngay_gui_khdt: v.ngay_gui_khdt || null,
  };
}

function cleanOutput(v: PenaltyOutput) {
  return {
    ngay_tiep_nhan: v.ngay_tiep_nhan || null,
    dot_thanh_toan: clean(v.dot_thanh_toan),
    gia_tri_da_tru: Math.max(0, Math.round(Number(v.gia_tri_da_tru) || 0)),
    ngay_khau_tru: v.ngay_khau_tru || null,
    so_chung_tu: clean(v.so_chung_tu),
    nguoi_nhap: clean(v.nguoi_nhap),
    ghi_chu: (v.ghi_chu ?? "").trim() || null,
    ct_link: clean(v.ct_link),
  };
}

function penaltyError(err: { message?: string; code?: string } | null): string {
  const m = err?.message || "";
  if (/atld_penalties_da_tru_le_phai_tru/i.test(m)) return "Giá trị đã khấu trừ không được lớn hơn giá trị phải khấu trừ.";
  if (/ct_link|ct_file/i.test(m) && /column|find/i.test(m)) return "Chưa chạy migration 141 (tệp số chứng từ) trong Supabase > SQL Editor.";
  return atldErrorMessage(err);
}

export async function createPenalty(input: PenaltyInput, output: PenaltyOutput | null): Promise<{ id: string | null; error: string | null }> {
  const row = { ...cleanInput(input), ...(output ? cleanOutput(output) : {}) };
  const { data, error } = await supabase.from("atld_penalties").insert(row).select("id");
  if (error) return { id: null, error: penaltyError(error) };
  const id = (data as { id: string }[] | null)?.[0]?.id || null;
  return id ? { id, error: null } : { id: null, error: "Không tạo được — tài khoản chưa có quyền nhập hồ sơ xử phạt (P.ATLĐ)." };
}

export async function updatePenalty(id: string, input: PenaltyInput | null, output: PenaltyOutput | null): Promise<string | null> {
  const row = { ...(input ? cleanInput(input) : {}), ...(output ? cleanOutput(output) : {}) };
  const { data, error } = await supabase.from("atld_penalties").update(row).eq("id", id).select("id");
  if (error) return penaltyError(error);
  // RLS chặn UPDATE thì trả 0 dòng chứ không báo lỗi.
  if (!data || (data as unknown[]).length === 0) return "Không lưu được — tài khoản chưa có quyền với hồ sơ này.";
  return null;
}

export async function deletePenalty(id: string): Promise<string | null> {
  const { data, error } = await supabase.from("atld_penalties").delete().eq("id", id).select("id");
  if (error) return penaltyError(error);
  if (!data || (data as unknown[]).length === 0) return "Không xoá được — chỉ P.ATLĐ (cờ nhập hồ sơ xử phạt) và Admin xoá được.";
  return null;
}

// ─── Tệp đính kèm (bucket atld-penalty): QĐ ở "<id>/…", chứng từ KHĐT ở "<id>/ct/…" ───
// Thứ tự an toàn: tải tệp mới -> ghi CSDL -> xoá tệp cũ.
export const PENALTY_BUCKET = "atld-penalty";
const MAX_BYTES = 2 * 1024 * 1024;

export async function uploadPenaltyFile(penaltyId: string, file: File, kind: PenaltyDoc = "qd"): Promise<{ path: string; name: string }> {
  if (!(file.type === "application/pdf" || file.type.startsWith("image/"))) {
    throw new Error(`"${file.name}" không phải ảnh hoặc PDF — chỉ nhận hai loại này.`);
  }
  if (file.size > MAX_BYTES) throw new Error(`"${file.name}" vượt 2MB — hãy tải lên Drive rồi dán link.`);
  const path = `${penaltyId}/${kind === "ct" ? "ct/" : ""}${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const { error } = await supabase.storage.from(PENALTY_BUCKET).upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
  if (error) {
    const hint = /bucket not found/i.test(error.message)
      ? " — chưa có kho tệp. Chạy migrations/139_atld_penalties.sql trong Supabase > SQL Editor."
      : /row-level security|policy/i.test(error.message)
      ? kind === "ct"
        ? " — tài khoản chưa có quyền xử lý khấu trừ (P.KHĐT), hoặc chưa chạy migration 141."
        : " — tài khoản chưa có quyền nhập hồ sơ xử phạt (P.ATLĐ)."
      : "";
    throw new Error(`Không tải lên được "${file.name}": ${error.message}${hint}`);
  }
  return { path, name: file.name };
}

export async function setPenaltyFile(id: string, path: string | null, name: string | null, kind: PenaltyDoc = "qd"): Promise<string | null> {
  const patch = kind === "ct" ? { ct_file_path: path, ct_file_name: name } : { qd_file_path: path, qd_file_name: name };
  const { data, error } = await supabase.from("atld_penalties").update(patch).eq("id", id).select("id");
  if (error) return penaltyError(error);
  if (!data || (data as unknown[]).length === 0) return "Không lưu được tệp — tài khoản chưa có quyền với hồ sơ này.";
  return null;
}

export async function removePenaltyFile(path: string): Promise<void> {
  try {
    await supabase.storage.from(PENALTY_BUCKET).remove([path]);
  } catch {
    // tệp mồ côi không ảnh hưởng ai
  }
}

// downloadName: link tải thẳng về máy (đặt đúng tên tệp gốc) thay vì mở xem.
export async function penaltyFileUrl(path: string, downloadName?: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(PENALTY_BUCKET)
    .createSignedUrl(path, 60 * 60, downloadName ? { download: downloadName } : undefined);
  return error || !data ? null : data.signedUrl;
}

export async function setPenaltyLink(id: string, link: string | null, kind: PenaltyDoc = "qd"): Promise<string | null> {
  const patch = kind === "ct" ? { ct_link: link } : { qd_link: link };
  const { data, error } = await supabase.from("atld_penalties").update(patch).eq("id", id).select("id");
  if (error) return penaltyError(error);
  if (!data || (data as unknown[]).length === 0) return "Không lưu được — tài khoản chưa có quyền với hồ sơ này.";
  return null;
}

// ─── Tự tính: trạng thái, số ngày theo dõi, cảnh báo ───
export type PenaltyStatus = "chua" | "mot_phan" | "da";
export const PENALTY_STATUS_META: Record<PenaltyStatus, { label: string; cls: string }> = {
  chua: { label: "Chưa khấu trừ", cls: "bg-amber-50 text-amber-700 border border-amber-200" },
  mot_phan: { label: "Khấu trừ một phần", cls: "bg-blue-50 text-[#005BAC] border border-blue-200" },
  da: { label: "Đã khấu trừ", cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
};

export function penaltyStatus(p: Pick<Penalty, "gia_tri_con_lai" | "gia_tri_da_tru">): PenaltyStatus {
  if (p.gia_tri_con_lai <= 0) return "da";
  return p.gia_tri_da_tru > 0 ? "mot_phan" : "chua";
}

export function todayVN(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

// Số ngày kể từ ngày gửi thông tin cho KHĐT; đã khấu trừ xong thì thôi đếm.
export function trackingDays(p: Pick<Penalty, "ngay_gui_khdt" | "gia_tri_con_lai" | "gia_tri_da_tru">, today = todayVN()): number | null {
  if (!p.ngay_gui_khdt || penaltyStatus(p) === "da") return null;
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${p.ngay_gui_khdt}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86400000));
}

// 20–30 ngày: cam (sắp quá hạn); trên 30 ngày: đỏ (quá hạn); đã khấu trừ: xanh lá.
export type PenaltyAlert = "qua_han" | "sap_qua_han" | "da" | null;
export function penaltyAlert(status: PenaltyStatus, days: number | null): PenaltyAlert {
  if (status === "da") return "da";
  if (days == null) return null;
  if (days > 30) return "qua_han";
  if (days >= 20) return "sap_qua_han";
  return null;
}
