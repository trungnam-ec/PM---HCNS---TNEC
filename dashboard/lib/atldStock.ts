// ============================================================
// Kho BHLĐ — P. An toàn lao động (migration 116)
//
// Danh mục (Mã SP + Tên SP + Size SP), đối tác (NCC / nhà thầu), tồn kho.
// Chốt chặn thật nằm ở CSDL: RLS + 5 hàm atld_* (ghi sổ / gửi duyệt / duyệt /
// trả lại / huỷ). File này chỉ đọc-ghi qua Supabase và đổi lỗi thô sang câu dễ hiểu.
// ============================================================

import { supabase } from "./supabase";
import { normalizeName } from "./approvers";

export type AtldItem = {
  id: string;
  code: string;
  name: string;
  size: string | null;
  color: string | null;       // migration 118 — chọn từ COLOR_OPTIONS
  unit: string | null;
  min_stock: number;
  gia_nhap: number | null;    // migration 125 — giá tham khảo của danh mục, không vào sổ kho
  gia_ban: number | null;
  ncc: string | null;         // migration 127 — NCC/PVT gõ tay
  note: string | null;
  active: boolean;
  created_at: string;
};

// Từ migration 117 atld_partners chỉ còn NCC; nhà thầu lấy từ danh mục đối tác
// CHUNG của Hồ sơ trình ký (finance_partners) — xem AtldContractor bên dưới.
export type AtldPartnerKind = "ncc" | "nha_thau";

// Nhà thầu phụ trong danh mục chung (chỉ tên — không kèm MST / số tài khoản).
export type AtldContractor = { id: string; name: string; short_name: string | null };

export type AtldPartner = {
  id: string;
  kind: AtldPartnerKind;
  name: string;
  bdh_name: string | null;
  phone: string | null;
  address: string | null;
  note: string | null;
  active: boolean;
};

export const PARTNER_KIND_LABEL: Record<AtldPartnerKind, string> = {
  ncc: "Nhà cung cấp",
  nha_thau: "Nhà thầu nhận hàng",
};

// Đơn vị tính gợi ý sẵn (gõ đơn vị khác vẫn được).
export const UNIT_SUGGESTIONS = ["Bộ", "Cái", "Đôi", "Dây", "Chiếc", "Hộp", "Cuộn"];

// Màu sắc chọn từ dropdown (user chốt 02/10/2026). Thêm màu: sửa đúng mảng này
// — CSDL không đặt CHECK (migration 118).
export const COLOR_OPTIONS = ["Trắng", "Vàng", "Xanh", "Đỏ"];

export type StockLevel = "out" | "low" | "ok";

// Hết hàng: tồn <= 0. Dưới mức: tồn <= tồn tối thiểu (chỉ khi đã đặt mức > 0).
export function stockLevel(ton: number, minStock: number): StockLevel {
  if (ton <= 0) return "out";
  if (minStock > 0 && ton <= minStock) return "low";
  return "ok";
}

export const STOCK_LEVEL_META: Record<StockLevel, { label: string; cls: string }> = {
  out: { label: "Hết hàng", cls: "bg-rose-100 text-rose-700" },
  low: { label: "Dưới mức", cls: "bg-amber-100 text-amber-700" },
  ok: { label: "Đủ", cls: "bg-emerald-100 text-emerald-700" },
};

// ─── Tìm 1 dòng ───
// Gõ "giay 42" / "ao ky su xl" / "ppe003": tách từ, bỏ dấu, MỌI từ phải có mặt
// trong chuỗi "mã tên size" — thứ tự từ không quan trọng.
export function itemSearchText(it: Pick<AtldItem, "code" | "name" | "size" | "unit" | "color">): string {
  return normalizeName(`${it.code} ${it.name} ${it.size || ""} size ${it.size || ""} ${it.color || ""} ${it.unit || ""}`);
}

export function matchesQuery(haystack: string, query: string): boolean {
  const tokens = normalizeName(query).split(/\s+/).filter(Boolean);
  return tokens.every((t) => haystack.includes(t));
}

// Gợi ý mã kế tiếp: PPE052 -> PPE053 (bỏ qua mã có đuôi .1/.2).
export function suggestNextCode(items: AtldItem[], prefix = "PPE"): string {
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`, "i");
  for (const it of items) {
    const m = it.code.trim().match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export function formatQty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "0";
  return Number(n).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

export function formatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Math.round(Number(n)).toLocaleString("vi-VN");
}

// ─── Lỗi ───
export function atldErrorMessage(err: { message?: string; code?: string } | null | undefined): string {
  const msg = err?.message || "Lỗi không xác định";
  if (/relation .*atld_.* does not exist|Could not find the (table|function) .*atld_/i.test(msg))
    return "Chưa chạy migration 116 (Kho BHLĐ) trong Supabase > SQL Editor.";
  if (/gia_nhap|gia_ban/i.test(msg) && /column|schema cache/i.test(msg))
    return "Chưa chạy migration 125 (giá nhập / giá bán của mã SP) trong Supabase > SQL Editor.";
  if (/'ncc' column|column .*ncc/i.test(msg))
    return "Chưa chạy migration 127 (ô NCC/PVT của mã SP) trong Supabase > SQL Editor.";
  if (/atld_items_code_unique/i.test(msg)) return "Mã SP này đã có trong danh mục.";
  if (/atld_partners_name_unique/i.test(msg)) return "Đối tác này đã có trong danh mục.";
  if (/foreign key/i.test(msg)) return "Mục này đã được dùng trong phiếu kho nên không xoá được — hãy chuyển sang \"Ngừng dùng\".";
  if (/row-level security|permission denied/i.test(msg)) return "Tài khoản chưa có quyền Thủ kho ATLĐ.";
  return msg;
}

// Ghi rồi đọc lại để phát hiện "0 dòng" (RLS chặn UPDATE/DELETE không báo lỗi).
async function writeChecked(
  run: () => PromiseLike<{ data: unknown[] | null; error: { message?: string; code?: string } | null }>,
  zeroRowsMsg: string
): Promise<string | null> {
  const { data, error } = await run();
  if (error) return atldErrorMessage(error);
  if (!data || data.length === 0) return zeroRowsMsg;
  return null;
}

// ─── Quyền của người đang đăng nhập (đọc từ CSDL, không đoán ở client) ───
export async function fetchAtldAccess(): Promise<{ keeper: boolean; approver: boolean }> {
  const { data, error } = await supabase.rpc("atld_my_access");
  if (error || !data) return { keeper: false, approver: false };
  const d = data as { keeper?: boolean; approver?: boolean };
  return { keeper: !!d.keeper, approver: !!d.approver };
}

// ─── Danh mục sản phẩm ───
export async function fetchItems(): Promise<{ items: AtldItem[]; error: string | null }> {
  const { data, error } = await supabase.from("atld_items").select("*").order("code");
  if (error) return { items: [], error: atldErrorMessage(error) };
  return {
    items: ((data as AtldItem[]) || []).map((r) => ({
      ...r,
      min_stock: Number(r.min_stock) || 0,
      gia_nhap: r.gia_nhap == null ? null : Number(r.gia_nhap),
      gia_ban: r.gia_ban == null ? null : Number(r.gia_ban),
    })),
    error: null,
  };
}

export async function fetchStock(): Promise<Map<string, { ton: number; giaTri: number }>> {
  const { data } = await supabase.from("atld_stock").select("item_id, ton, gia_tri");
  const map = new Map<string, { ton: number; giaTri: number }>();
  for (const r of (data as { item_id: string; ton: number; gia_tri: number }[]) || []) {
    map.set(r.item_id, { ton: Number(r.ton) || 0, giaTri: Number(r.gia_tri) || 0 });
  }
  return map;
}

// ─── Tồn theo kỳ (migration 119) ───
// Tồn đầu kỳ / Nhập / Xuất / Tồn cuối kỳ tính thẳng từ sổ kho theo ngày phiếu —
// không có bảng chốt sổ, nên tồn cuối tháng trước LUÔN bằng tồn đầu tháng sau.
export type PeriodStock = { tonDau: number; nhap: number; xuat: number; tonCuoi: number; giaTriCuoi: number };

export const EMPTY_PERIOD_STOCK: PeriodStock = { tonDau: 0, nhap: 0, xuat: 0, tonCuoi: 0, giaTriCuoi: 0 };

// "2026-10" theo giờ Việt Nam (đầu tháng lúc 0h–7h sáng giờ VN vẫn là tháng mới).
export function currentMonthVN(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit" }).format(new Date());
}

export function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function fetchStockPeriod(
  from: string,
  to: string
): Promise<{ map: Map<string, PeriodStock>; error: string | null }> {
  const { data, error } = await supabase.rpc("atld_stock_period", { p_from: from, p_to: to });
  const map = new Map<string, PeriodStock>();
  if (error) {
    const missing = /atld_stock_period/i.test(error.message || "") && /find|exist/i.test(error.message || "");
    return { map, error: missing ? "Chưa chạy migration 119 (tồn theo kỳ) trong Supabase > SQL Editor." : atldErrorMessage(error) };
  }
  type R = { item_id: string; ton_dau: number; nhap: number; xuat: number; ton_cuoi: number; gia_tri_cuoi: number };
  for (const r of (data as R[]) || []) {
    map.set(r.item_id, {
      tonDau: Number(r.ton_dau) || 0,
      nhap: Number(r.nhap) || 0,
      xuat: Number(r.xuat) || 0,
      tonCuoi: Number(r.ton_cuoi) || 0,
      giaTriCuoi: Number(r.gia_tri_cuoi) || 0,
    });
  }
  return { map, error: null };
}

export type ItemInput = {
  code: string;
  name: string;
  size: string;
  color: string;
  unit: string;
  min_stock: number;
  gia_nhap: number | null;
  gia_ban: number | null;
  ncc: string;
  note: string;
};

function cleanItem(v: ItemInput) {
  return {
    code: v.code.trim(),
    name: v.name.trim().replace(/\s+/g, " "),
    size: v.size.trim() || null,
    color: v.color.trim() || null,
    unit: v.unit.trim() || null,
    min_stock: Number.isFinite(v.min_stock) && v.min_stock > 0 ? v.min_stock : 0,
    gia_nhap: v.gia_nhap != null && Number.isFinite(v.gia_nhap) && v.gia_nhap >= 0 ? v.gia_nhap : null,
    gia_ban: v.gia_ban != null && Number.isFinite(v.gia_ban) && v.gia_ban >= 0 ? v.gia_ban : null,
    ncc: v.ncc.trim().replace(/\s+/g, " ") || null,
    note: v.note.trim() || null,
  };
}

export async function createItem(v: ItemInput): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.from("atld_items").insert(cleanItem(v)).select("id");
  if (error) return { id: null, error: atldErrorMessage(error) };
  const id = (data as { id: string }[] | null)?.[0]?.id || null;
  return id ? { id, error: null } : { id: null, error: "Không tạo được — tài khoản chưa có quyền Thủ kho ATLĐ." };
}

// NCC gõ tay -> id trong atld_partners (khớp tên bỏ hoa/thường + khoảng trắng thừa;
// chưa có thì tạo mới). Bảng nhỏ nên đọc hết rồi so ở client — tránh ilike nhầm
// ký tự % _ trong tên.
async function nccPartnerId(name: string): Promise<{ id: string | null; error: string | null }> {
  const norm = (t: string) => t.trim().replace(/\s+/g, " ");
  const clean = norm(name);
  if (!clean) return { id: null, error: null };
  const key = clean.toLowerCase();
  const find = async () => {
    const { data } = await supabase.from("atld_partners").select("id, name").eq("kind", "ncc");
    return ((data as { id: string; name: string }[]) || []).find((p) => norm(p.name).toLowerCase() === key)?.id || null;
  };
  const found = await find();
  if (found) return { id: found, error: null };
  const { data, error } = await supabase.from("atld_partners").insert({ kind: "ncc", name: clean }).select("id").single();
  if (data) return { id: (data as { id: string }).id, error: null };
  // Trùng tên do người khác vừa tạo cùng lúc -> đọc lại.
  const again = await find();
  return again ? { id: again, error: null } : { id: null, error: atldErrorMessage(error) };
}

// Nhập kho NGAY từ form mã SP (user yêu cầu 02/10/2026: tạo SP phải nhập được số
// lượng). Đi đúng đường phiếu nhập thường: lập phiếu nhập 1 dòng rồi gọi hàm ghi sổ
// atld_post_receipt (116) -> có lô FIFO, hiện ở cột Nhập SP của Tổng kho và dòng
// Nhập ở tab Giá nhập kho. Ghi sổ lỗi thì xoá phiếu nháp vừa lập để không sót rác.
export async function receiveItemStock(itemId: string, qty: number, unitPrice: number, ngay: string, lyDo: string, ncc: string): Promise<string | null> {
  const { data: me } = await supabase.auth.getUser();
  const partner = await nccPartnerId(ncc);
  if (partner.error) return partner.error;
  const { data: v, error: e1 } = await supabase
    .from("atld_vouchers")
    .insert({ loai: "nhap", ngay, ly_do: lyDo, partner_id: partner.id, created_by_name: (me.user?.user_metadata?.full_name as string) || null })
    .select("id")
    .single();
  if (e1 || !v) return atldErrorMessage(e1);
  const vid = (v as { id: string }).id;
  const { error: e2 } = await supabase.from("atld_voucher_lines").insert({ voucher_id: vid, line_no: 1, item_id: itemId, qty, unit_price: unitPrice });
  const e3 = e2 ? null : (await supabase.rpc("atld_post_receipt", { p_voucher: vid })).error;
  if (e2 || e3) {
    await supabase.from("atld_vouchers").delete().eq("id", vid);
    return atldErrorMessage(e2 || e3);
  }
  return null;
}

export async function updateItem(id: string, v: ItemInput): Promise<string | null> {
  return writeChecked(
    () => supabase.from("atld_items").update(cleanItem(v)).eq("id", id).select("id"),
    "Không lưu được — tài khoản chưa có quyền Thủ kho ATLĐ."
  );
}

export async function setItemActive(id: string, active: boolean): Promise<string | null> {
  return writeChecked(
    () => supabase.from("atld_items").update({ active }).eq("id", id).select("id"),
    "Không lưu được — tài khoản chưa có quyền Thủ kho ATLĐ."
  );
}

export async function deleteItem(id: string): Promise<string | null> {
  return writeChecked(
    () => supabase.from("atld_items").delete().eq("id", id).select("id"),
    "Không xoá được — tài khoản chưa có quyền Thủ kho ATLĐ."
  );
}

// ─── Đối tác ───
export async function fetchPartners(): Promise<{ partners: AtldPartner[]; error: string | null }> {
  const { data, error } = await supabase.from("atld_partners").select("*").order("name");
  if (error) return { partners: [], error: atldErrorMessage(error) };
  return { partners: (data as AtldPartner[]) || [], error: null };
}

export type PartnerInput = {
  kind: AtldPartnerKind;
  name: string;
  bdh_name: string;
  phone: string;
  address: string;
  note: string;
};

function cleanPartner(v: PartnerInput) {
  return {
    kind: v.kind,
    name: v.name.trim().replace(/\s+/g, " "),
    bdh_name: v.bdh_name.trim() || null,
    phone: v.phone.trim() || null,
    address: v.address.trim() || null,
    note: v.note.trim() || null,
  };
}

export async function createPartner(v: PartnerInput): Promise<string | null> {
  return writeChecked(
    () => supabase.from("atld_partners").insert(cleanPartner(v)).select("id"),
    "Không tạo được — tài khoản chưa có quyền Thủ kho ATLĐ."
  );
}

export async function updatePartner(id: string, v: PartnerInput): Promise<string | null> {
  return writeChecked(
    () => supabase.from("atld_partners").update(cleanPartner(v)).eq("id", id).select("id"),
    "Không lưu được — tài khoản chưa có quyền Thủ kho ATLĐ."
  );
}

export async function setPartnerActive(id: string, active: boolean): Promise<string | null> {
  return writeChecked(
    () => supabase.from("atld_partners").update({ active }).eq("id", id).select("id"),
    "Không lưu được — tài khoản chưa có quyền Thủ kho ATLĐ."
  );
}

// ─── Nhà thầu: danh mục CHUNG với Hồ sơ trình ký (migration 117) ───
// finance_partners chỉ Admin / cờ Báo cáo đọc được nên đi qua 2 hàm hẹp.
export async function fetchContractors(): Promise<{ contractors: AtldContractor[]; error: string | null }> {
  const { data, error } = await supabase.rpc("atld_contractor_list");
  if (error) {
    if (/atld_contractor_list/i.test(error.message || "") && /find|exist/i.test(error.message || ""))
      return { contractors: [], error: "Chưa chạy migration 117 (nhà thầu dùng chung) trong Supabase > SQL Editor." };
    return { contractors: [], error: atldErrorMessage(error) };
  }
  return { contractors: (data as AtldContractor[]) || [], error: null };
}

// Trùng tên (không phân biệt hoa thường) thì CSDL trả lại nhà thầu sẵn có.
export async function createContractor(name: string, shortName: string): Promise<string | null> {
  const { error } = await supabase.rpc("atld_contractor_create", {
    p_name: name.trim(),
    p_short_name: shortName.trim() || null,
  });
  return error ? atldErrorMessage(error) : null;
}

export async function deletePartner(id: string): Promise<string | null> {
  return writeChecked(
    () => supabase.from("atld_partners").delete().eq("id", id).select("id"),
    "Không xoá được — tài khoản chưa có quyền Thủ kho ATLĐ."
  );
}

// ─── Giá nhập kho: giá NHẬP vào + giá XUẤT bán ra (migration 120) ───
// View atld_trade_prices gộp lịch sử nhập/xuất của sheet Chi Tiet cũ + phiếu đã
// ghi sổ (trừ phiếu tồn đầu kỳ). Chỉ để tra giá — không ảnh hưởng tồn.
export type TradePrice = {
  id: string;
  nguon: "excel" | "phieu";
  loai: "nhap" | "xuat";
  ngay: string;            // yyyy-mm-dd
  item_id: string;
  qty: number;
  unit_price: number | null; // dòng xuất cũ có thể bỏ trống giá
  vat_percent: number | null;
  doi_tac: string | null;    // NCC (nhập) / người nhận (xuất)
  chung_tu: string | null;
  so_phieu: string | null;
  // Từ migration 123 — chỉ có ở dòng sinh từ PHIẾU (dòng Excel cũ = null).
  status: "draft" | "pending" | "returned" | "posted" | "cancelled" | null;
  voucher_id: string | null;
  created_by: string | null;
  created_by_name: string | null;
  nguoi_nhan: string | null;
  bdh_name: string | null;
  ly_do: string | null;
  ly_do_tra_huy: string | null;  // lý do trả lại / huỷ
};

export async function fetchTradePrices(): Promise<{ rows: TradePrice[]; error: string | null }> {
  const { data, error } = await supabase.from("atld_trade_prices").select("*").order("ngay", { ascending: false }).limit(10000);
  if (error) {
    const missing = /atld_trade_prices/i.test(error.message || "") && /find|exist/i.test(error.message || "");
    return { rows: [], error: missing ? "Chưa chạy migration 120 (giá nhập – xuất) trong Supabase > SQL Editor." : atldErrorMessage(error) };
  }
  return {
    rows: ((data as TradePrice[]) || []).map((r) => ({
      ...r,
      qty: Number(r.qty) || 0,
      unit_price: r.unit_price == null ? null : Number(r.unit_price),
      vat_percent: r.vat_percent == null ? null : Number(r.vat_percent),
    })),
    error: null,
  };
}

export async function countExcelPriceHistory(): Promise<number> {
  const { count } = await supabase.from("atld_price_history").select("id", { count: "exact", head: true }).eq("source", "excel");
  return count || 0;
}

export type PriceHistoryInput = {
  loai: "nhap" | "xuat";
  ngay: string;
  item_id: string;
  qty: number;
  unit_price: number | null;
  doi_tac: string | null;
  chung_tu: string | null;
};

export async function insertPriceHistory(rows: PriceHistoryInput[]): Promise<{ added: number; error: string | null }> {
  let added = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await supabase
      .from("atld_price_history")
      .insert(rows.slice(i, i + 200).map((r) => ({ ...r, source: "excel" })))
      .select("id");
    if (error || !data || data.length === 0) {
      return { added, error: error ? atldErrorMessage(error) : "Không thêm được — tài khoản chưa có quyền Thủ kho ATLĐ." };
    }
    added += data.length;
  }
  return { added, error: null };
}

// Sửa tay / xoá dòng lịch sử giá "Excel cũ" (migration 121). Sửa: Thủ kho, TP/PP
// có cờ duyệt xuất, Admin. Xoá: CHỈ TP/PP có cờ + Admin. RLS chặn thì Postgres
// sửa 0 dòng mà không báo lỗi -> writeChecked bắt trường hợp đó.
export type PriceHistoryPatch = {
  loai: "nhap" | "xuat";
  ngay: string;
  qty: number;
  unit_price: number | null;
  doi_tac: string | null;
  chung_tu: string | null;
};

export async function updatePriceHistory(id: string, patch: PriceHistoryPatch): Promise<string | null> {
  return writeChecked(
    () => supabase.from("atld_price_history").update(patch).eq("id", id).select("id"),
    "Không lưu được — tài khoản chưa có quyền sửa (Thủ kho / TP-PP ATLĐ), hoặc chưa chạy migration 121."
  );
}

export async function deletePriceHistory(id: string): Promise<string | null> {
  return writeChecked(
    () => supabase.from("atld_price_history").delete().eq("id", id).select("id"),
    "Không xoá được — chỉ TP/PP có cờ \"Duyệt xuất kho ATLĐ\" và Admin được xoá."
  );
}

// Tên đối tác trong Danh mục đối tác CHUNG của Hồ sơ trình ký (migration 122) —
// gợi ý cho ô "Khách hàng". Chỉ tên + tên gọi tắt, không kèm STK / MST.
export async function fetchSharedPartnerNames(): Promise<string[]> {
  const { data, error } = await supabase.rpc("atld_shared_partner_list");
  if (error || !data) return [];
  return Array.from(new Set((data as { name: string }[]).map((r) => r.name).filter(Boolean)));
}
