// ============================================================
// paymentDossiers.ts — Hồ sơ thanh toán (module Kế toán)
//
// Gom toàn bộ kiểu dữ liệu + tiện ích + truy vấn Supabase cho bảng
// public.payment_dossiers (migration 068). Trang /ke-toan/ho-so-thanh-toan chỉ
// việc gọi các hàm ở đây, giữ page mỏng.
//
// AI trả về object 11 key TIẾNG VIỆT (đúng như prompt trong route
// /api/analyze-payment-dossier). buildRowFromAi() map sang cột snake_case.
// ============================================================

import { supabase } from "./supabase";

// ─── 11 trường AI trả về (key tiếng Việt, khớp prompt) ───
export interface PaymentDossierAi {
  "Ngày đề nghị"?: string;
  "Người nhận tiền"?: string;
  "Nội dung thanh toán"?: string;
  "Số tiền đề nghị thanh toán"?: string; // chỉ chữ số, vd "7900000"
  "Dự án"?: string;
  "Người đề nghị thanh toán"?: string;
  "Đơn vị công tác"?: string;
  "Số tài khoản"?: string;
  "Tại Ngân hàng"?: string;
  "Hạn Thanh toán"?: string;
  "Danh mục hs kèm theo"?: string;
}

// ─── Hàng trong bảng payment_dossiers (snake_case) ───
export interface PaymentDossierRow {
  id: number;
  stt: number | null;
  ngay_nhap: string | null;
  ngay_de_nghi: string | null;
  nguoi_nhan_tien: string | null;
  noi_dung_tt: string | null;
  so_tien_de_nghi: string | null;
  so_tien_de_nghi_num: number | null;
  du_an: string | null;
  nguoi_de_nghi_tt: string | null;
  don_vi_cong_tac: string | null;
  so_tai_khoan: string | null;
  tai_ngan_hang: string | null;
  so_tien_chuyen: string | null;
  han_thanh_toan: string | null;
  ngay_chuyen: string | null;
  con_lai: string | null;
  con_lai_num: number | null; // = so_tien_de_nghi_num - so_tien_chuyen (DB tính sẵn)
  ten_file_pdf: string | null;
  danh_muc_hs: string | null;
  ghi_chu: string | null;
  validation_scores: Record<string, number> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Bản nháp (chưa lưu) — dùng ở bảng xem trước sau khi AI bóc, cho sửa tay.
export type PaymentDossierDraft = {
  ngay_de_nghi: string;
  nguoi_nhan_tien: string;
  noi_dung_tt: string;
  so_tien_de_nghi: string; // đã format "7.900.000"
  du_an: string;
  nguoi_de_nghi_tt: string;
  don_vi_cong_tac: string;
  so_tai_khoan: string;
  tai_ngan_hang: string;
  so_tien_chuyen: string; // kế toán có thể điền sẵn khi soát
  han_thanh_toan: string;
  con_lai: string;        // kế toán có thể điền sẵn khi soát
  danh_muc_hs: string;
  ghi_chu: string;
  ten_file_pdf: string;
  validation_scores: Record<string, number>;
};

// ─── Tiện ích chuẩn hoá (bê nguyên logic bản gốc) ───

// Chuẩn hoá ngày tiếng Việt -> DD/MM/YYYY
export function normalizeDate(raw?: string): string {
  const v = (raw || "").trim();
  if (!v || v === "N/A") return v;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return v;
  const slash = v.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})/);
  if (slash) {
    const d = slash[1].padStart(2, "0");
    const m = slash[2].padStart(2, "0");
    const y = slash[3].length === 2 ? "20" + slash[3] : slash[3];
    return `${d}/${m}/${y}`;
  }
  const vi = v.match(/(?:ng[àa]y\s+(\d{1,2})\s+)?[Tt]h[àa]ng\s+(\d{1,2})\s+[Nn]ă[mn]\s+(\d{4})/);
  if (vi) {
    const d = vi[1] ? vi[1].padStart(2, "0") : "01";
    const m = vi[2].padStart(2, "0");
    return `${d}/${m}/${vi[3]}`;
  }
  return v;
}

// "7900000" -> "7.900.000"
export function formatMoney(val?: string | number): string {
  const s = String(val ?? "");
  if (!s || s === "N/A") return s;
  const num = s.replace(/[^0-9]/g, "");
  return num ? num.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : s;
}

// Chuỗi tiền -> số thuần (hoặc null)
export function moneyToNumber(val?: string | number): number | null {
  const num = String(val ?? "").replace(/[^0-9]/g, "");
  return num ? Number(num) : null;
}

// "Còn lại" = Số tiền đề nghị - Số tiền chuyển.
// Số tiền đề nghị trống -> trả rỗng (giữ nguyên, không tính). Số tiền chuyển
// trống coi như 0. Trả cả chuỗi hiển thị lẫn số để lọc "Tồn đề nghị".
export function computeConLai(
  soTien?: string | number,
  soTienChuyen?: string | number
): { text: string; num: number | null } {
  const de = moneyToNumber(soTien);
  if (de == null) return { text: "", num: null };
  const chuyen = moneyToNumber(soTienChuyen) || 0;
  const remain = de - chuyen;
  const text = remain < 0 ? "-" + formatMoney(String(Math.abs(remain))) : formatMoney(String(remain));
  return { text, num: remain };
}

// Ngày hôm nay theo giờ VN, dạng DD/MM/YYYY
export function todayVN(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("day")}/${get("month")}/${get("year")}`;
}

// ─── AI object (11 key VN) -> bản nháp có thể sửa tay ───
export function draftFromAi(ai: PaymentDossierAi, fileName: string, scores?: Record<string, number>): PaymentDossierDraft {
  return {
    ngay_de_nghi: normalizeDate(ai["Ngày đề nghị"] || ""),
    nguoi_nhan_tien: ai["Người nhận tiền"] || "",
    noi_dung_tt: ai["Nội dung thanh toán"] || "",
    so_tien_de_nghi: formatMoney(ai["Số tiền đề nghị thanh toán"] || ""),
    du_an: ai["Dự án"] || "",
    nguoi_de_nghi_tt: ai["Người đề nghị thanh toán"] || "",
    don_vi_cong_tac: ai["Đơn vị công tác"] || "",
    so_tai_khoan: ai["Số tài khoản"] || "",
    tai_ngan_hang: ai["Tại Ngân hàng"] || "",
    so_tien_chuyen: "",
    han_thanh_toan: ai["Hạn Thanh toán"] && ai["Hạn Thanh toán"] !== "N/A" ? normalizeDate(ai["Hạn Thanh toán"]) : (ai["Hạn Thanh toán"] || ""),
    con_lai: "",
    danh_muc_hs: ai["Danh mục hs kèm theo"] || "",
    ghi_chu: "",
    ten_file_pdf: fileName,
    validation_scores: scores || {},
  };
}

// ─── Bản nháp -> hàng insert vào Supabase ───
export function rowFromDraft(d: PaymentDossierDraft, createdBy?: string) {
  return {
    ngay_nhap: todayVN(),
    ngay_de_nghi: d.ngay_de_nghi || null,
    nguoi_nhan_tien: d.nguoi_nhan_tien || null,
    noi_dung_tt: d.noi_dung_tt || null,
    so_tien_de_nghi: formatMoney(d.so_tien_de_nghi) || null,
    so_tien_de_nghi_num: moneyToNumber(d.so_tien_de_nghi),
    du_an: d.du_an || null,
    nguoi_de_nghi_tt: d.nguoi_de_nghi_tt || null,
    don_vi_cong_tac: d.don_vi_cong_tac || null,
    so_tai_khoan: d.so_tai_khoan || null,
    tai_ngan_hang: d.tai_ngan_hang || null,
    so_tien_chuyen: d.so_tien_chuyen ? formatMoney(d.so_tien_chuyen) : null,
    han_thanh_toan: d.han_thanh_toan || null,
    ngay_chuyen: null,
    // "Còn lại" luôn TÍNH THEO CÔNG THỨC = Số tiền - Số tiền chuyển.
    con_lai: computeConLai(d.so_tien_de_nghi, d.so_tien_chuyen).text || null,
    ten_file_pdf: d.ten_file_pdf || null,
    danh_muc_hs: d.danh_muc_hs || null,
    ghi_chu: d.ghi_chu || null,
    validation_scores: d.validation_scores || {},
    created_by: createdBy || null,
  };
}

// ─── Truy vấn ───
export async function fetchDossiers(tonDeNghiOnly = false): Promise<PaymentDossierRow[]> {
  const table = tonDeNghiOnly ? "payment_dossiers_ton_de_nghi" : "payment_dossiers";
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as PaymentDossierRow[];
}

export async function insertDrafts(drafts: PaymentDossierDraft[], createdBy?: string): Promise<void> {
  if (drafts.length === 0) return;
  const rows = drafts.map((d) => rowFromDraft(d, createdBy));
  const { error } = await supabase.from("payment_dossiers").insert(rows);
  if (error) throw error;
}

// Cập nhật một dòng (kế toán sửa tay). Giữ so_tien_de_nghi_num đồng bộ nếu đổi tiền.
export async function updateDossier(id: number, patch: Partial<PaymentDossierRow>): Promise<void> {
  const clean: Record<string, unknown> = { ...patch };
  if (typeof patch.so_tien_de_nghi === "string") {
    clean.so_tien_de_nghi = formatMoney(patch.so_tien_de_nghi);
    clean.so_tien_de_nghi_num = moneyToNumber(patch.so_tien_de_nghi);
  }
  if (typeof patch.so_tien_chuyen === "string") {
    clean.so_tien_chuyen = patch.so_tien_chuyen ? formatMoney(patch.so_tien_chuyen) : null;
  }
  // "Còn lại" tính lại theo công thức mỗi khi sửa Số tiền / Số tiền chuyển.
  if ("so_tien_de_nghi" in patch || "so_tien_chuyen" in patch) {
    clean.con_lai = computeConLai(patch.so_tien_de_nghi ?? undefined, patch.so_tien_chuyen ?? undefined).text || null;
  }
  delete clean.id;
  delete clean.created_at;
  delete clean.updated_at;
  delete clean.con_lai_num; // cột tính sẵn, không được ghi tay
  const { error } = await supabase.from("payment_dossiers").update(clean).eq("id", id);
  if (error) throw error;
}

export async function deleteDossier(id: number): Promise<void> {
  const { error } = await supabase.from("payment_dossiers").delete().eq("id", id);
  if (error) throw error;
}
