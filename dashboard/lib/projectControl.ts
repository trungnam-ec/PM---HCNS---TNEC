// ============================================================
// projectControl — Quản trị dự án (migration 096): kiểu dữ liệu, nhãn, quy đổi
// Km, định dạng tiền và các hàm ghi dùng chung cho mọi tab.
//
// RLS là chốt chặn thật. Giao diện chỉ dùng `PcAccess` (RPC pc_my_access) để ẩn
// nút. Lưu ý bẫy RLS: UPDATE/DELETE bị chặn thì Postgres KHÔNG báo lỗi mà sửa 0
// dòng — mọi hàm ghi ở đây đều `.select()` lại và coi 0 dòng là lỗi quyền.
// ============================================================

import { supabase } from "./supabase";

export type PcProjectStatus =
  | "PREPARING" | "MOBILIZING" | "EXECUTING" | "SUSPENDED"
  | "COMPLETED" | "SETTLEMENT" | "WARRANTY" | "CLOSED";

export const PROJECT_STATUS: { value: PcProjectStatus; label: string; cls: string }[] = [
  { value: "PREPARING", label: "Chuẩn bị", cls: "bg-slate-100 text-slate-600" },
  { value: "MOBILIZING", label: "Huy động", cls: "bg-sky-50 text-sky-700" },
  { value: "EXECUTING", label: "Thi công", cls: "bg-blue-50 text-[#005BAC]" },
  { value: "SUSPENDED", label: "Tạm dừng", cls: "bg-amber-50 text-amber-700" },
  { value: "COMPLETED", label: "Hoàn thành", cls: "bg-emerald-50 text-emerald-700" },
  { value: "SETTLEMENT", label: "Quyết toán", cls: "bg-violet-50 text-violet-700" },
  { value: "WARRANTY", label: "Bảo hành", cls: "bg-teal-50 text-teal-700" },
  { value: "CLOSED", label: "Đóng dự án", cls: "bg-slate-200 text-slate-600" },
];

export function statusMeta(s: string | null | undefined) {
  return PROJECT_STATUS.find((x) => x.value === s) || PROJECT_STATUS[0];
}

// Migration 113: chỉ còn 2 quyền gán ở tab Thành viên — VIEW / EDIT. GDDA, TC_KT là
// dòng gán tay cũ còn giữ (vẫn chạy) tới khi user tick cờ rồi tự đổi. Quản lý dự án
// + tiền đi theo cờ toàn công ty (GĐDA/CHT theo BĐH, TC-KT, Ban lãnh đạo).
export type PcRole = "VIEW" | "EDIT" | "GDDA" | "TC_KT";

export const ROLES: { value: PcRole; label: string; desc: string }[] = [
  { value: "VIEW", label: "Quyền xem", desc: "Xem mọi tab trừ Tài chính, không thấy tiền" },
  {
    value: "EDIT",
    label: "Quyền chỉnh sửa",
    desc: "Sửa Lý trình, Nhà thầu & HĐ, Kế hoạch, Pháp lý, Sản lượng, Vật tư, Cảnh báo, Báo cáo — không thấy tiền, không duyệt nhật ký",
  },
];

const LEGACY_ROLE_LABELS: Record<string, string> = {
  GDDA: "Giám đốc dự án (gán tay cũ)",
  TC_KT: "Tài chính – Kế toán (gán tay cũ)",
  BDH_MANAGER: "GĐDA/CHT (cờ)", // cờ can_manage_bdh_project — migration 112
};

export function roleLabel(r: string): string {
  return ROLES.find((x) => x.value === r)?.label || LEGACY_ROLE_LABELS[r] || r;
}

export const SEGMENT_TYPES: { value: string; label: string }[] = [
  { value: "ROAD", label: "Tuyến + HTKT" },
  { value: "BRIDGE_APPROACH", label: "Đường đầu cầu" },
  { value: "BRIDGE", label: "Cầu" },
  { value: "RETAINING_WALL", label: "Tường chắn" },
  { value: "MIXED", label: "Hỗn hợp" },
];

export const WBS_GROUPS: Record<string, string> = { T: "Tuyến", K: "Khác", C: "Cầu" };

export type PcAccess = {
  can_view: boolean;
  can_edit_structure: boolean;
  can_edit_site: boolean; // Khối A/B (GPMB, huy động, phát sinh, pháp lý) — migration 098
  can_log: boolean; // nhập nhật ký sản lượng — migration 099
  can_approve_log: boolean; // QS / GĐDA / BLĐ duyệt nhật ký — migration 099
  can_view_finance: boolean;
  can_edit_finance: boolean;
  can_manage_members: boolean;
  can_edit_material: boolean; // E. Vật tư — migration 101
  can_view_material_price: boolean;
  can_edit_material_price: boolean;
  can_manage_material_catalog: boolean;
  is_leadership: boolean;
  roles: PcRole[];
};

export const NO_ACCESS: PcAccess = {
  can_view: false,
  can_edit_structure: false,
  can_edit_site: false,
  can_log: false,
  can_approve_log: false,
  can_view_finance: false,
  can_edit_finance: false,
  can_manage_members: false,
  can_edit_material: false,
  can_view_material_price: false,
  can_edit_material_price: false,
  can_manage_material_catalog: false,
  is_leadership: false,
  roles: [],
};

export type PcProject = {
  id: string;
  bdh_name: string;
  code: string | null;
  name: string;
  package_name: string | null;
  owner_name: string | null;
  supervisor_name: string | null;
  location: string | null;
  start_date: string | null;
  finish_date: string | null;
  status: PcProjectStatus;
  note: string | null;
};

export type PcProjectFinance = {
  project_id: string;
  contract_value_pre_vat: number | null;
  vat_rate: number;
  contingency_value: number | null;
  payment_threshold: number;
  warranty_guarantee_value?: number | null; // giá trị bảo lãnh bảo hành — migration 102
  // migration 109 — nhập đúng như Điều 9 HĐ (các số đã gồm VAT)
  contract_kind?: PcContractKind | null;
  package_total_value?: number | null; // giá HĐ toàn gói (liên danh)
  package_construction_cost?: number | null; // chi phí xây dựng của liên danh — migration 110
  package_contingency?: number | null; // chi phí dự phòng của liên danh (tự tính = toàn gói − CPXD liên danh)
  contract_value?: number | null; // giá trị theo khối lượng đảm nhận
  construction_cost?: number | null; // chi phí xây dựng
};

export type PcContractKind = "LUMP_SUM" | "FIXED_UNIT_PRICE" | "ADJUSTABLE_UNIT_PRICE" | "TIME_BASED" | "MIXED";

export const CONTRACT_KINDS: { value: PcContractKind; label: string }[] = [
  { value: "LUMP_SUM", label: "HĐ trọn gói" },
  { value: "FIXED_UNIT_PRICE", label: "HĐ theo đơn giá cố định" },
  { value: "ADJUSTABLE_UNIT_PRICE", label: "HĐ theo đơn giá điều chỉnh" },
  { value: "TIME_BASED", label: "HĐ theo thời gian" },
  { value: "MIXED", label: "HĐ hỗn hợp" },
];

export type PcMember = {
  id: string;
  project_id: string;
  email: string | null; // NULL = nhân sự chưa có email (migration 114) — không đăng nhập, không nhận quyền
  name: string | null;
  role: PcRole; // "Quyền hệ thống" — các hàm quyền đọc cột này
  // migration 111 — thông tin nhân sự dự án (chỉ hiển thị, không ảnh hưởng quyền)
  unit_group?: string | null;
  department?: string | null;
  title?: string | null;
  phone?: string | null;
  contact_email?: string | null;
  project_role?: string | null;
  duty?: string | null;
  reports_to?: string | null;
  status?: PcMemberStatus;
  sort_order?: number; // migration 130 — thứ tự kéo thả
  created_at?: string;
};

export type PcMemberStatus = "NOT_JOINED" | "JOINED" | "CONCURRENT" | "COMPANY_LEVEL";

export const MEMBER_STATUSES: { value: PcMemberStatus; label: string; cls: string }[] = [
  { value: "NOT_JOINED", label: "Chưa tham gia", cls: "bg-slate-100 text-slate-500" },
  { value: "JOINED", label: "Đã tham gia", cls: "bg-emerald-50 text-emerald-700" },
  { value: "CONCURRENT", label: "Kiêm nhiệm", cls: "bg-amber-50 text-amber-700" },
  { value: "COMPANY_LEVEL", label: "Tham gia thuộc cấp công ty", cls: "bg-blue-50 text-[#005BAC]" },
];

export type PcSegment = {
  id: string;
  project_id: string;
  code: string;
  km_start_m: number;
  km_end_m: number;
  segment_type: string;
  structure_name: string | null;
  locality: string | null;
  sides: number;
  sort_order: number;
  planned_start: string | null;
  planned_finish: string | null;
  note: string | null;
};

export type PcWbsItem = {
  id: string;
  code: string;
  group_code: "T" | "K" | "C";
  name: string;
  unit: string | null;
  sort_order: number;
};

export type PcSegmentWbs = {
  id: string;
  segment_id: string;
  wbs_item_id: string;
  applicable: boolean;
  weight_pct: number;
  budget_qty: number | null;
  unit: string | null;
  planned_start: string | null;
  planned_finish: string | null;
};

export type PcContract = {
  id: string;
  project_id: string;
  contract_type: "A_B" | "B_B1";
  parent_contract_id: string | null;
  partner_id: string | null;
  partner_name: string | null;
  legal_status: "NOMINAL" | "NON_NOMINAL" | null;
  contractor_role: "MAIN" | "SUB" | null;
  contract_no: string | null;
  sign_date: string | null;
  status: "NEGOTIATING" | "SIGNED" | "LIQUIDATED";
  note: string | null;
};

export type PcContractFinance = {
  contract_id: string;
  value_pre_vat: number | null;
  vat_rate: number;
  advance_rate: number | null;
  retention_rate: number | null;
};

export type PcScope = {
  id: string;
  contract_id: string;
  segment_id: string;
  wbs_item_id: string | null;
  scope_desc: string | null;
};

export type PcAddendum = {
  id: string;
  contract_id: string;
  addendum_no: string | null;
  sign_date: string | null;
  value_change: number;
  reason: string | null;
};

export const CONTRACT_STATUS: Record<string, { label: string; cls: string }> = {
  NEGOTIATING: { label: "Đang thương thảo", cls: "bg-amber-50 text-amber-700" },
  SIGNED: { label: "Đã ký", cls: "bg-emerald-50 text-emerald-700" },
  LIQUIDATED: { label: "Đã thanh lý", cls: "bg-slate-100 text-slate-500" },
};

// ─── Km ───
// "Km0+880" / "km 12+400.5" / "0+880" / "880" (mét) -> số mét. Sai định dạng -> null.
export function parseKm(input: string): number | null {
  const s = (input || "").trim().toLowerCase().replace(/\s+/g, "").replace(/^km/, "").replace(",", ".");
  if (!s) return null;
  let m = s.match(/^(\d+)\+(\d+(?:\.\d+)?)$/);
  if (m) return parseInt(m[1], 10) * 1000 + parseFloat(m[2]);
  m = s.match(/^\d+(?:\.\d+)?$/);
  if (m) return parseFloat(s);
  return null;
}

// 880 -> "Km0+880"; 12400.5 -> "Km12+400.5"
export function formatKm(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(Number(m))) return "";
  const v = Number(m);
  const km = Math.floor(v / 1000);
  const rest = Math.round((v - km * 1000) * 100) / 100;
  const [int, dec] = rest.toString().split(".");
  return `Km${km}+${int.padStart(3, "0")}${dec ? "." + dec : ""}`;
}

// ─── Tiền (VNĐ số nguyên) ───
export function formatVnd(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return Math.round(Number(v)).toLocaleString("vi-VN");
}

// Hiển thị gọn: 63.900.000.000 -> "63,9 tỷ"; 850.000.000 -> "850 triệu"
export function formatMoneyShort(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} triệu`;
  return `${n.toLocaleString("vi-VN")} đ`;
}

// "63.900.000.000" / "63900000000" -> 63900000000. Rỗng -> null.
export function parseVnd(s: string): number | null {
  const digits = (s || "").replace(/[^\d-]/g, "");
  if (!digits || digits === "-") return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

// Tỷ lệ lưu dạng 0.08 — người dùng gõ "8" (%).
export function pctToRate(s: string): number | null {
  const t = (s || "").trim().replace(",", ".");
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n / 100 : null;
}
export function rateToPct(r: number | null | undefined): string {
  if (r === null || r === undefined) return "";
  return String(Math.round(Number(r) * 10000) / 100);
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
}

// ─── Truy vấn ───
export async function fetchMyAccess(projectId: string): Promise<PcAccess> {
  const { data, error } = await supabase.rpc("pc_my_access", { p_project: projectId });
  if (error || !data) return NO_ACCESS;
  return { ...NO_ACCESS, ...(data as PcAccess) };
}

export async function fetchIsLeadership(): Promise<boolean> {
  const { data, error } = await supabase.rpc("pc_is_leadership_rpc");
  return !error && data === true;
}

// Lỗi Supabase -> câu tiếng Việt dễ hiểu (trường hợp thường gặp).
export function pcErrorMessage(err: { message?: string; code?: string } | null | undefined): string {
  const msg = err?.message || "Lỗi không xác định";
  if (/relation .*pc_.* does not exist|Could not find the (table|function)/i.test(msg))
    return "Chưa chạy migration 096 (Quản trị dự án) trong Supabase > SQL Editor.";
  if (/row-level security|permission denied/i.test(msg)) return "Tài khoản không có quyền thực hiện thao tác này.";
  if (/pc_segments_no_overlap|conflicting key value violates exclusion/i.test(msg))
    return "Lý trình bị chồng lấn với một lý trình khác của dự án.";
  if (/pc_segments_code_unique/i.test(msg)) return "Mã lý trình đã tồn tại trong dự án.";
  if (/pc_segments_km_order/i.test(msg)) return "Km cuối phải lớn hơn Km đầu.";
  if (/duplicate key/i.test(msg)) return "Dữ liệu bị trùng.";
  return msg;
}

// Ghi rồi đọc lại để phát hiện "0 dòng" (RLS chặn im lặng).
export async function pcUpdate(
  table: string,
  match: Record<string, string>,
  patch: Record<string, unknown>
): Promise<string | null> {
  let q = supabase.from(table).update(patch);
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const { data, error } = await q.select();
  if (error) return pcErrorMessage(error);
  if (!data || data.length === 0) return "Không lưu được — tài khoản không có quyền sửa mục này.";
  return null;
}

export async function pcDelete(table: string, match: Record<string, string>): Promise<string | null> {
  let q = supabase.from(table).delete();
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const { data, error } = await q.select();
  if (error) return pcErrorMessage(error);
  if (!data || data.length === 0) return "Không xoá được — tài khoản không có quyền xoá mục này.";
  return null;
}

// Upsert bảng tiền (khoá = cột đầu trong `row`).
export async function pcUpsert(
  table: string,
  row: Record<string, unknown>,
  onConflict: string
): Promise<string | null> {
  const { data, error } = await supabase.from(table).upsert(row, { onConflict }).select();
  if (error) return pcErrorMessage(error);
  if (!data || data.length === 0) return "Không lưu được — tài khoản không có quyền.";
  return null;
}

// ════════════════════════════════════════════════════════════
// P2 — Khối A (GPMB, Huy động, Phát sinh TK) + Khối B (Pháp lý) — migration 098
// ════════════════════════════════════════════════════════════

export type Tri = 0 | 0.5 | 1;

// Thang trạng thái giữ đúng chữ của file Excel (đặc tả 2.2).
export const SCALE_INTERNAL: Record<string, string> = { "0": "Chưa làm", "0.5": "Đang làm", "1": "Sẵn sàng" };
export const SCALE_SUPERVISOR: Record<string, string> = { "0": "Chưa nộp", "0.5": "Đã nộp", "1": "Đã duyệt" };
export const SCALE_MOBILIZE: Record<string, string> = { "0": "Chưa làm", "0.5": "Huy động 50%", "1": "Đã hoàn thành" };
export const SCALE_VENDOR: Record<string, string> = { "0": "Chưa có HS", "1": "Đã có HS" };

export type PcLandClearance = {
  id: string;
  project_id: string;
  segment_id: string;
  from_m: number;
  to_m: number;
  side: "LEFT" | "RIGHT" | "BOTH";
  handover_date: string | null;
  status: "PENDING" | "HANDED_OVER" | "OBSTRUCTED";
  obstruction_note: string | null;
  note: string | null;
};

export const GPMB_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Chưa bàn giao", cls: "bg-slate-100 text-slate-500" },
  HANDED_OVER: { label: "Đã bàn giao", cls: "bg-emerald-50 text-emerald-700" },
  OBSTRUCTED: { label: "Vướng mắc", cls: "bg-rose-50 text-rose-600" },
};

export const SIDE_LABEL: Record<string, string> = { LEFT: "Trái tuyến", RIGHT: "Phải tuyến", BOTH: "Cả 2 bên" };

export type PcMobilization = {
  id: string;
  project_id: string;
  segment_id: string | null;
  contract_id: string | null;
  category: string;
  item_name: string;
  planned_date: string | null;
  planned_qty: number | null;
  actual_qty: number | null;
  unit: string | null;
  status: Tri;
  note: string | null;
};

export const MOB_CATEGORIES: { value: string; label: string }[] = [
  { value: "EQUIPMENT", label: "Xe máy thiết bị" },
  { value: "MATERIAL", label: "Vật tư" },
  { value: "LABOR", label: "Nhân công" },
  { value: "UTILITIES", label: "Điện nước" },
  { value: "CAMP", label: "Lán trại" },
  { value: "ACCESS_ROAD", label: "Đường công vụ" },
  { value: "SPECIAL", label: "VTTB đặc biệt" },
];

export type PcDesignChange = {
  id: string;
  project_id: string;
  segment_id: string | null;
  wbs_item_id: string | null;
  name: string;
  internal_status: Tri;
  supervisor_status: Tri;
  owner_status: Tri;
  impact_days: number | null;
  submitted_date: string | null;
  approved_date: string | null;
  due_date: string | null;
  note: string | null;
};

export type PcLegalItem = {
  id: string;
  project_id: string;
  segment_id: string | null;
  item_group: string;
  item_name: string;
  person_name: string | null;
  vendor_input_status: 0 | 1;
  internal_status: Tri;
  supervisor_status: Tri;
  on_site: boolean | null;
  due_date: string | null;
  note: string | null;
  sort_order: number;
};

export const LEGAL_GROUPS: { value: string; label: string }[] = [
  { value: "SITE_OFFICE_STAFF", label: "Nhân sự & Văn phòng BĐH" },
  { value: "LAB", label: "Phòng thí nghiệm (P.TN)" },
  { value: "MATERIAL_SOURCE", label: "Vật tư đầu vào (VTĐV)" },
  { value: "METHOD_STATEMENT", label: "Biện pháp thi công (BPTC)" },
  { value: "CONTRACT", label: "Hợp đồng" },
  { value: "OTHER", label: "Khác" },
];

// Checklist mẫu tự sinh (đặc tả 7.5).
export const LEGAL_TEMPLATE: { group: string; name: string; staff?: boolean }[] = [
  { group: "SITE_OFFICE_STAFF", name: "Giám đốc dự án (GĐDA)", staff: true },
  { group: "SITE_OFFICE_STAFF", name: "Chỉ huy trưởng (CHT)", staff: true },
  { group: "SITE_OFFICE_STAFF", name: "QA/QC", staff: true },
  { group: "SITE_OFFICE_STAFF", name: "QS – Khối lượng", staff: true },
  { group: "SITE_OFFICE_STAFF", name: "Cán bộ kỹ thuật (KT)", staff: true },
  { group: "SITE_OFFICE_STAFF", name: "An toàn lao động (ATLĐ)", staff: true },
  { group: "SITE_OFFICE_STAFF", name: "Văn phòng BĐH" },
  { group: "LAB", name: "Phòng thí nghiệm hiện trường" },
  { group: "MATERIAL_SOURCE", name: "Hồ sơ vật tư đầu vào" },
  { group: "METHOD_STATEMENT", name: "Biện pháp thi công tổng thể" },
  { group: "CONTRACT", name: "Hợp đồng thi công" },
];

// Mức sẵn sàng 1 mục pháp lý = trung bình (nội bộ, TVGS/CĐT).
export function legalScore(i: Pick<PcLegalItem, "internal_status" | "supervisor_status">): number {
  return (Number(i.internal_status) + Number(i.supervisor_status)) / 2;
}

// % sẵn sàng nhóm = Σ trạng thái / số mục (đặc tả 8.8). Rỗng -> null.
export function readiness(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, v) => a + Number(v), 0) / values.length;
}

// % GPMB lý trình = Σ chiều dài đã bàn giao (BOTH tính 2 bên) / (dài × số bên).
export function gpmbPercent(seg: { km_start_m: number; km_end_m: number; sides: number }, rows: PcLandClearance[]): number {
  const total = (Number(seg.km_end_m) - Number(seg.km_start_m)) * (seg.sides || 2);
  if (total <= 0) return 0;
  const done = rows
    .filter((r) => r.status === "HANDED_OVER")
    .reduce((a, r) => {
      const len = Number(r.to_m) - Number(r.from_m);
      const mult = r.side === "BOTH" ? Math.min(2, seg.sides || 2) : 1;
      return a + len * mult;
    }, 0);
  return Math.min(1, done / total);
}

// % GPMB kéo tay trên thanh tiến trình (migration 106) — có thì thay % tự tính.
export type PcGpmbProgress = { id: string; project_id: string; segment_id: string; pct: number };

// Màu thanh GPMB: ≤30% đỏ · 40–80% vàng · ≥90% xanh lá.
export function gpmbBarCls(v: number): { bar: string; badge: string; knob: string } {
  if (v >= 0.85) return { bar: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800", knob: "border-emerald-500" };
  if (v >= 0.35) return { bar: "bg-amber-400", badge: "bg-amber-100 text-amber-800", knob: "border-amber-400" };
  return { bar: "bg-rose-500", badge: "bg-rose-100 text-rose-700", knob: "border-rose-500" };
}

// Màu cho ô bình đồ theo tỷ lệ 0..1 (null = chưa có dữ liệu).
export function heatCls(v: number | null): string {
  if (v === null) return "bg-slate-50 text-slate-300";
  if (v >= 0.999) return "bg-emerald-100 text-emerald-800";
  if (v >= 0.5) return "bg-amber-100 text-amber-800";
  if (v > 0) return "bg-orange-100 text-orange-800";
  return "bg-rose-100 text-rose-700";
}

export function pct(v: number | null): string {
  if (v === null) return "—";
  return `${Math.round(v * 1000) / 10}%`;
}

// ════════════════════════════════════════════════════════════
// P3 — Khối C: Sản lượng & Tài chính — migration 099
// Mọi lũy kế TÍNH từ nhật ký đã duyệt, không nhập tay (đặc tả mục 5).
// ════════════════════════════════════════════════════════════

export type LogStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

export const LOG_STATUS: Record<LogStatus, { label: string; cls: string }> = {
  DRAFT: { label: "Nháp", cls: "bg-slate-100 text-slate-500" },
  SUBMITTED: { label: "Chờ QS duyệt", cls: "bg-amber-50 text-amber-700" },
  APPROVED: { label: "Đã duyệt", cls: "bg-emerald-50 text-emerald-700" },
  REJECTED: { label: "Trả lại", cls: "bg-rose-50 text-rose-600" },
};

export type LogPhoto = { path: string; name: string };

export type PcProgressLog = {
  id: string;
  project_id: string;
  segment_wbs_id: string;
  contract_id: string | null;
  log_date: string;
  entry_type: "DAY" | "WEEK";
  qty: number;
  weather: string | null;
  manpower: number | null;
  equipment_count: number | null;
  note: string | null;
  photos: LogPhoto[];
  status: LogStatus;
  reject_reason: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
};

// Dòng view pc_v_progress_value (chỉ nhật ký APPROVED). value_* null nếu không có quyền tiền.
export type PcValueRow = {
  id: string;
  project_id: string;
  segment_id: string;
  segment_wbs_id: string;
  wbs_item_id: string;
  contract_id: string | null;
  log_date: string;
  entry_type: "DAY" | "WEEK";
  qty: number;
  value_a: number | null;
  value_b: number | null;
};

export type PcPlanEntry = {
  id: string;
  project_id: string;
  segment_id: string | null;
  period_month: string; // YYYY-MM-01
  planned_value: number | null;
  planned_disbursement: number | null;
  version: number;
};

export type PcAcceptance = {
  id: string;
  project_id: string;
  contract_id: string;
  period_no: number | null;
  period_from: string | null;
  period_to: string | null;
  accepted_value: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED";
  note: string | null;
};

export type PcPayment = {
  id: string;
  project_id: string;
  contract_id: string;
  acceptance_id: string | null;
  payment_type: "ADVANCE" | "PROGRESS" | "ADVANCE_RECOVERY" | "RETENTION" | "FINAL";
  direction: "IN" | "OUT";
  request_date: string | null;
  request_value: number | null;
  paid_date: string | null;
  paid_value: number | null;
  status: "REQUESTED" | "APPROVED" | "PAID" | "REJECTED";
  note: string | null;
};

export const PAYMENT_TYPES: Record<string, string> = {
  ADVANCE: "Tạm ứng",
  PROGRESS: "Thanh toán khối lượng",
  ADVANCE_RECOVERY: "Thu hồi tạm ứng",
  RETENTION: "Giữ lại / hoàn giữ lại",
  FINAL: "Quyết toán",
};

export const PAYMENT_STATUS: Record<string, { label: string; cls: string }> = {
  REQUESTED: { label: "Đã đề nghị", cls: "bg-slate-100 text-slate-500" },
  APPROVED: { label: "Đã duyệt", cls: "bg-amber-50 text-amber-700" },
  PAID: { label: "Đã thanh toán", cls: "bg-emerald-50 text-emerald-700" },
  REJECTED: { label: "Từ chối", cls: "bg-rose-50 text-rose-600" },
};

export const ACCEPTANCE_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Nháp", cls: "bg-slate-100 text-slate-500" },
  SUBMITTED: { label: "Đã trình", cls: "bg-amber-50 text-amber-700" },
  APPROVED: { label: "Đã duyệt", cls: "bg-emerald-50 text-emerald-700" },
};

// ─── Ngày (chuỗi YYYY-MM-DD, giờ Việt Nam) ───
export function todayVN(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

function toUTC(d: string): number {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

export function addDays(d: string, n: number): string {
  return new Date(toUTC(d) + n * 86400000).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

// Thứ Hai đầu tuần ISO của ngày d.
export function weekStart(d: string): string {
  const dow = new Date(toUTC(d)).getUTCDay(); // 0 = CN
  return addDays(d, dow === 0 ? -6 : 1 - dow);
}

// Chủ Nhật cuối tuần — nhật ký tuần ghi vào ngày này.
export function weekEnd(d: string): string {
  return addDays(weekStart(d), 6);
}

export function monthStart(d: string): string {
  return `${d.slice(0, 7)}-01`;
}

function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Danh sách tháng (YYYY-MM-01) từ a đến b.
export function monthsBetween(a: string, b: string): string[] {
  const out: string[] = [];
  let [y, m] = a.slice(0, 7).split("-").map(Number);
  const [ey, em] = b.slice(0, 7).split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (out.length > 240) break;
  }
  return out;
}

export function monthLabel(ym: string): string {
  return `T${Number(ym.slice(5, 7))}/${ym.slice(2, 4)}`;
}

// ─── Kế hoạch: bản hiện hành = version lớn nhất của từng (lý trình, tháng) ───
export function currentPlan(entries: PcPlanEntry[]): PcPlanEntry[] {
  const best = new Map<string, PcPlanEntry>();
  entries.forEach((e) => {
    const k = `${e.segment_id || ""}|${e.period_month}`;
    const cur = best.get(k);
    if (!cur || e.version > cur.version) best.set(k, e);
  });
  return [...best.values()];
}

// KH lũy kế tới ngày t, nội suy tuyến tính trong tháng của t (đặc tả 8.2).
export function planCumAt(
  entries: PcPlanEntry[],
  t: string,
  field: "planned_value" | "planned_disbursement" = "planned_value"
): number {
  const tm = monthStart(t);
  return entries.reduce((sum, e) => {
    const v = Number(e[field] || 0);
    if (e.period_month < tm) return sum + v;
    if (e.period_month === tm) return sum + (v * Number(t.slice(8, 10))) / daysInMonth(t.slice(0, 7));
    return sum;
  }, 0);
}

// ─── Tiến độ (đặc tả 8.2): nhãn theo ΔP = %TT − %KH ───
export function progressLabel(dp: number | null): { label: string; cls: string } {
  if (dp === null || !Number.isFinite(dp)) return { label: "Chưa đủ dữ liệu", cls: "bg-slate-100 text-slate-500" };
  const x = Math.round(Math.abs(dp) * 1000) / 10;
  if (dp > 0.05) return { label: `Vượt tiến độ ${x}%`, cls: "bg-emerald-100 text-emerald-800" };
  if (dp >= 0) return { label: "Đúng tiến độ", cls: "bg-emerald-50 text-emerald-700" };
  if (dp >= -0.05) return { label: `Lưu ý trễ ${x}%`, cls: "bg-amber-100 text-amber-800" };
  return { label: `Chậm tiến độ ${x}%`, cls: "bg-rose-100 text-rose-700" };
}

// % hoàn thành theo tỷ trọng (8.3) — KHÔNG cần tiền, ai xem dự án cũng tính được.
// %HT = Σ weight × min(1, KL lũy kế / KL HĐ) trên các hạng mục áp dụng.
export function weightedCompletion(
  items: { id: string; applicable: boolean; weight_pct: number; budget_qty: number | null }[],
  qtyBySw: Map<string, number>
): number | null {
  const use = items.filter((i) => i.applicable && Number(i.weight_pct) > 0);
  if (!use.length) return null;
  const totalW = use.reduce((a, i) => a + Number(i.weight_pct), 0);
  if (totalW <= 0) return null;
  const done = use.reduce((a, i) => {
    const b = Number(i.budget_qty || 0);
    const ratio = b > 0 ? Math.min(1, (qtyBySw.get(i.id) || 0) / b) : 0;
    return a + Number(i.weight_pct) * ratio;
  }, 0);
  return done / totalW;
}

// Dự báo (8.4): tốc độ 28 ngày, ngày HT dự báo, trễ dự báo, tốc độ yêu cầu.
export function forecast(opts: {
  rows: { log_date: string; v: number }[];
  t: string;
  contractValue: number;
  actual: number;
  finishDate: string | null;
}) {
  const from = addDays(opts.t, -27);
  const last28 = opts.rows.filter((r) => r.log_date >= from && r.log_date <= opts.t).reduce((a, r) => a + r.v, 0);
  const speed = last28 / 28;
  const remaining = Math.max(0, opts.contractValue - opts.actual);
  const forecastDate = speed > 0 ? addDays(opts.t, Math.ceil(remaining / speed)) : null;
  const delayDays = forecastDate && opts.finishDate ? daysBetween(opts.finishDate, forecastDate) : null;
  const daysLeft = opts.finishDate ? daysBetween(opts.t, opts.finishDate) : null;
  const requiredSpeed = daysLeft && daysLeft > 0 ? remaining / daysLeft : null;
  return { speed, forecastDate, delayDays, requiredSpeed, remaining };
}

// Gom theo kỳ: ngày / tuần (Thứ Hai) / tháng.
export type Period = "day" | "week" | "month";
export function periodKey(d: string, p: Period): string {
  return p === "day" ? d : p === "week" ? weekStart(d) : monthStart(d);
}
export function periodLabel(k: string, p: Period): string {
  if (p === "month") return monthLabel(k);
  if (p === "week") return `Tuần ${formatDate(k)} – ${formatDate(addDays(k, 6))}`;
  return formatDate(k);
}

// ════════════════════════════════════════════════════════════
// P4 — Rủi ro, cảnh báo, khoá kỳ — migration 100
// Điểm & cảnh báo do hàm SQL pc_refresh_risk tính (một nguồn cho mọi người xem).
// ════════════════════════════════════════════════════════════

export type RiskStatus = "NOT_STARTED" | "GOOD" | "CONTROLLED" | "AT_RISK" | "DELAYED";

export const RISK_STATUS: Record<RiskStatus, { label: string; cls: string; dot: string }> = {
  NOT_STARTED: { label: "Chưa thực hiện", cls: "bg-slate-100 text-slate-500", dot: "bg-slate-400" },
  GOOD: { label: "Tốt", cls: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  CONTROLLED: { label: "Đang kiểm soát", cls: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  AT_RISK: { label: "Nguy cơ chậm", cls: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  DELAYED: { label: "Chậm tiến độ", cls: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
};

// Thứ tự "xấu dần" để lấy trạng thái tệ nhất của dự án.
export const RISK_ORDER: RiskStatus[] = ["NOT_STARTED", "GOOD", "CONTROLLED", "AT_RISK", "DELAYED"];

export function worstStatus(list: RiskStatus[]): RiskStatus | null {
  if (!list.length) return null;
  return list.reduce((w, s) => (RISK_ORDER.indexOf(s) > RISK_ORDER.indexOf(w) ? s : w), list[0]);
}

export type PcRiskSnapshot = {
  id: string;
  project_id: string;
  segment_id: string;
  snap_date: string;
  completion: number | null;
  gpmb: number | null;
  legal: number | null;
  mobilization: number | null;
  dp: number | null;
  dp_source: "VALUE" | "TIME" | null;
  r_progress: number | null;
  r_gpmb: number | null;
  r_legal: number | null;
  r_mobilization: number | null;
  r_payment: number | null;
  r_material: number | null;
  score: number | null;
  status: RiskStatus;
  computed_at: string;
};

export type PcRiskConfig = {
  project_id: string;
  w_progress: number;
  w_gpmb: number;
  w_legal: number;
  w_mobilization: number;
  w_payment: number;
  dp_warn: number;
  dp_full: number;
  band_good: number;
  band_control: number;
  band_risk: number;
  log_gap_days: number;
  w_material: number;
  mat_days_warn: number;
  mat_waste_warn: number;
  mat_price_warn: number;
};

export type AlertSeverity = "HIGH" | "MEDIUM" | "LOW";

export type PcAlert = {
  id: string;
  project_id: string;
  segment_id: string | null;
  alert_key: string;
  alert_type: string;
  severity: AlertSeverity;
  message: string;
  is_finance: boolean;
  status: "OPEN" | "ACK" | "RESOLVED";
  note: string | null;
  handled_by: string | null;
  first_seen: string;
  last_seen: string;
  resolved_at: string | null;
};

export const SEVERITY: Record<AlertSeverity, { label: string; cls: string }> = {
  HIGH: { label: "Đỏ", cls: "bg-rose-500 text-white" },
  MEDIUM: { label: "Vàng", cls: "bg-amber-400 text-white" },
  LOW: { label: "Lưu ý", cls: "bg-slate-500 text-white" },
};

export const ALERT_STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "Mới", cls: "bg-rose-50 text-rose-600" },
  ACK: { label: "Đang xử lý", cls: "bg-amber-50 text-amber-700" },
  RESOLVED: { label: "Đã hết", cls: "bg-emerald-50 text-emerald-700" },
};

export type PcPeriodLock = { project_id: string; locked_until: string; locked_by: string | null; locked_at: string };

// Gọi tính lại điểm + cảnh báo (hàm SQL). Lỗi thì trả câu tiếng Việt, không chặn trang.
export async function refreshRisk(projectId: string): Promise<string | null> {
  const { error } = await supabase.rpc("pc_refresh_risk", { p_project: projectId });
  return error ? pcErrorMessage(error) : null;
}

// Supabase trả tối đa 1.000 dòng / lần — nhật ký sản lượng vượt mức đó sau vài tháng,
// thiếu dòng là lũy kế SAI mà không báo lỗi. Hàm này đọc theo trang tới hết.
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message?: string } | null }>
): Promise<{ data: T[]; error: { message?: string } | null }> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; from < 200000; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) return { data: out, error };
    const rows = (data as T[]) || [];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return { data: out, error: null };
}

// ════════════════════════════════════════════════════════════
// P5 — E. Vật tư — migration 101 (đặc tả 6.6, 7.7, 8.7)
// ════════════════════════════════════════════════════════════

export const MATERIAL_GROUPS = ["Thép", "Xi măng", "Cát", "Đá", "Nhựa đường", "Bê tông", "Cọc", "Cáp DƯL", "Khác"];

export type PcMaterial = {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  mat_group: string | null;
  is_critical: boolean;
  active: boolean;
};

export type PcMaterialPrice = {
  id: string;
  material_id: string;
  effective_date: string;
  price: number;
  source: string | null;
  province: string | null;
};

export type PcMaterialBudget = {
  id: string;
  project_id: string;
  segment_wbs_id: string;
  material_id: string;
  norm_per_unit: number;
  budget_qty: number;
  note: string | null;
};

export type PcMaterialIssue = {
  id: string;
  project_id: string;
  material_budget_id: string;
  contract_id: string | null;
  issue_date: string;
  qty: number;
  supplier: string | null;
  doc_no: string | null;
  note: string | null;
  created_by: string | null;
};

// Dòng view pc_v_material_status (không chứa tiền).
export type PcMaterialStatus = {
  material_budget_id: string;
  project_id: string;
  segment_id: string;
  segment_wbs_id: string;
  material_id: string;
  norm_per_unit: number;
  budget_qty: number;
  issued_qty: number;
  done_qty: number;
  done_qty_14d: number;
  wbs_budget_qty: number;
  needed_by_output: number;
  site_stock: number;
  remaining_budget: number;
  still_needed: number;
  daily_use: number;
};

// Chỉ số một dòng dự toán (đặc tả 8.7).
export function materialMetrics(x: PcMaterialStatus, cfg?: { mat_days_warn: number; mat_waste_warn: number }) {
  const n = (v: unknown) => Number(v || 0);
  const budget = n(x.budget_qty);
  const issued = n(x.issued_qty);
  const need = n(x.needed_by_output);
  const stock = n(x.site_stock);
  const remaining = n(x.remaining_budget);
  const stillNeeded = n(x.still_needed);
  const daily = n(x.daily_use);
  const waste = issued - need;
  const wastePct = need > 0 ? waste / need : null;
  const shortage = stillNeeded - remaining; // > 0 = sẽ vượt dự toán
  const daysLeft = daily > 0 ? Math.max(0, stock) / daily : null;
  const warnDays = cfg?.mat_days_warn ?? 7;
  const warnWaste = cfg?.mat_waste_warn ?? 0.05;
  const runningOut = daysLeft !== null && stillNeeded > Math.max(0, stock) && daysLeft < warnDays;
  const overuse = wastePct !== null && wastePct > warnWaste;
  return {
    budget,
    issued,
    issuedPct: budget > 0 ? issued / budget : null,
    need,
    waste,
    wastePct,
    remaining,
    stillNeeded,
    shortage,
    stock,
    daily,
    daysLeft,
    runOutDate: daysLeft !== null && stillNeeded > Math.max(0, stock) ? addDays(todayVN(), Math.floor(daysLeft)) : null,
    runningOut,
    overuse,
    problem: shortage > 0 || runningOut || overuse,
  };
}

// ════════════════════════════════════════════════════════════
// P6 — Vòng đời, gate, hoàn công, quyết toán, bảo hành — migration 102
// ════════════════════════════════════════════════════════════

// Thứ tự hiển thị trên thanh tiến trình (SUSPENDED là nhánh phụ của Thi công).
export const LIFECYCLE_STEPS: PcProjectStatus[] = ["PREPARING", "MOBILIZING", "EXECUTING", "COMPLETED", "SETTLEMENT", "WARRANTY", "CLOSED"];

// Khớp pc_transition_kind trong SQL.
export const TRANSITIONS: { from: PcProjectStatus; to: PcProjectStatus; kind: "FORWARD" | "SUSPEND" | "BACK" }[] = [
  { from: "PREPARING", to: "MOBILIZING", kind: "FORWARD" },
  { from: "MOBILIZING", to: "EXECUTING", kind: "FORWARD" },
  { from: "EXECUTING", to: "COMPLETED", kind: "FORWARD" },
  { from: "COMPLETED", to: "SETTLEMENT", kind: "FORWARD" },
  { from: "SETTLEMENT", to: "WARRANTY", kind: "FORWARD" },
  { from: "WARRANTY", to: "CLOSED", kind: "FORWARD" },
  { from: "EXECUTING", to: "SUSPENDED", kind: "SUSPEND" },
  { from: "SUSPENDED", to: "EXECUTING", kind: "SUSPEND" },
  { from: "MOBILIZING", to: "PREPARING", kind: "BACK" },
  { from: "COMPLETED", to: "EXECUTING", kind: "BACK" },
];

export type GateCheck = { key: string; label: string; ok: boolean; detail: string };

export type PcLifecycleEvent = {
  id: string;
  project_id: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  forced: boolean;
  gate_result: GateCheck[] | null;
  changed_by: string | null;
  changed_at: string;
};

export type PcCloseoutGroup = "I" | "II" | "III";

export type PcCloseoutItem = {
  id: string;
  project_id: string;
  group_code: PcCloseoutGroup;
  item_no: string | null; // "1"…"16", ý con "10.a"; null = mục tự thêm
  item_name: string;
  internal_status: Tri;
  supervisor_status: Tri;
  person_name: string | null;
  due_date: string | null;
  note: string | null;
  sort_order: number;
};

// Hồ sơ hoàn công — 3 nhóm lớn (migration 108). `headings` = tiêu đề của mục có ý
// con (vd III.10): chỉ hiển thị, không chấm trạng thái; các ý con "10.a"… chấm riêng.
export const CLOSEOUT_GROUPS: {
  code: PcCloseoutGroup;
  title: string;
  items: { no: string; name: string }[];
  headings?: Record<string, string>;
}[] = [
  {
    code: "I",
    title: "Hồ sơ chuẩn bị đầu tư xây dựng và hợp đồng",
    items: [
      { no: "1", name: "Quyết định chủ trương đầu tư xây dựng và Báo cáo nghiên cứu tiền khả thi đầu tư xây dựng (nếu có)" },
      { no: "2", name: "Quyết định phê duyệt dự án đầu tư xây dựng công trình và Báo cáo nghiên cứu khả thi đầu tư xây dựng hoặc Báo cáo kinh tế - kỹ thuật đầu tư xây dựng" },
      { no: "3", name: "Nhiệm vụ thiết kế, các văn bản thẩm định, tham gia ý kiến của các cơ quan có liên quan trong việc thẩm định dự án đầu tư xây dựng và thiết kế cơ sở" },
      { no: "4", name: "Phương án đền bù giải phóng mặt bằng và xây dựng tái định cư (nếu có)" },
      { no: "5", name: "Văn bản của các tổ chức, cơ quan nhà nước có thẩm quyền (nếu có) về: thỏa thuận quy hoạch, thỏa thuận hoặc chấp thuận sử dụng hoặc đấu nối với công trình kỹ thuật bên ngoài hàng rào; đánh giá tác động môi trường, bảo đảm an toàn (an toàn giao thông, an toàn cho các công trình lân cận) và các văn bản khác có liên quan" },
      { no: "6", name: "Quyết định giao đất, cho thuê đất của cơ quan có thẩm quyền hoặc hợp đồng thuê đất đối với trường hợp không được cấp đất" },
      { no: "7", name: "Giấy phép xây dựng, trừ những trường hợp được miễn giấy phép xây dựng" },
      { no: "8", name: "Quyết định chỉ định thầu, phê duyệt kết quả lựa chọn các nhà thầu và hợp đồng xây dựng giữa chủ đầu tư với các nhà thầu" },
      { no: "9", name: "Các tài liệu chứng minh năng lực của các nhà thầu theo quy định" },
      { no: "10", name: "Các hồ sơ, tài liệu khác có liên quan trong giai đoạn chuẩn bị đầu tư xây dựng" },
    ],
  },
  {
    code: "II",
    title: "Hồ sơ khảo sát, thiết kế xây dựng công trình",
    items: [
      { no: "1", name: "Nhiệm vụ khảo sát, phương án kỹ thuật khảo sát, báo cáo kết quả khảo sát xây dựng" },
      { no: "2", name: "Văn bản phê duyệt báo cáo kết quả khảo sát xây dựng đối với trường hợp không phê duyệt trực tiếp lên báo cáo khảo sát xây dựng" },
      { no: "3", name: "Kết quả thẩm tra, thẩm định thiết kế xây dựng; quyết định phê duyệt thiết kế xây dựng công trình kèm theo: hồ sơ thiết kế xây dựng công trình đã được phê duyệt (có danh mục bản vẽ kèm theo); chỉ dẫn kỹ thuật" },
      { no: "4", name: "Văn bản thông báo chấp thuận nghiệm thu thiết kế xây dựng công trình" },
      { no: "5", name: "Các văn bản, tài liệu, hồ sơ khác có liên quan đến giai đoạn khảo sát, thiết kế xây dựng công trình" },
    ],
  },
  {
    code: "III",
    title: "Hồ sơ quản lý thi công xây dựng công trình",
    headings: {
      "10": "Văn bản thỏa thuận, chấp thuận, xác nhận của các tổ chức, cơ quan nhà nước có thẩm quyền (nếu có) về:",
    },
    items: [
      { no: "1", name: "Danh mục các thay đổi thiết kế trong quá trình thi công xây dựng công trình và các văn bản thẩm định, phê duyệt của cấp có thẩm quyền" },
      { no: "2", name: "Bản vẽ hoàn công (có danh mục bản vẽ kèm theo)" },
      { no: "3", name: "Các kế hoạch, biện pháp kiểm tra, kiểm soát chất lượng thi công xây dựng công trình" },
      { no: "4", name: "Các chứng từ chứng nhận xuất xứ hàng hóa, nhãn mác hàng hóa, tài liệu công bố tiêu chuẩn áp dụng đối với sản phẩm, hàng hóa; chứng nhận hợp quy, công bố hợp quy, thông báo tiếp nhận hồ sơ công bố hợp quy của cơ quan chuyên ngành; chứng nhận hợp chuẩn (nếu có) theo quy định của Luật Chất lượng sản phẩm hàng hóa" },
      { no: "5", name: "Các kết quả quan trắc (nếu có), đo đạc, thí nghiệm trong quá trình thi công" },
      { no: "6", name: "Các biên bản nghiệm thu công việc xây dựng, nghiệm thu bộ phận hoặc giai đoạn công trình (nếu có) trong quá trình thi công xây dựng" },
      { no: "7", name: "Các kết quả thí nghiệm đối chứng, kiểm định chất lượng công trình, thí nghiệm khả năng chịu lực kết cấu xây dựng (nếu có)" },
      { no: "8", name: "Hồ sơ quản lý chất lượng của thiết bị lắp đặt vào công trình" },
      { no: "9", name: "Quy trình vận hành, khai thác công trình (nếu có); quy trình bảo trì công trình" },
      { no: "10.a", name: "Di dân vùng lòng hồ, khảo sát các di tích lịch sử, văn hóa" },
      { no: "10.b", name: "An toàn phòng cháy, chữa cháy" },
      { no: "10.c", name: "An toàn môi trường" },
      { no: "10.d", name: "An toàn lao động, an toàn vận hành hệ thống thiết bị công trình, thiết bị công nghệ" },
      { no: "10.đ", name: "Thực hiện Giấy phép xây dựng (đối với trường hợp phải có giấy phép xây dựng)" },
      { no: "10.e", name: "Cho phép đấu nối với công trình hạ tầng kỹ thuật và các công trình khác có liên quan" },
      { no: "10.g", name: "Văn bản của cơ quan chuyên môn về xây dựng, quản lý phát triển đô thị về việc hoàn thành các công trình hạ tầng kỹ thuật có liên quan của dự án theo kế hoạch xây dựng nêu tại Báo cáo nghiên cứu khả thi đã được thẩm định, phê duyệt" },
      { no: "10.h", name: "Các văn bản khác theo quy định của pháp luật có liên quan" },
      { no: "11", name: "Hồ sơ giải quyết sự cố công trình (nếu có)" },
      { no: "12", name: "Phụ lục các tồn tại cần sửa chữa, khắc phục (nếu có) sau khi đưa hạng mục công trình, công trình xây dựng vào sử dụng" },
      { no: "13", name: "Biên bản nghiệm thu hoàn thành hạng mục công trình, công trình xây dựng" },
      { no: "14", name: "Văn bản thông báo của cơ quan có thẩm quyền quy định tại khoản 4 Điều 57 Luật Xây dựng số 135/2025/QH15 (nếu có)" },
      { no: "15", name: "Các hồ sơ, tài liệu có liên quan trong quá trình thực hiện kiểm tra công tác nghiệm thu theo quy định (nếu có)" },
      { no: "16", name: "Các hồ sơ/văn bản/tài liệu khác có liên quan trong giai đoạn thi công xây dựng và nghiệm thu công trình xây dựng" },
    ],
  },
];

export type PcSettlement = {
  id: string;
  project_id: string;
  contract_id: string;
  settlement_value: number | null;
  doc_no: string | null;
  submitted_date: string | null;
  approved_date: string | null;
  status: "DRAFT" | "SUBMITTED" | "APPROVED";
  note: string | null;
};

export type PcWarranty = {
  project_id: string;
  warranty_start: string | null;
  warranty_months: number | null;
  guarantee_no: string | null;
  guarantee_bank: string | null;
  guarantee_expiry: string | null;
  guarantee_released: boolean;
  note: string | null;
};

export type PcWarrantyIssue = {
  id: string;
  project_id: string;
  segment_id: string | null;
  reported_date: string;
  description: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  status: "OPEN" | "FIXING" | "DONE";
  due_date: string | null;
  fixed_date: string | null;
  contract_id: string | null;
  note: string | null;
};

export const WARRANTY_ISSUE_STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "Mới báo", cls: "bg-rose-50 text-rose-600" },
  FIXING: { label: "Đang khắc phục", cls: "bg-amber-50 text-amber-700" },
  DONE: { label: "Đã xong", cls: "bg-emerald-50 text-emerald-700" },
};

// Ngày hết bảo hành = ngày bắt đầu + số tháng (khớp pc_warranty_end).
export function warrantyEnd(w: Pick<PcWarranty, "warranty_start" | "warranty_months"> | null): string | null {
  if (!w?.warranty_start || !w.warranty_months) return null;
  const [y, m, d] = w.warranty_start.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + Number(w.warranty_months), 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
