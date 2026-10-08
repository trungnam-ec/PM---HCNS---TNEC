"use client";

// ============================================================
// Định mức xử phạt (migration 143) — Phụ lục 01 "Mức xử phạt" QĐ ATLD/QD/005.
// 3 tầng theo STT: "1" danh mục lớn → "1.1" nhóm → "1.1.1" hạng mục có tiền.
// Ra phiên bản QĐ mới thì upload Excel SỬA ĐÈ theo STT.
// ============================================================

import * as XLSX from "xlsx";
import { supabase } from "./supabase";
import { atldErrorMessage } from "./atldStock";

export type RateUnit = "lan" | "nguoi";
export const UNIT_LABEL: Record<RateUnit, string> = { lan: "đồng/lần", nguoi: "đồng/người" };

export type PenaltyRate = {
  id: string;
  code: string;
  noi_dung: string;
  don_vi: RateUnit | null;
  muc_1: number | null;
  muc_2: number | null;
  muc_3: number | null;
  ghi_chu: string | null;
};
export type PenaltyRateInput = Omit<PenaltyRate, "id">;

// Tầng 1/2/3 = số đoạn của STT.
export const rateLevel = (code: string) => code.split(".").length;

// "1.1.1." / " 1.1 " -> "1.1.1" / "1.1"; sai dạng (chữ, quá 3 tầng) -> null.
export function normalizeCode(v: unknown): string | null {
  const s = String(v ?? "").trim().replace(/\s+/g, "").replace(/\.+$/, "");
  return /^\d+(\.\d+){0,2}$/.test(s) ? s.split(".").map((p) => String(Number(p))).join(".") : null;
}

// Sắp theo từng đoạn số: 1.1.2 < 1.1.10 < 1.2 < 2.
export function compareCode(a: string, b: string): number {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

function rateError(err: { message?: string } | null): string {
  const m = err?.message || "";
  if (/atld_penalty_rates/i.test(m) && /does not exist|Could not find/i.test(m)) {
    return "Chưa chạy migration 143 (Định mức xử phạt) trong Supabase > SQL Editor.";
  }
  if (/duplicate key|unique/i.test(m)) return "STT này đã có trong bảng định mức.";
  if (/code_check|violates check constraint.*code/i.test(m)) return "STT sai dạng — chỉ 1, 1.1 hoặc 1.1.1 (tối đa 3 tầng).";
  if (/row-level security/i.test(m)) return "Tài khoản chưa có cờ Khấu trừ xử phạt — P.ATLĐ nhập.";
  return atldErrorMessage(err);
}

export async function fetchRates(): Promise<{ rows: PenaltyRate[]; error: string | null }> {
  const { data, error } = await supabase.from("atld_penalty_rates").select("id, code, noi_dung, don_vi, muc_1, muc_2, muc_3, ghi_chu");
  if (error) return { rows: [], error: rateError(error) };
  const rows = (data || []).map((r) => ({
    ...(r as PenaltyRate),
    muc_1: r.muc_1 == null ? null : Number(r.muc_1),
    muc_2: r.muc_2 == null ? null : Number(r.muc_2),
    muc_3: r.muc_3 == null ? null : Number(r.muc_3),
  }));
  return { rows: rows.sort((a, b) => compareCode(a.code, b.code)), error: null };
}

export async function saveRate(id: string | null, input: PenaltyRateInput): Promise<string | null> {
  const q = id
    ? supabase.from("atld_penalty_rates").update(input).eq("id", id).select("id")
    : supabase.from("atld_penalty_rates").insert(input).select("id");
  const { data, error } = await q;
  if (error) return rateError(error);
  // RLS chặn thì trả 0 dòng chứ không báo lỗi.
  if (!data || data.length === 0) return "Không lưu được — tài khoản chưa có cờ Khấu trừ xử phạt — P.ATLĐ nhập.";
  return null;
}

export async function deleteRate(id: string): Promise<string | null> {
  const { data, error } = await supabase.from("atld_penalty_rates").delete().eq("id", id).select("id");
  if (error) return rateError(error);
  if (!data || data.length === 0) return "Không xoá được — xoá thẳng cần cờ P.ATLĐ nhập kèm cờ Duyệt xuất kho ATLĐ, hoặc Admin.";
  return null;
}

// Upload Excel: sửa đè theo STT (có thì cập nhật, chưa có thì thêm).
export async function upsertRates(rows: PenaltyRateInput[]): Promise<string | null> {
  const { error } = await supabase.from("atld_penalty_rates").upsert(rows, { onConflict: "code" });
  return error ? rateError(error) : null;
}

// ─── Excel ───
const fold = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/\s+/g, " ").trim();

// "3.000.000 đồng/lần" / 3000000 -> 3000000; trống -> null; chữ không có số -> NaN.
function parseMoney(v: unknown): number | null {
  if (v == null || String(v).trim() === "") return null;
  if (typeof v === "number") return Math.round(v);
  const digits = String(v).replace(/[^\d]/g, "");
  return digits ? Number(digits) : NaN;
}

function unitOf(...cells: unknown[]): RateUnit | null {
  const t = cells.map(fold).join(" ");
  if (/nguoi/.test(t)) return "nguoi";
  if (/lan/.test(t)) return "lan";
  return null;
}

export type ImportRate = PenaltyRateInput & { line: number; error: string; warn: string };

// Dò hàng tiêu đề trong 20 dòng đầu mọi sheet: cần cột STT + Nội dung + Lần 1.
// Đọc được cả bảng chép từ Phụ lục (tiêu đề 2 dòng, "3.000.000 đồng/lần" trong ô)
// lẫn file "Tải về" của tab này (có cột Đơn vị, tiền là số).
export function parseRateWorkbook(wb: XLSX.WorkBook): { sheet: string; rows: ImportRate[] } | null {
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });
    const col: Record<string, number> = {};
    let headerEnd = -1;
    for (let r = 0; r < Math.min(20, grid.length); r++) {
      (grid[r] || []).forEach((c, i) => {
        const t = fold(c);
        if (col.stt === undefined && /^stt$|^so tt$|^tt$/.test(t)) col.stt = i;
        else if (col.nd === undefined && /noi dung/.test(t)) col.nd = i;
        else if (col.l1 === undefined && /lan 1$/.test(t)) col.l1 = i;
        else if (col.l2 === undefined && /lan 2$/.test(t)) col.l2 = i;
        else if (col.l3 === undefined && /lan 3$/.test(t)) col.l3 = i;
        else if (col.dv === undefined && /^don vi/.test(t)) col.dv = i;
        else if (col.gc === undefined && /^ghi chu/.test(t)) col.gc = i;
        else return;
        headerEnd = Math.max(headerEnd, r);
      });
    }
    if (col.stt === undefined || col.nd === undefined || col.l1 === undefined) continue;

    const rows: ImportRate[] = [];
    const seen = new Set<string>();
    for (let r = headerEnd + 1; r < grid.length; r++) {
      const g = grid[r] || [];
      const cell = (k: string) => (col[k] === undefined ? null : g[col[k]]);
      let rawStt = cell("stt");
      let noiDung = String(cell("nd") ?? "").trim();
      // Dòng tiêu đề của Phụ lục gộp ô: "1.1. Vi phạm hồ sơ…" nằm hết trong cột STT.
      const merged = !noiDung && typeof rawStt === "string" ? rawStt.trim().match(/^(\d+(?:\.\d+)*)\.?\s+(.+)$/) : null;
      if (merged) {
        rawStt = merged[1];
        noiDung = merged[2].trim();
      }
      if ((rawStt == null || String(rawStt).trim() === "") && !noiDung) continue;
      const code = normalizeCode(rawStt);
      const m1 = parseMoney(cell("l1"));
      const m2 = parseMoney(cell("l2"));
      const m3 = parseMoney(cell("l3"));
      const hasMoney = m1 != null || m2 != null || m3 != null;
      let error = "";
      let warn = "";
      if (!code) error = rawStt == null || String(rawStt).trim() === "" ? "Thiếu STT" : `STT "${rawStt}" sai dạng (chỉ 1 / 1.1 / 1.1.1)`;
      else if (!noiDung) error = "Thiếu nội dung";
      else if (seen.has(code)) error = `Trùng STT ${code} trong file`;
      else if ([m1, m2, m3].some((x) => Number.isNaN(x))) error = "Ô mức phạt có chữ không đọc được số";
      if (!error && code) {
        seen.add(code);
        // Excel tự đổi "1.10" thành số 1.1 — nhắc định dạng cột STT là Text.
        if (typeof rawStt === "number" && code.includes(".")) warn = "STT là ô số — nếu là 1.10 thì Excel đã đổi thành 1.1, hãy định dạng cột STT là Text";
        else if (rateLevel(code) === 3 && !hasMoney) warn = "Hạng mục chưa có mức phạt";
        else if (rateLevel(code) < 3 && hasMoney) warn = "Dòng tiêu đề nhóm có tiền — vẫn lưu";
      }
      rows.push({
        line: r + 1,
        code: code || String(rawStt ?? ""),
        noi_dung: noiDung,
        don_vi: hasMoney ? unitOf(cell("dv"), cell("l1"), cell("l2"), cell("l3")) ?? "lan" : null,
        muc_1: Number.isNaN(m1) ? null : m1,
        muc_2: Number.isNaN(m2) ? null : m2,
        muc_3: Number.isNaN(m3) ? null : m3,
        ghi_chu: String(cell("gc") ?? "").trim() || null,
        error,
        warn,
      });
    }
    return { sheet: name, rows };
  }
  return null;
}

// Tải về = đúng mẫu upload (bảng rỗng thì thành file mẫu). STT ghi dạng chữ để
// Excel không đổi 1.10 thành 1.1.
export function exportRates(rows: PenaltyRate[]) {
  const header = ["STT", "Nội dung xử phạt", "Đơn vị (lần/người)", "Lần 1", "Lần 2", "Lần 3", "Ghi chú"];
  const body = rows.length
    ? rows.map((r) => [r.code, r.noi_dung, r.don_vi === "nguoi" ? "người" : r.don_vi === "lan" ? "lần" : "", r.muc_1 ?? "", r.muc_2 ?? "", r.muc_3 ?? "", r.ghi_chu || ""])
    : [
        ["1", "Vi phạm hồ sơ pháp lý", "", "", "", "", ""],
        ["1.1", "Vi phạm hồ sơ an toàn, vệ sinh lao động", "", "", "", "", ""],
        ["1.1.1", "Không lập kế hoạch tổng hợp an toàn", "lần", 3000000, 6000000, 12000000, ""],
        ["1.1.5", "Không lập danh sách nhân sự làm việc tại công trường", "người", 500000, 1000000, 2000000, ""],
      ];
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  for (let r = 1; r <= body.length; r++) {
    const c = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (c) {
      c.t = "s";
      c.v = String(c.v);
      c.z = "@";
    }
    for (let k = 3; k <= 5; k++) {
      const m = ws[XLSX.utils.encode_cell({ r, c: k })];
      if (m && m.t === "n") m.z = "#,##0";
    }
  }
  ws["!cols"] = [8, 60, 16, 14, 14, 14, 24].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dinh muc xu phat");
  XLSX.writeFile(wb, rows.length ? "Dinh_muc_xu_phat_ATLD.xlsx" : "Mau_dinh_muc_xu_phat_ATLD.xlsx");
}
