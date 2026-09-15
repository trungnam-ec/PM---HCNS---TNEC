"use client";

// ============================================================
// PHIẾU TRÌNH KÝ HỒ SƠ/VĂN BẢN (migration 050 + 051)
//
// Một chỗ duy nhất định nghĩa: máy trạng thái, ai được làm gì ở bước nào, và
// cách tính A-B-C-D. Trang và modal chỉ gọi lại — luật nằm rải rác ở nhiều
// component là cách chắc chắn nhất để giao diện nói một đằng CSDL chặn một nẻo.
//
// LƯU Ý: mọi luật ở đây CHỈ để dựng giao diện cho đúng. Chốt chặn thật nằm ở
// trigger `guard_signing_transition` và RLS của migration 050 — người dùng gọi
// thẳng REST API vẫn bị chặn.
// ============================================================

import { supabase } from "./supabase";
import { apiFetch } from "./apiClient";
import { emailFieldMatches } from "./emailMatch";
import type { ApprovalPermissions } from "./approvers";
import {
  fetchApprovalGroups, getApprovalGroupOfMember, isDepartmentManagerRole, normalizeName,
} from "./approvers";

export const SIGNING_BUCKET = "signing-dossiers";
const SIGNED_TTL = 60 * 60; // 1 giờ

// Một chặng Phó Giám đốc duy nhất: QLDA HOẶC KHĐT, ai xem trước cũng được
// (migration 053). Hai giá trị cũ giữ trong kiểu để phiếu lịch sử không vỡ.
export type SigningStatus =
  | "nhap"
  | "cho_cap1"           // migration 074 — bước Cấp 1 (Tổ trưởng / TP-PP / Admin)
  | "cho_pho_giam_doc"
  | "cho_giam_doc"
  | "cho_ke_toan"
  | "hoan_tat"
  | "tra_lai"
  | "cho_pgd_qlda"       // migration 074 — PGĐ Dự án (được chọn)
  | "cho_pgd_khdt";      // migration 074 — PGĐ KHĐT (được chọn)

export type SigningFile = { path: string; name: string; size?: number };

// ─── Ba loại phiếu (migration 060 + 079) ───
// ho_so       : TL/BM/011    — trình MỘT ĐỢT THANH TOÁN của hợp đồng đã ký.
// hop_dong    : KHKT/BM/001  — trình NỘI DUNG HỢP ĐỒNG trước khi ký.
// chuyen_tien : HC-BM021/ĐNCT — đề nghị CHUYỂN TIỀN cho một dòng kế hoạch thu
//               chi. Không gắn hợp đồng/đợt, không có bảng A−B−C−D; thứ nó cần
//               mà hai loại kia không có là số tài khoản + ngân hàng người nhận.
export type SigningLoai = "ho_so" | "hop_dong" | "chuyen_tien";

export const LOAI_META: Record<SigningLoai, { label: string; short: string; bieuMau: string; chip: string }> = {
  ho_so: {
    label: "Trình ký hồ sơ / văn bản",
    short: "Hồ sơ",
    bieuMau: "TL/BM/011",
    chip: "bg-blue-50 text-blue-700",
  },
  hop_dong: {
    label: "Trình ký hợp đồng",
    short: "Hợp đồng",
    bieuMau: "KHKT/BM/001",
    chip: "bg-violet-50 text-violet-700",
  },
  chuyen_tien: {
    label: "Đề nghị chuyển tiền",
    short: "Chuyển tiền",
    bieuMau: "HC-BM021/ĐNCT",
    chip: "bg-emerald-50 text-emerald-700",
  },
};

/** Một dòng trong bảng so sánh A-B ↔ B-B′. Số dòng THÊM/BỚT được, không cố định 6. */
export type SoSanhRow = { stt: string; muc: string; ab: string; bb: string };

/** 6 dòng a–f theo đúng tờ mẫu — chỉ dùng làm GỢI Ý khi lập phiếu mới. */
export const SO_SANH_MAU: SoSanhRow[] = [
  { stt: "a)", muc: "Tạm ứng", ab: "", bb: "" },
  { stt: "b)", muc: "Nghiệm thu thanh toán", ab: "", bb: "" },
  { stt: "c)", muc: "Bảo đảm THHĐ", ab: "", bb: "" },
  { stt: "d)", muc: "Giữ bảo hành", ab: "", bb: "" },
  { stt: "e)", muc: "Giữ quyết toán", ab: "", bb: "" },
  { stt: "f)", muc: "Thuế vãng lai", ab: "", bb: "" },
];

export type SigningSubmission = {
  id: string;
  ma_phieu: string | null;

  don_vi: string | null;
  ve_viec: string | null;
  noi_dung_trinh: string | null;

  dot_so: number | null;
  chu_dau_tu: string | null;
  du_an: string | null;
  hop_dong_so: string | null;
  ngay_ky_hop_dong: string | null;
  goi_thau: string | null;
  gia_tri_hd: number | null;
  gia_tri_nghiem_thu: number | null;
  giu_bao_hanh: number | null;
  giu_lai_tung_lan: number | null;
  ty_le_giu_lai: number | null;
  khau_tru_tam_ung: number | null;
  ty_le_thu_hoi: number | null;
  de_nghi_thanh_toan: number | null;
  luy_ke_da_thanh_toan: number | null;
  tam_ung_con_lai: number | null;

  project_code: string | null;
  project_name: string | null;

  ai_ghi_chu: string | null;
  ai_thieu: string[];
  files: SigningFile[];

  // ─── migration 060 ───
  loai: SigningLoai;
  hang_muc: string | null;
  ben_a: string | null;
  ben_b: string | null;
  vat_percent: number | null;
  so_sanh: SoSanhRow[];

  // ─── migration 079: riêng phiếu 'chuyen_tien' ───
  so_tai_khoan: string | null;
  ngan_hang: string | null;

  status: SigningStatus;

  // ─── migration 074: luồng động + cấp 1 ───
  route: SigningStatus[];        // danh sách bước của riêng phiếu
  cap1_email: string | null;     // email người duyệt cấp 1 (null = Admin duyệt thay)
  cap1_by: string | null;
  cap1_at: string | null;
  ykien_cap1: string | null;
  pgd_chon: "" | "qlda" | "khdt" | null;  // PGĐ người trình chọn

  ykien_qlda: string | null;
  qlda_by: string | null;
  qlda_at: string | null;
  ykien_khdt: string | null;
  khdt_by: string | null;
  khdt_at: string | null;
  ykien_giam_doc: string | null;
  giam_doc_by: string | null;
  giam_doc_at: string | null;
  ke_toan_by: string | null;
  ke_toan_at: string | null;
  ngay_chi: string | null;

  tra_lai_tu: string | null;
  tra_lai_boi: string | null;
  tra_lai_luc: string | null;
  tra_lai_ly_do: string | null;

  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Nhãn + màu theo trạng thái ───
export const STATUS_META: Record<
  SigningStatus,
  { label: string; short: string; chip: string }
> = {
  nhap:             { label: "Nháp",              short: "Nháp",      chip: "bg-slate-100 text-slate-600" },
  cho_cap1:         { label: "Chờ Trưởng bộ phận", short: "Trưởng BP", chip: "bg-amber-50 text-amber-700" },
  cho_pho_giam_doc: { label: "Chờ Phó Giám đốc",  short: "Phó GĐ",    chip: "bg-amber-50 text-amber-700" },
  cho_giam_doc:     { label: "Chờ Giám đốc",      short: "Giám đốc",  chip: "bg-orange-50 text-orange-700" },
  cho_ke_toan:      { label: "Chờ Kế toán chi",   short: "Kế toán",   chip: "bg-blue-50 text-blue-700" },
  hoan_tat:         { label: "Hoàn tất",          short: "Hoàn tất",  chip: "bg-emerald-50 text-emerald-700" },
  tra_lai:          { label: "Bị trả lại",        short: "Trả lại",   chip: "bg-rose-50 text-rose-700" },
  // Phiếu cũ từ trước migration 053 — vẫn phải hiển thị được.
  cho_pgd_qlda:     { label: "Chờ Phó Giám đốc",  short: "Phó GĐ",    chip: "bg-amber-50 text-amber-700" },
  cho_pgd_khdt:     { label: "Chờ Phó Giám đốc",  short: "Phó GĐ",    chip: "bg-amber-50 text-amber-700" },
};

// Nhãn nút hành động của TỪNG CẤP. Hai Phó Giám đốc "xem xét" chứ không "phê
// duyệt" — phê duyệt là thẩm quyền của Giám đốc, còn Kế toán thì xác nhận đã
// chi. Gọi đúng tên theo quy trình giấy để người ký không hiểu nhầm thẩm quyền.
export const ACTION_LABEL: Partial<Record<SigningStatus, string>> = {
  cho_pho_giam_doc: "Đã xem xét",
  cho_giam_doc: "Phê duyệt",
  cho_ke_toan: "Đã xác nhận",
  cho_pgd_qlda: "Đã xem xét",
  cho_pgd_khdt: "Đã xem xét",
};

// Câu mô tả việc vừa xảy ra, dùng cho email báo người lập.
export const EVENT_LABEL: Partial<Record<SigningStatus, string>> = {
  cho_pho_giam_doc: "Phó Giám đốc đã xem xét",
  cho_giam_doc: "Giám đốc đã phê duyệt",
  cho_ke_toan: "Kế toán đã xác nhận chi",
  cho_pgd_qlda: "Phó Giám đốc đã xem xét",
  cho_pgd_khdt: "Phó Giám đốc đã xem xét",
};

// Thứ tự đi của phiếu. Dùng cho thanh tiến trình và để suy ra bước kế tiếp —
// không viết tay "bước sau của X là Y" ở nhiều nơi.
//
// CHỈ MỘT chặng Phó Giám đốc: một trong hai vị (QLDA hoặc KHĐT) xem xét là
// chuyển thẳng Giám đốc, không phải qua đủ cả hai (migration 053).
export const FLOW: SigningStatus[] = [
  "cho_pho_giam_doc",
  "cho_giam_doc",
  "cho_ke_toan",
  "hoan_tat",
];

// Phiếu HỢP ĐỒNG hết luồng ngay sau Giám đốc: tờ KHKT/BM/001 chỉ có 3 ô ký
// (Người trình · Phụ trách · BLĐ Phê duyệt), không có chỗ cho Kế toán vì hợp
// đồng chưa phát sinh chi tiền.
//
// ⚠ Luật này PHẢI khớp với trigger `guard_signing_transition` ở migration 060.
// Lệch nhau thì giao diện đẩy phiếu sang một bước mà CSDL từ chối, hoặc tệ hơn:
// phiếu treo ở chặng không cấp nào giữ.
export const FLOW_HOP_DONG: SigningStatus[] = [
  "cho_pho_giam_doc",
  "cho_giam_doc",
  "hoan_tat",
];

// Chỉ dùng cho PHIẾU CŨ (route rỗng, lập trước 074). Phiếu 'chuyen_tien' sinh
// sau 074 nên luôn có route — nhánh này không bao giờ chạm tới nó, nhưng vẫn
// trả về FLOW (có chặng Kế toán) để không có góc nào trả undefined.
export function flowOf(loai: SigningLoai): SigningStatus[] {
  return loai === "hop_dong" ? FLOW_HOP_DONG : FLOW;
}

// Phiếu cũ nằm ở trạng thái trước 053 thì quy về chặng Phó Giám đốc, để
// nextStatus / thanh tiến trình không bị lệch.
export function normalizeStatus(s: SigningStatus): SigningStatus {
  return s === "cho_pgd_qlda" || s === "cho_pgd_khdt" ? "cho_pho_giam_doc" : s;
}

// `loai` BẮT BUỘC truyền vào, không để mặc định 'ho_so': quên truyền thì phiếu
// hợp đồng sẽ bị đẩy sang chặng Kế toán và trigger 060 chặn lại — lỗi chỉ lộ ra
// lúc người dùng bấm duyệt, rất khó lần.
export function nextStatus(cur: SigningStatus, loai: SigningLoai): SigningStatus | null {
  const flow = flowOf(loai);
  const i = flow.indexOf(normalizeStatus(cur));
  return i >= 0 && i < flow.length - 1 ? flow[i + 1] : null;
}

// ─── LUỒNG ĐỘNG THEO ROUTE (migration 074) ───
// Dựng danh sách bước cho phiếu MỚI: Cấp 1 → [PGĐ nếu chọn] → Giám đốc →
// [Kế toán nếu là phiếu chi tiền = loại 'ho_so']. Đây là chỗ DUY NHẤT quyết
// định luồng — trigger CSDL chỉ đi theo mảng này, không tự suy.
// PGĐ chọn TỰ DO (0, 1 hoặc 2 ô tích): đi qua lần lượt QLDA rồi KHĐT nếu tích cả
// hai. Thứ tự QLDA trước KHĐT khớp thứ tự ô ý kiến trên tờ phiếu (mục 3 rồi mục 4).
export function buildSigningRoute(
  loai: SigningLoai,
  pgdQlda: boolean,
  pgdKhdt: boolean
): SigningStatus[] {
  const r: SigningStatus[] = ["cho_cap1"];
  if (pgdQlda) r.push("cho_pgd_qlda");
  if (pgdKhdt) r.push("cho_pgd_khdt");
  r.push("cho_giam_doc");
  if (loai !== "hop_dong") r.push("cho_ke_toan"); // chỉ phiếu chi tiền
  return r;
}

// Các bước để hiển thị thanh tiến trình: route riêng của phiếu nếu có, không thì
// suy từ luồng cũ (phiếu trước 074).
export function stepsOfSubmission(s: SigningSubmission): SigningStatus[] {
  if (Array.isArray(s.route) && s.route.length) return s.route;
  return flowOf(s.loai).filter((x) => x !== "hoan_tat");
}

// Bước kế tiếp khi duyệt: theo route nếu có (bước cuối -> 'hoan_tat'); phiếu cũ
// dùng lại nextStatus. null = không xác định được (không nên xảy ra khi đang duyệt).
export function advanceStatus(s: SigningSubmission): SigningStatus | null {
  if (Array.isArray(s.route) && s.route.length) {
    const i = s.route.indexOf(s.status);
    if (i < 0) return null;
    return i < s.route.length - 1 ? s.route[i + 1] : "hoan_tat";
  }
  return nextStatus(s.status, s.loai);
}

// ─── Tính NGƯỜI DUYỆT CẤP 1 lúc lập/trình phiếu (migration 074) ───
// Thứ tự: Tổ trưởng (nếu người trình thuộc tổ) → Trưởng/Phó phòng cùng phòng
// (ưu tiên Trưởng phòng, loại chính người trình) → thiếu cả 3 thì Admin (email null).
// Trả EMAIL để trigger CSDL khớp danh tính người duyệt; kèm tên để hiển thị.
export type Cap1Result = { email: string | null; name: string | null };

export async function resolveCap1(params: {
  submitterName: string;
  submitterEmail: string;
  dept: string;
}): Promise<Cap1Result> {
  const { submitterName, submitterEmail, dept } = params;
  await fetchApprovalGroups();

  const { data: people } = await supabase
    .from("employees_directory")
    .select("name, email, role, department");
  const list = (people || []) as {
    name: string; email: string | null; role: string | null; department: string | null;
  }[];
  const emailOf = (name: string): string | null =>
    list.find((p) => normalizeName(p.name) === normalizeName(name))?.email || null;

  // 1) Tổ trưởng của tổ người trình.
  const group = getApprovalGroupOfMember(submitterName);
  if (group?.leader_name && normalizeName(group.leader_name) !== normalizeName(submitterName)) {
    return { email: emailOf(group.leader_name), name: group.leader_name };
  }

  // 2) Trưởng/Phó phòng cùng phòng (loại chính người trình).
  const d = normalizeName(dept);
  const mgrs = d
    ? list.filter((p) =>
        normalizeName(p.department) === d &&
        normalizeName(p.name) !== normalizeName(submitterName) &&
        (!submitterEmail || normalizeName(p.email || "") !== normalizeName(submitterEmail)) &&
        isDepartmentManagerRole(p.role))
    : [];
  const isTP = (r?: string | null) => {
    const x = normalizeName(r);
    return x.includes("truong phong") && !x.includes("pho truong phong");
  };
  const chosen = mgrs.find((p) => isTP(p.role)) || mgrs[0];
  if (chosen) return { email: chosen.email || null, name: chosen.name };

  // 3) Không có ai -> Admin duyệt thay.
  return { email: null, name: null };
}

// Cờ quyền giữ từng chặng.
//  - cho_pho_giam_doc: chặng GỘP của phiếu CŨ (một trong hai cờ) — giữ cho phiếu lịch sử.
//  - cho_pgd_qlda / cho_pgd_khdt: chặng PGĐ được CHỌN của phiếu mới (074) — mỗi bên một cờ.
//  - cho_cap1: KHÔNG theo cờ mà theo email lưu trên phiếu (xử lý riêng trong canActOn).
const STAGE_FLAGS: Partial<Record<SigningStatus, (keyof ApprovalPermissions)[]>> = {
  cho_pho_giam_doc: ["canApproveSigningQlda", "canApproveSigningKhdt"],
  cho_pgd_qlda: ["canApproveSigningQlda"],
  cho_pgd_khdt: ["canApproveSigningKhdt"],
  cho_giam_doc: ["canApproveSigningDirector"],
  cho_ke_toan:  ["canApproveSigningAccounting"],
};

// Tên cột trong approval_permissions, để tra email người giữ chặng kế tiếp.
const STAGE_COLUMNS: Partial<Record<SigningStatus, string[]>> = {
  cho_pho_giam_doc: ["can_approve_signing_qlda", "can_approve_signing_khdt"],
  cho_pgd_qlda: ["can_approve_signing_qlda"],
  cho_pgd_khdt: ["can_approve_signing_khdt"],
  cho_giam_doc: ["can_approve_signing_director"],
  cho_ke_toan:  ["can_approve_signing_accounting"],
};

/**
 * Email của những người giữ cờ duyệt ở một bước — để báo "có phiếu chờ bạn".
 * Cột `email` có thể chứa NHIỀU địa chỉ ngăn bằng dấu phẩy (email công ty +
 * gmail), nên phải tách ra hết chứ không lấy mỗi cái đầu.
 */
export async function fetchStageApproverEmails(stage: SigningStatus): Promise<string[]> {
  // KHÔNG normalize: chặng PGĐ được chọn (cho_pgd_qlda/khdt) phải tra ĐÚNG một cột,
  // normalize sẽ quy về cho_pho_giam_doc rồi lấy cả hai — sai người nhận.
  const cols = STAGE_COLUMNS[stage];
  if (!cols?.length) return [];
  // Chặng Phó Giám đốc có 2 cột -> lấy dòng nào bật MỘT trong hai (or của
  // PostgREST), vì chỉ cần một vị xem xét là phiếu đi tiếp.
  const { data, error } = await supabase
    .from("approval_permissions")
    .select("email")
    .or(cols.map((c) => `${c}.eq.true`).join(","));
  if (error || !data) return [];
  return Array.from(
    new Set(
      data
        .flatMap((r: { email: string | null }) => (r.email || "").split(","))
        .map((e) => e.trim())
        .filter((e) => e.includes("@"))
    )
  );
}

/** Người này có phải cấp đang giữ phiếu không (được Duyệt / Trả lại). */
export function canActOn(
  s: SigningSubmission,
  perms: ApprovalPermissions,
  isAdmin: boolean,
  email?: string
): boolean {
  if (isAdmin) return true;
  // Cấp 1: khớp email đã lưu trên phiếu (không theo cờ). Admin duyệt thay khi
  // phiếu không tính được cấp 1 (cap1_email rỗng) — đã xử lý ở nhánh isAdmin trên.
  if (s.status === "cho_cap1") {
    return !!email && !!s.cap1_email &&
      s.cap1_email.toLowerCase().includes(email.toLowerCase());
  }
  // Các chặng theo cờ. KHÔNG normalize: cho_pgd_qlda/khdt phải khớp đúng một cờ.
  const flags = STAGE_FLAGS[s.status];
  return !!flags?.some((f) => !!perms[f]);
}

/**
 * Ý kiến của người này ghi vào ô nào trên tờ phiếu.
 * Tờ TL/BM/011 có hai ô riêng cho P.QLDA (mục 3) và P.KHĐT (mục 4). Gộp chặng
 * duyệt KHÔNG gộp hai ô đó — vị nào ký thì ghi vào ô của vị ấy, ô còn lại để
 * trắng đúng như tờ giấy. Người giữ cả hai cờ thì mặc định ghi ô QLDA.
 */
export function pgdOpinionField(perms: ApprovalPermissions): "qlda" | "khdt" {
  if (perms.canApproveSigningQlda) return "qlda";
  if (perms.canApproveSigningKhdt) return "khdt";
  return "qlda"; // Admin duyệt thay — ghi vào ô đầu
}

/** Người này có được sửa nội dung phiếu không. */
export function canEdit(
  s: SigningSubmission,
  email: string,
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  const own = !!email && s.created_by.toLowerCase() === email.toLowerCase();
  return own && (s.status === "nhap" || s.status === "tra_lai");
}

/** Các bước mà người này giữ quyền duyệt — dùng để đếm hộp việc cần xử lý. */
export function stagesOf(perms: ApprovalPermissions): SigningStatus[] {
  return (Object.keys(STAGE_FLAGS) as SigningStatus[]).filter((st) =>
    STAGE_FLAGS[st]!.some((f) => !!perms[f])
  );
}

// ─── Tính A-B-C-D ───
// Giữ đúng một bản duy nhất: form nhập, thẻ danh sách và route xuất Word đều
// phải ra cùng một con số, lệch nhau một chỗ là phiếu in ra khác phiếu đã duyệt.
export function tinhDeNghi(s: {
  gia_tri_nghiem_thu?: number | null;
  giu_bao_hanh?: number | null;
  giu_lai_tung_lan?: number | null;
  khau_tru_tam_ung?: number | null;
}): number {
  const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return n(s.gia_tri_nghiem_thu) - n(s.giu_bao_hanh) - n(s.giu_lai_tung_lan) - n(s.khau_tru_tam_ung);
}

/**
 * Đọc lỗi ra chuỗi cho người dùng.
 *
 * BẮT BUỘC có hàm này: supabase-js KHÔNG ném Error mà trả về object thuần
 * { message, details, hint, code }. Viết `e instanceof Error ? e.message :
 * String(e)` thì rơi vào nhánh String() và hiện đúng chữ "[object Object]" —
 * người dùng không biết lỗi gì, mình cũng không lần ra được.
 *
 * Kèm `details`/`hint` vì lỗi RLS và lỗi trigger của Postgres hay nằm ở đó chứ
 * không nằm trong `message`.
 */
export function errText(e: unknown): string {
  if (!e) return "Lỗi không rõ.";
  if (typeof e === "string") return e;
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint]
      .filter((x): x is string => typeof x === "string" && x.trim() !== "");
    if (parts.length) {
      const code = typeof o.code === "string" && o.code ? ` (mã ${o.code})` : "";
      return parts.join(" — ") + code;
    }
    try {
      return JSON.stringify(e);
    } catch {
      return "Lỗi không đọc được.";
    }
  }
  return String(e);
}

export const fmtMoney = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v)
    ? new Intl.NumberFormat("vi-VN").format(Math.round(v))
    : "—";

export const fmtDateTime = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleString("vi-VN", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
        timeZone: "Asia/Ho_Chi_Minh",
      })
    : "—";

// ─── Đọc ───
const COLS = "*";

export async function fetchSubmissions(): Promise<SigningSubmission[]> {
  const { data, error } = await supabase
    .from("signing_submissions")
    .select(COLS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeRow);
}

/**
 * Xoá hẳn một phiếu trình ký.
 *
 * Chốt chặn thật là policy `signing_delete` (migration 050): chỉ Admin, hoặc
 * người lập xoá phiếu còn ở 'nhap'/'tra_lai'. Nút trên UI chỉ hiện với Admin —
 * ẩn nút là cho gọn mắt, không phải cơ chế bảo vệ.
 *
 * RLS chặn thì Postgres KHÔNG báo lỗi, chỉ xoá 0 dòng. Vì vậy phải yêu cầu trả
 * dòng vừa xoá về (`select()`) rồi tự kiểm tra — nếu rỗng thì báo không đủ
 * quyền, đừng để người dùng tưởng đã xoá xong.
 *
 * Tệp hồ sơ trong bucket signing-dossiers KHÔNG xoá theo — cố ý giữ, dọn kho
 * là việc riêng.
 */
export async function deleteSubmission(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("signing_submissions")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Không xoá được phiếu — tài khoản của bạn không đủ quyền xoá.");
  }
}

/**
 * Nhân đôi một phiếu để sửa nhanh thành phiếu mới.
 *
 * CHỈ chép phần NGHIỆP VỤ (hợp đồng, giá trị, số tiền, tệp hồ sơ). KHÔNG chép:
 *   - `ma_phieu`  : trigger tự sinh mã mới, chép sang là đụng ràng buộc unique.
 *   - toàn bộ vết duyệt (ý kiến, người duyệt, mốc thời gian, lý do trả lại) —
 *     phiếu mới chưa ai duyệt, mang vết cũ sang là ghi khống lịch sử.
 *   - `ai_ghi_chu` / `ai_thieu` : nhận xét của AI về BỘ HỒ SƠ ĐÃ QUÉT của phiếu
 *     cũ, dán sang phiếu mới thì không còn đúng nữa.
 *
 * `dot_so` chép NGUYÊN: chỉ số về `nhap` nên không vướng unique index
 * (uq_signing_hopdong_dot bỏ qua trạng thái nhap/tra_lai). Người lập tự sửa
 * sang đợt cần làm.
 *
 * `files` chép tham chiếu, KHÔNG nhân bản tệp trong kho: hai phiếu cùng trỏ vào
 * một đường dẫn. An toàn vì xoá phiếu không đụng tới tệp trong kho — xem
 * `deleteSubmission`, nó chỉ xoá dòng.
 */
export async function duplicateSubmission(
  src: SigningSubmission,
  email: string,
  name: string
): Promise<SigningSubmission> {
  const payload = {
    don_vi: src.don_vi,
    ve_viec: src.ve_viec,
    noi_dung_trinh: src.noi_dung_trinh,
    dot_so: src.dot_so,
    chu_dau_tu: src.chu_dau_tu,
    du_an: src.du_an,
    hop_dong_so: src.hop_dong_so,
    ngay_ky_hop_dong: src.ngay_ky_hop_dong,
    goi_thau: src.goi_thau,
    gia_tri_hd: src.gia_tri_hd,
    gia_tri_nghiem_thu: src.gia_tri_nghiem_thu,
    giu_bao_hanh: src.giu_bao_hanh,
    giu_lai_tung_lan: src.giu_lai_tung_lan,
    ty_le_giu_lai: src.ty_le_giu_lai,
    khau_tru_tam_ung: src.khau_tru_tam_ung,
    ty_le_thu_hoi: src.ty_le_thu_hoi,
    de_nghi_thanh_toan: src.de_nghi_thanh_toan,
    luy_ke_da_thanh_toan: src.luy_ke_da_thanh_toan,
    tam_ung_con_lai: src.tam_ung_con_lai,
    project_code: src.project_code,
    project_name: src.project_name,
    files: src.files,
    status: "nhap",
    created_by: email,
    created_by_name: name || null,
  };

  const { data, error } = await supabase
    .from("signing_submissions")
    .insert([payload])
    .select(COLS)
    .single();
  if (error) throw error;
  return normalizeRow(data as unknown as Record<string, unknown>);
}

// ─── Đính kèm thêm tệp cho một phiếu đã có ───
// Dùng cho cột "File gốc" ngoài danh sách: tải lên rồi NỐI vào mảng `files`,
// không ghi đè — phiếu thường có nhiều tệp, ghi đè là mất bộ hồ sơ đã tải.
export async function appendDossierFiles(
  row: SigningSubmission,
  picked: File[]
): Promise<SigningFile[]> {
  const added: SigningFile[] = [];
  for (const f of picked) {
    added.push(await uploadDossierFile(f));
  }
  const files = [...row.files, ...added];
  const { error } = await supabase
    .from("signing_submissions")
    .update({ files })
    .eq("id", row.id);
  if (error) throw error;
  return files;
}

/**
 * Gỡ một tệp khỏi phiếu.
 *
 * CHỈ xoá THAM CHIẾU trong cột `files`, KHÔNG xoá tệp trong kho. Lý do: phiếu
 * nhân đôi dùng chung đường dẫn với phiếu gốc (xem `duplicateSubmission`), nên
 * xoá vật lý sẽ làm hỏng luôn tệp của phiếu kia — mà từ đây không cách nào biết
 * còn phiếu nào đang trỏ vào nó. Đổi lại kho có thể còn tệp không ai dùng; dọn
 * kho là việc định kỳ, không đáng đánh đổi bằng rủi ro mất hồ sơ của phiếu khác.
 *
 * Trigger `guard_signing_transition` chỉ cho sửa `files` khi phiếu còn ở
 * nháp/trả lại và người sửa là người lập (hoặc Admin) — trùng đúng với `canEdit`
 * mà giao diện đang dùng để ẩn/hiện nút.
 */
export async function removeDossierFile(
  rowId: string,
  files: SigningFile[],
  path: string
): Promise<SigningFile[]> {
  const next = files.filter(f => f.path !== path);
  const { error } = await supabase
    .from("signing_submissions")
    .update({ files: next })
    .eq("id", rowId);
  if (error) throw error;
  return next;
}

function normalizeRow(r: Record<string, unknown>): SigningSubmission {
  return {
    ...(r as unknown as SigningSubmission),
    // Hai cột jsonb: Postgres trả về mảng, nhưng dòng cũ/lỗi có thể là null.
    ai_thieu: Array.isArray(r.ai_thieu) ? (r.ai_thieu as string[]) : [],
    files: Array.isArray(r.files) ? (r.files as SigningFile[]) : [],
    // Phiếu lập trước 060 không có 2 cột này — về mặc định thay vì undefined,
    // để mọi chỗ đọc `s.loai` / `s.so_sanh` không phải kiểm null.
    loai: (r.loai as SigningLoai) || "ho_so",
    so_sanh: Array.isArray(r.so_sanh) ? (r.so_sanh as SoSanhRow[]) : [],
    // migration 074 — phiếu cũ không có route/cap1: về mặc định để mọi chỗ đọc
    // s.route/s.pgd_chon không phải kiểm null.
    route: Array.isArray(r.route) ? (r.route as SigningStatus[]) : [],
    pgd_chon: (r.pgd_chon as SigningSubmission["pgd_chon"]) ?? "",
  };
}

/**
 * Luỹ kế đã thanh toán tính từ các đợt TRƯỚC của cùng hợp đồng, cộng đợt đang lập.
 * Gọi hàm SQL (migration 050) thay vì cộng ở client: client chỉ thấy những phiếu
 * RLS cho phép, cộng thiếu một đợt là sai con số trình Giám đốc.
 */
export async function tinhLuyKe(
  hopDongSo: string,
  dotSo: number,
  dotNay: number
): Promise<number | null> {
  const { data, error } = await supabase.rpc("luy_ke_da_thanh_toan", {
    p_hop_dong_so: hopDongSo,
    p_dot_so: dotSo,
    p_dot_nay: dotNay,
  });
  if (error) return null;
  return typeof data === "number" ? data : Number(data) || null;
}

// ─── Tệp hồ sơ gốc ───
function safeName(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${clean}`;
}

export async function uploadDossierFile(file: File): Promise<SigningFile> {
  const path = safeName(file.name);
  const { error } = await supabase.storage
    .from(SIGNING_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });

  if (error) {
    // Người dùng cuối đọc "Bucket not found" thì không biết phải làm gì.
    const hint = /bucket not found/i.test(error.message)
      ? ` — chưa có kho "${SIGNING_BUCKET}". Chạy migrations/051_signing_dossier_bucket.sql.`
      : /row-level security|policy/i.test(error.message)
      ? " — tài khoản chưa được cấp cờ “Lập phiếu trình ký”."
      : /exceeded the maximum allowed size|payload too large/i.test(error.message)
      ? " — tệp vượt mức 25MB."
      : "";
    throw new Error(`Không tải lên được "${file.name}": ${error.message}${hint}`);
  }
  return { path, name: file.name, size: file.size };
}

// ─── Xuất phiếu Word ───
// Đặt ở lib để màn hình SOẠN THẢO và màn hình CHI TIẾT dùng chung một đường:
// hai nơi tự gọi API rồi tự dựng thẻ <a> tải file thì rất dễ trôi lệch nhau,
// mà phiếu in ra từ hai chỗ bắt buộc phải giống hệt.
export async function downloadSigningForm(
  payload: Record<string, unknown>,
  filename: string
): Promise<void> {
  const res = await apiFetch("/api/export-signing-form", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `Lỗi xuất phiếu (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Dựng payload xuất Word từ một phiếu ĐÃ LƯU.
 * Khác màn hình soạn thảo ở chỗ CÓ kèm ý kiến 3 cấp — xuất từ màn hình chi tiết
 * là để lấy bản phiếu đã có chữ ký/ý kiến, đó mới là bản đem đi lưu hồ sơ.
 */
export function docxPayloadFromRow(s: SigningSubmission): Record<string, unknown> {
  // Phiếu HỢP ĐỒNG: bộ trường khác hẳn, route cũng render bằng nhánh riêng.
  if (s.loai === "hop_dong") {
    return {
      loai: "hop_dong",
      donVi: s.don_vi,
      duAn: s.du_an,
      goiThau: s.goi_thau,
      hangMuc: s.hang_muc,
      hopDongSo: s.hop_dong_so,
      benA: s.ben_a,
      benB: s.ben_b,
      giaTriHD: s.gia_tri_hd,
      vatPercent: s.vat_percent,
      soSanh: s.so_sanh,
      ykienQLDA: s.ykien_qlda || "",
      ykienKHDT: s.ykien_khdt || "",
      ykienGiamDoc: s.ykien_giam_doc || "",
      nguoiTrinh: s.created_by_name || "",
      fileName: docxFileName(s),
    };
  }

  return {
    loai: "ho_so",
    donVi: s.don_vi,
    veViec: s.ve_viec,
    noiDungTrinh: s.noi_dung_trinh,
    dotSo: s.dot_so,
    chuDauTu: s.chu_dau_tu,
    duAn: s.du_an,
    hopDongSo: [s.hop_dong_so, s.ngay_ky_hop_dong ? `ký ngày ${s.ngay_ky_hop_dong}` : ""]
      .filter(Boolean).join(" "),
    goiThau: s.goi_thau,
    giaTriHD: s.gia_tri_hd,
    giaTriNghiemThu: s.gia_tri_nghiem_thu,
    giuBaoHanh: s.giu_bao_hanh,
    giuLaiTungLan: s.giu_lai_tung_lan,
    tyLeGiuLai: s.ty_le_giu_lai,
    khauTruTamUng: s.khau_tru_tam_ung,
    tyLeThuHoi: s.ty_le_thu_hoi,
    deNghiThanhToan: s.de_nghi_thanh_toan ?? tinhDeNghi(s),
    luyKeDaThanhToan: s.luy_ke_da_thanh_toan,
    tamUngConLai: s.tam_ung_con_lai,
    ykienQLDA: s.ykien_qlda || "",
    ykienKHDT: s.ykien_khdt || "",
    ykienGiamDoc: s.ykien_giam_doc || "",
    nguoiTrinh: s.created_by_name || "",
  };
}

export function docxFileName(s: {
  ma_phieu?: string | null; hop_dong_so?: string | null; dot_so?: number | null;
  loai?: SigningLoai;
}): string {
  const safe = String(s.hop_dong_so || s.ma_phieu || "phieu").replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60);
  // Phiếu hợp đồng không có "đợt" — gắn đuôi _Dot_x vào là sai nghiệp vụ.
  if (s.loai === "hop_dong") return `Phieu_Trinh_Ky_Hop_Dong_${safe}.docx`;
  return `Phieu_Trinh_Ky_${safe}_Dot_${s.dot_so ?? "x"}.docx`;
}

// ─── Đẩy sang Bảng kê hồ sơ thanh toán (module Kế toán, migration 068 + 073) ───
// Gọi NGAY SAU khi Giám đốc duyệt phiếu HỒ SƠ/VĂN BẢN (phiếu vào bước Kế toán).
// Tạo sẵn một dòng trong `payment_dossiers` để kế toán khỏi nhập lại:
//   - Người nhận tiền / nội dung / số tiền / dự án / tệp: lấy thẳng từ phiếu.
//   - Số tài khoản + ngân hàng: tra Danh mục đối tác (finance_partners →
//     finance_partner_accounts, tài khoản MẶC ĐỊNH) theo tên đơn vị. Đối tác gõ
//     tay ngoài danh mục thì để trống, kế toán tự điền.
//   - Người đề nghị TT + phòng ban: theo NGƯỜI LẬP phiếu (email → danh bạ).
//
// IDEMPOTENT: cột signing_submission_id là UNIQUE (072). Phiếu bị trả lại rồi
// duyệt lại KHÔNG tạo dòng thứ hai — bắt lỗi trùng khoá 23505 và bỏ qua.
//
// KHÔNG ném lỗi làm hỏng thao tác duyệt ở nơi gọi: phiếu đã chuyển bước rồi, đây
// chỉ là tiện ích điền hộ. Nơi gọi fire-and-forget và chỉ hiện cảnh báo mềm.
export async function pushToPaymentDossier(
  row: SigningSubmission,
  actorEmail: string
): Promise<void> {
  // Chỉ phiếu hồ sơ/văn bản mới có bước Kế toán; phiếu hợp đồng dừng ở Giám đốc.
  if (row.loai === "hop_dong") return;

  const ddmmyyyy = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit", month: "2-digit", year: "numeric",
    }).format(d);

  // Tài khoản nhận tiền — tra theo tên đơn vị (finance_partners.name là unique).
  let soTaiKhoan = "";
  let taiNganHang = "";
  const ten = (row.chu_dau_tu || "").trim();
  // Phiếu đề nghị chuyển tiền (079) đã ghi thẳng tài khoản nhận lên phiếu và
  // Giám đốc đã duyệt ĐÚNG con số tài khoản đó. Ưu tiên nó hơn danh mục đối
  // tác: đơn vị có thể đổi tài khoản mặc định sau khi phiếu được ký.
  if (row.loai === "chuyen_tien" && (row.so_tai_khoan || row.ngan_hang)) {
    soTaiKhoan = row.so_tai_khoan || "";
    taiNganHang = row.ngan_hang || "";
  } else if (ten) {
    const { data: p } = await supabase
      .from("finance_partners")
      .select("id")
      .ilike("name", ten)
      .limit(1);
    const partnerId = p?.[0]?.id as string | undefined;
    if (partnerId) {
      const { data: acc } = await supabase
        .from("finance_partner_accounts")
        .select("bank_account, bank_name, bank_branch")
        .eq("partner_id", partnerId)
        .order("is_default", { ascending: false })
        .limit(1);
      const a = acc?.[0] as { bank_account?: string; bank_name?: string; bank_branch?: string } | undefined;
      if (a) {
        soTaiKhoan = a.bank_account || "";
        taiNganHang = [a.bank_name, a.bank_branch].filter(Boolean).join(" - ");
      }
    }
  }

  // Phòng ban người lập — khớp email TUYỆT ĐỐI (`%X%` chỉ là bộ lọc thô ở DB;
  // email này có thể là chuỗi con của email người khác nên phải lọc lại).
  let phongBan = "";
  if (row.created_by) {
    const { data: emp } = await supabase
      .from("employees_directory")
      .select("department, email")
      .ilike("email", `%${row.created_by}%`);
    phongBan =
      (emp || []).find((r) => emailFieldMatches((r as { email?: string | null }).email, row.created_by))
        ?.department || "";
  }

  const amount = row.de_nghi_thanh_toan ?? tinhDeNghi(row);
  const hasAmount = typeof amount === "number" && Number.isFinite(amount);

  const { error } = await supabase.from("payment_dossiers").insert([{
    signing_submission_id: row.id,
    ngay_nhap: ddmmyyyy(new Date()),
    ngay_de_nghi: row.created_at ? ddmmyyyy(new Date(row.created_at)) : ddmmyyyy(new Date()),
    nguoi_nhan_tien: ten || null,
    noi_dung_tt: row.ve_viec || row.noi_dung_trinh || null,
    so_tien_de_nghi: hasAmount ? fmtMoney(amount) : null,
    so_tien_de_nghi_num: hasAmount ? amount : null,
    du_an: row.du_an || null,
    nguoi_de_nghi_tt: row.created_by_name || row.created_by || null,
    don_vi_cong_tac: phongBan || null,
    so_tai_khoan: soTaiKhoan || null,
    tai_ngan_hang: taiNganHang || null,
    ten_file_pdf: row.files.length ? row.files.map((f) => f.name).join("; ") : null,
    created_by: actorEmail || null,
  }]);

  // Trùng khoá = đã tạo ở lần duyệt trước -> bỏ qua, không phải lỗi.
  if (error && (error as { code?: string }).code !== "23505") throw error;
}

export async function resolveDossierUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(SIGNING_BUCKET)
    .createSignedUrl(path, SIGNED_TTL);
  if (error || !data) return null;
  return data.signedUrl;
}

// ─── Báo email lúc TRÌNH PHIẾU ĐI (dùng chung cho 2 cửa) ───
// Phiếu có thể được trình từ HAI chỗ: nút "Trình" ở màn hình chi tiết
// (SigningPanel) và nút "Trình duyệt" ngay trong form lập phiếu
// (SigningFormModal — cũng là cửa mà "Trình ký online" bên Kế hoạch thu chi đi
// vào). Trước 15/09/2026 chỉ cửa thứ nhất gửi email, nên phiếu lập-và-trình
// một lèo thì cấp 1 KHÔNG nhận được gì: không mail, không chuông, việc nằm im.
//
// Fire-and-forget đúng khuôn của SigningPanel: phiếu đã chuyển bước trong CSDL
// rồi, SMTP hỏng cũng không được phép làm hỏng thao tác — chỉ trả về câu cảnh
// báo (hoặc chuỗi rỗng nếu êm) để nơi gọi hiển thị mềm.
export async function notifySigningSubmitted(params: {
  row: {
    ma_phieu?: string | null; hop_dong_so?: string | null; du_an?: string | null;
    chu_dau_tu?: string | null; dot_so?: number | null; de_nghi_thanh_toan?: number | null;
    cap1_email?: string | null; created_by?: string | null; created_by_name?: string | null;
  };
  firstStep: SigningStatus;
  actorName: string;
}): Promise<string> {
  const { row, firstStep, actorName } = params;
  try {
    // Bước cấp 1 không theo cờ — email người duyệt đã chốt trên chính phiếu.
    const nextEmails =
      firstStep === "cho_cap1"
        ? (row.cap1_email || "").split(",").map((e) => e.trim()).filter((e) => e.includes("@"))
        : await fetchStageApproverEmails(firstStep);
    const res = await apiFetch("/api/send-signing-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        maPhieu: row.ma_phieu,
        hopDongSo: row.hop_dong_so,
        duAn: row.du_an,
        chuDauTu: row.chu_dau_tu,
        dotSo: row.dot_so,
        soTien: row.de_nghi_thanh_toan,
        event: "trinh",
        nextLabel: STATUS_META[firstStep]?.label,
        actorName,
        creatorEmail: row.created_by,
        creatorName: row.created_by_name,
        nextApproverEmails: nextEmails,
        siteUrl: typeof window !== "undefined" ? window.location.origin : "",
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return j.error || `Không gửi được email (${res.status}).`;
    if (j.failed?.length) return `Gửi email lỗi: ${j.failed.join("; ")}`;
    if (!j.sent?.length) return "Không có địa chỉ email nào để gửi thông báo.";
    return "";
  } catch (e) {
    return `Không gửi được email: ${errText(e)}`;
  }
}
