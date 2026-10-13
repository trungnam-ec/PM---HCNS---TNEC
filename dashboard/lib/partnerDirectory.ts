"use client";

import { supabase } from "./supabase";
import { normalizeName } from "./approvers";
import { apiFetch } from "./apiClient";

// ============================================================
// DANH BẠ ĐỐI TÁC (migration 150)
//
// 3 danh mục: Nhà thầu phụ / Nhà cung cấp / Tổ đội thi công. Chỉ chứa thông tin
// liên hệ + năng lực — KHÔNG có số tài khoản (phần tiền ở finance_partners).
// Chốt chặn thật nằm ở RLS (partner_dir_can_view / partner_dir_can_manage); giao
// diện chỉ ẩn/hiện nút theo partner_dir_my_access().
// ============================================================

export type PartnerKind = "nha_thau_phu" | "nha_cung_cap" | "to_doi";
export type PartnerStatus = "active" | "saved" | "paused" | "blacklist";
export type PartnerRegion = "bac" | "trung" | "nam" | "toan_quoc";

export const KIND_LABELS: Record<PartnerKind, string> = {
  nha_thau_phu: "Nhà thầu phụ",
  nha_cung_cap: "Nhà cung cấp",
  to_doi: "Tổ đội thi công",
};
export const KIND_ORDER: PartnerKind[] = ["nha_thau_phu", "nha_cung_cap", "to_doi"];

export const REGION_LABELS: Record<PartnerRegion, string> = {
  bac: "Miền Bắc",
  trung: "Miền Trung",
  nam: "Miền Nam",
  toan_quoc: "Toàn quốc",
};
export const REGION_ORDER: PartnerRegion[] = ["bac", "trung", "nam", "toan_quoc"];

// Hai trạng thái bắt buộc nêu lý do (trigger 154 cũng chặn ở CSDL).
export const NEEDS_REASON: PartnerStatus[] = ["paused", "blacklist"];

export const STATUS_LABELS: Record<PartnerStatus, string> = {
  active: "Đang hợp tác",
  saved: "Lưu thông tin",
  paused: "Tạm dừng",
  blacklist: "Danh sách đen",
};

// 34 tỉnh/thành sau sáp nhập (07/2025). Chỉ là gợi ý — ô nhập vẫn cho gõ tự do vì dữ
// liệu cũ còn dùng tên tỉnh trước sáp nhập (Bình Dương, Long An…).
export const PROVINCE_SUGGESTIONS = [
  "Hà Nội", "TP Hồ Chí Minh", "Hải Phòng", "Đà Nẵng", "Cần Thơ", "Huế",
  "Tuyên Quang", "Lào Cai", "Thái Nguyên", "Phú Thọ", "Bắc Ninh", "Hưng Yên",
  "Ninh Bình", "Quảng Ninh", "Cao Bằng", "Lạng Sơn", "Lai Châu", "Điện Biên",
  "Sơn La", "Thanh Hóa", "Nghệ An", "Hà Tĩnh", "Quảng Trị", "Quảng Ngãi",
  "Gia Lai", "Khánh Hòa", "Lâm Đồng", "Đắk Lắk", "Đồng Nai", "Tây Ninh",
  "Vĩnh Long", "Đồng Tháp", "Cà Mau", "An Giang",
];

export const FIELD_SUGGESTIONS = [
  "Cọc ly tâm / Cọc BTCT", "Cọc khoan nhồi & nền móng", "Thép tròn / Thép hình",
  "Bê tông thương phẩm", "Tôn, xà gồ, tấm lợp", "Vật tư MEP, điện nước, PCCC",
  "Hệ thống cơ điện MEP & PCCC", "Kết cấu thép & nhà xưởng", "Nhôm kính mặt dựng",
  "Chống thấm & sàn epoxy", "Cốp pha - cốt thép - đổ bê tông", "Xây trát & ốp lát hoàn thiện",
  "Sơn nước & bả matit", "Giàn giáo", "Cửa thép chống cháy & cửa cuốn", "Tư vấn / BIM",
];

export type PartnerRow = {
  id: string;
  kind: PartnerKind;
  name: string;
  short_name: string | null;
  tax_code: string | null;
  address: string | null;
  website: string | null;
  profile_url: string | null;
  legal_rep_name: string | null;
  legal_rep_title: string | null;
  contact_name: string | null;
  contact_title: string | null;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  zalo: string | null;
  viber: string | null;
  whatsapp: string | null;
  telegram: string | null;
  regions: PartnerRegion[];
  provinces: string[];
  fields: string[];
  capability: string | null;
  rating: number | null;
  rating_note: string | null;
  source: string | null; // nguồn thông tin / ai giới thiệu đối tác (migration 156)
  status: PartnerStatus;
  note: string | null;
  tax_status: string | null;
  tax_checked_at: string | null;
  // Lý do + người/lúc đổi sang Tạm dừng / Danh sách đen (trigger 154 đặt, không giả được).
  status_reason: string | null;
  status_changed_by: string | null;
  status_changed_at: string | null;
  finance_partner_id: string | null;
  created_at: string;
  updated_at: string;
};

// Dạng form: mọi ô văn bản là string (rỗng = chưa nhập), mảng giữ nguyên.
export type PartnerInput = {
  kind: PartnerKind;
  name: string;
  short_name: string;
  tax_code: string;
  address: string;
  website: string;
  profile_url: string;
  legal_rep_name: string;
  legal_rep_title: string;
  contact_name: string;
  contact_title: string;
  phone: string;
  phone2: string;
  email: string;
  zalo: string;
  viber: string;
  whatsapp: string;
  telegram: string;
  regions: PartnerRegion[];
  provinces: string[];
  fields: string[];
  capability: string;
  rating: string; // "" hoặc "0".."5"
  rating_note: string;
  source: string;
  status: PartnerStatus;
  status_reason: string; // bắt buộc khi status = paused / blacklist
  note: string;
  // Kết quả tra MST lần gần nhất (xem lookupTax). Rỗng = chưa tra.
  tax_status: string;
  tax_checked_at: string; // ISO
};

export function emptyInput(kind: PartnerKind = "nha_thau_phu"): PartnerInput {
  return {
    kind, name: "", short_name: "", tax_code: "", address: "", website: "", profile_url: "",
    legal_rep_name: "", legal_rep_title: "", contact_name: "", contact_title: "",
    phone: "", phone2: "", email: "", zalo: "", viber: "", whatsapp: "", telegram: "", regions: [], provinces: [], fields: [],
    capability: "", rating: "", rating_note: "", source: "", status: "active", status_reason: "", note: "",
    tax_status: "", tax_checked_at: "",
  };
}

export function inputFromRow(r: PartnerRow): PartnerInput {
  return {
    kind: r.kind, name: r.name, short_name: r.short_name ?? "", tax_code: r.tax_code ?? "",
    address: r.address ?? "", website: r.website ?? "", profile_url: r.profile_url ?? "",
    legal_rep_name: r.legal_rep_name ?? "", legal_rep_title: r.legal_rep_title ?? "",
    contact_name: r.contact_name ?? "", contact_title: r.contact_title ?? "",
    phone: r.phone ?? "", phone2: r.phone2 ?? "", email: r.email ?? "", zalo: r.zalo ?? "",
    viber: r.viber ?? "", whatsapp: r.whatsapp ?? "", telegram: r.telegram ?? "",
    regions: r.regions ?? [], provinces: r.provinces ?? [], fields: r.fields ?? [],
    capability: r.capability ?? "", rating: r.rating == null ? "" : String(r.rating),
    rating_note: r.rating_note ?? "", source: r.source ?? "", status: r.status, status_reason: r.status_reason ?? "", note: r.note ?? "",
    tax_status: r.tax_status ?? "", tax_checked_at: r.tax_checked_at ?? "",
  };
}

const t = (s: string) => s.trim().replace(/\s+/g, " ");
const nul = (s: string) => (t(s) ? t(s) : null);

// MST chỉ giữ chữ số và dấu gạch (VD 0301476109-001); bỏ khoảng trắng, dấu chấm.
export function cleanTaxCode(s: string): string {
  return s.replace(/[^\d-]/g, "").replace(/^-+|-+$/g, "");
}

// Số điện thoại: giữ chữ số, + và khoảng trắng đã gọn; không ép định dạng.
function cleanPhone(s: string): string | null {
  const v = t(s);
  return v || null;
}

// Link profile: bỏ khoảng trắng, thiếu giao thức thì thêm https://.
function cleanUrl(s: string): string | null {
  const v = s.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function toRow(v: PartnerInput, who: string | null) {
  const rating = v.rating === "" ? null : Math.min(5, Math.max(0, Number(v.rating)));
  return {
    kind: v.kind,
    name: t(v.name),
    short_name: nul(v.short_name),
    tax_code: cleanTaxCode(v.tax_code) || null,
    address: nul(v.address),
    website: nul(v.website),
    profile_url: cleanUrl(v.profile_url),
    legal_rep_name: nul(v.legal_rep_name),
    legal_rep_title: nul(v.legal_rep_title),
    contact_name: nul(v.contact_name),
    contact_title: nul(v.contact_title),
    phone: cleanPhone(v.phone),
    phone2: cleanPhone(v.phone2),
    email: v.email.trim().toLowerCase() || null,
    zalo: nul(v.zalo),
    viber: nul(v.viber),
    whatsapp: nul(v.whatsapp),
    telegram: nul(v.telegram),
    regions: v.regions,
    provinces: v.provinces.map(t).filter(Boolean),
    fields: v.fields.map(t).filter(Boolean),
    capability: v.capability.trim() || null,
    rating: rating != null && Number.isFinite(rating) ? rating : null,
    rating_note: nul(v.rating_note),
    source: nul(v.source),
    status: v.status,
    status_reason: NEEDS_REASON.includes(v.status) ? nul(v.status_reason) : null,
    note: v.note.trim() || null,
    // Không có MST thì kết quả tra cũ không còn ý nghĩa.
    tax_status: cleanTaxCode(v.tax_code) ? nul(v.tax_status) : null,
    tax_checked_at: cleanTaxCode(v.tax_code) && v.tax_status.trim() && v.tax_checked_at ? v.tax_checked_at : null,
    updated_by: who,
  };
}

// Kiểm tra trước khi gửi: trả câu lỗi tiếng Việt hoặc null.
export function validateInput(v: PartnerInput): string | null {
  // Danh bạ là kho thu thập gốc (user chốt 13/10/2026): chỉ BẮT BUỘC tên. Thiếu người liên hệ, số điện
  // thoại, khu vực… vẫn lưu được — thanh "Điểm" (x/10) cho biết hồ sơ còn thiếu gì, bổ sung dần.
  if (!t(v.name)) return "Nhập tên doanh nghiệp / tổ đội.";
  if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) return "Email chưa đúng định dạng.";
  if (v.tax_code.trim()) {
    const d = cleanTaxCode(v.tax_code).replace(/-/g, "");
    if (d.length !== 10 && d.length !== 13) return "Mã số thuế phải 10 hoặc 13 chữ số.";
  }
  if (NEEDS_REASON.includes(v.status) && !t(v.status_reason)) return `Nhập lý do khi chọn "${STATUS_LABELS[v.status]}".`;
  if (v.profile_url.trim() && /\s/.test(v.profile_url.trim())) return "Link Profile công ty không được chứa khoảng trắng.";
  if (v.rating !== "") {
    const n = Number(v.rating);
    if (!Number.isFinite(n) || n < 0 || n > 5) return "Điểm đánh giá từ 0 đến 5.";
  }
  return null;
}

export function partnerErrorMessage(err: { message?: string; code?: string } | null | undefined): string {
  const msg = err?.message || "Lỗi không xác định";
  if (/relation .*partner_directory.* does not exist|Could not find the (table|function) .*partner_/i.test(msg))
    return "Chưa chạy migration 150 (Danh bạ đối tác) trong Supabase > SQL Editor.";
  // Lỗi do trigger 154 ném ra (bắt buộc lý do khi Tạm dừng / Danh sách đen). Trùng không còn bị chặn (155).
  if (/PARTNER_REASON_REQUIRED/.test(msg)) return "Cần nhập lý do khi chọn Tạm dừng hoặc Danh sách đen.";
  if (/status_reason|status_changed/i.test(msg) && /column|schema cache/i.test(msg))
    return "Chưa chạy migration 154 (lý do trạng thái, chặn trùng, tệp PDF) trong Supabase > SQL Editor.";
  if (/partner_directory_files/i.test(msg) && /does not exist|schema cache/i.test(msg))
    return "Chưa chạy migration 154 (lý do trạng thái, chặn trùng, tệp PDF) trong Supabase > SQL Editor.";
  if (/source/i.test(msg) && /column|schema cache/i.test(msg))
    return "Chưa chạy migration 156 (ô Nguồn) trong Supabase > SQL Editor.";
  if (/tax_status|tax_checked_at/i.test(msg))
    return "Chưa chạy migration 153 (kết quả tra mã số thuế) trong Supabase > SQL Editor.";
  if (/viber|whatsapp|telegram/i.test(msg) && /column|schema cache/i.test(msg))
    return "Chưa chạy migration 152 (Viber / WhatsApp / Telegram) trong Supabase > SQL Editor.";
  if (/profile_url/i.test(msg) || /partner_directory_status/i.test(msg))
    return "Chưa chạy migration 151 (link Profile + trạng thái Lưu thông tin) trong Supabase > SQL Editor.";
  if (/row-level security|permission denied/i.test(msg)) return "Tài khoản chưa có quyền chỉnh sửa Danh bạ đối tác.";
  return msg;
}

export type PartnerAccess = { viewer: boolean; manager: boolean; admin: boolean };

export async function fetchPartnerAccess(): Promise<PartnerAccess> {
  const { data, error } = await supabase.rpc("partner_dir_my_access");
  if (error || !data) return { viewer: false, manager: false, admin: false };
  const d = data as Partial<PartnerAccess>;
  return { viewer: !!d.viewer, manager: !!d.manager, admin: !!d.admin };
}

export async function fetchPartners(): Promise<{ partners: PartnerRow[]; error: string | null }> {
  // Mới nhập nhất lên đầu (cùng thời điểm thì theo tên).
  const { data, error } = await supabase.from("partner_directory").select("*").order("created_at", { ascending: false }).order("name");
  if (error) return { partners: [], error: partnerErrorMessage(error) };
  return {
    partners: ((data as PartnerRow[]) || []).map((r) => ({
      ...r,
      regions: r.regions || [],
      provinces: r.provinces || [],
      fields: r.fields || [],
      rating: r.rating == null ? null : Number(r.rating),
    })),
    error: null,
  };
}

// Ghi rồi đọc lại để bắt "0 dòng" (RLS chặn UPDATE không báo lỗi).
// Trả về id đối tác mới để form còn tải tệp PDF đã chọn lên ngay sau khi tạo.
export async function createPartner(v: PartnerInput, who: string | null): Promise<{ error: string | null; id: string | null }> {
  const { data, error } = await supabase
    .from("partner_directory")
    .insert({ ...toRow(v, who), created_by: who })
    .select("id");
  if (error) return { error: partnerErrorMessage(error), id: null };
  if (!data || data.length === 0) return { error: "Không thêm được — tài khoản chưa có quyền chỉnh sửa Danh bạ đối tác.", id: null };
  return { error: null, id: (data[0] as { id: string }).id };
}

export async function updatePartner(id: string, v: PartnerInput, who: string | null): Promise<string | null> {
  const { data, error } = await supabase.from("partner_directory").update(toRow(v, who)).eq("id", id).select("id");
  if (error) return partnerErrorMessage(error);
  if (!data || data.length === 0) return "Không lưu được — tài khoản chưa có quyền chỉnh sửa Danh bạ đối tác.";
  return null;
}

export async function setPartnerStatus(id: string, status: PartnerStatus, reason: string, who: string | null): Promise<string | null> {
  if (NEEDS_REASON.includes(status) && !t(reason)) return `Nhập lý do khi chọn "${STATUS_LABELS[status]}".`;
  const { data, error } = await supabase
    .from("partner_directory")
    .update({ status, status_reason: NEEDS_REASON.includes(status) ? nul(reason) : null, updated_by: who })
    .eq("id", id)
    .select("id");
  if (error) return partnerErrorMessage(error);
  if (!data || data.length === 0) return "Không lưu được — tài khoản chưa có quyền chỉnh sửa Danh bạ đối tác.";
  return null;
}

export async function deletePartner(id: string): Promise<string | null> {
  // Lấy đường dẫn tệp TRƯỚC (bảng tệp xoá theo đối tác), xoá CSDL xong mới xoá tệp
  // trong Storage — Storage không chịu RLS của bảng nên không được xoá tệp trước.
  const { data: files } = await supabase.from("partner_directory_files").select("file_path").eq("partner_id", id);
  const { data, error } = await supabase.from("partner_directory").delete().eq("id", id).select("id");
  if (error) return partnerErrorMessage(error);
  if (!data || data.length === 0) return "Không xoá được — chỉ Admin được xoá. Hãy dùng \"Tạm dừng\" nếu chỉ muốn ngừng hợp tác.";
  const paths = ((files as { file_path: string }[] | null) || []).map((f) => f.file_path);
  if (paths.length) {
    try {
      await supabase.storage.from(PARTNER_BUCKET).remove(paths);
    } catch {
      // tệp mồ côi không ảnh hưởng ai
    }
  }
  return null;
}

// ─── Tệp PDF đính kèm (bucket partner-files, migration 154) ───
export type PartnerDocType = "profile" | "chung_chi" | "bao_gia" | "khac";
export const DOC_TYPE_LABELS: Record<PartnerDocType, string> = {
  profile: "Profile năng lực",
  chung_chi: "Chứng chỉ",
  bao_gia: "Báo giá",
  khac: "Khác",
};
export const PARTNER_BUCKET = "partner-files";
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB, khớp giới hạn của bucket

export type PartnerFile = {
  id: string;
  partner_id: string;
  doc_type: PartnerDocType;
  file_name: string;
  file_path: string;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
};

export async function fetchPartnerFiles(partnerId: string): Promise<{ files: PartnerFile[]; error: string | null }> {
  const { data, error } = await supabase
    .from("partner_directory_files")
    .select("*")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false });
  if (error) return { files: [], error: partnerErrorMessage(error) };
  return { files: (data as PartnerFile[]) || [], error: null };
}

// Kiểm tra tệp trước khi nhận (dùng cả lúc chọn tệp lẫn lúc tải lên).
export function checkPartnerFile(file: File): string | null {
  if (!(file.type === "application/pdf" || /\.pdf$/i.test(file.name))) return `"${file.name}" không phải PDF — chỉ nhận tệp PDF.`;
  if (file.size > MAX_FILE_BYTES) return `"${file.name}" lớn hơn 10MB — hãy nén PDF hoặc dán link vào ô Profile công ty.`;
  if (file.size === 0) return `"${file.name}" là tệp rỗng.`;
  return null;
}

// Thứ tự an toàn: tải tệp lên -> ghi CSDL -> nếu ghi CSDL hỏng thì xoá tệp vừa tải.
export async function uploadPartnerFile(partnerId: string, file: File, docType: PartnerDocType, who: string | null): Promise<string | null> {
  const bad = checkPartnerFile(file);
  if (bad) return bad;
  const safe = file.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9.-]/g, "_");
  const path = `${partnerId}/${Date.now()}_${safe}`;
  // Một số PDF trình duyệt báo loại tệp rỗng -> kho tệp (chỉ nhận application/pdf) từ chối.
  // Gói lại thành tệp có đúng loại; storage-js lấy loại từ chính tệp chứ không từ tuỳ chọn.
  const body = file.type === "application/pdf" ? file : new File([file], file.name, { type: "application/pdf" });
  const up = await supabase.storage.from(PARTNER_BUCKET).upload(path, body, { cacheControl: "3600", upsert: false, contentType: "application/pdf" });
  if (up.error) {
    if (/bucket not found/i.test(up.error.message)) return "Chưa có kho tệp. Chạy migration 154 trong Supabase > SQL Editor.";
    if (/row-level security|policy/i.test(up.error.message)) return "Tài khoản chưa có quyền chỉnh sửa Danh bạ đối tác nên không tải tệp lên được.";
    return `Không tải lên được "${file.name}": ${up.error.message}`;
  }
  const { data, error } = await supabase
    .from("partner_directory_files")
    .insert({ partner_id: partnerId, doc_type: docType, file_name: file.name, file_path: path, size_bytes: file.size, uploaded_by: who })
    .select("id");
  if (error || !data || data.length === 0) {
    try {
      await supabase.storage.from(PARTNER_BUCKET).remove([path]);
    } catch {
      /* tệp mồ côi không ảnh hưởng ai */
    }
    return error ? partnerErrorMessage(error) : "Không lưu được tệp — tài khoản chưa có quyền chỉnh sửa Danh bạ đối tác.";
  }
  return null;
}

// Xoá dòng CSDL TRƯỚC, thành công mới xoá tệp (xem ghi chú ở deletePartner).
export async function deletePartnerFile(f: PartnerFile): Promise<string | null> {
  const { data, error } = await supabase.from("partner_directory_files").delete().eq("id", f.id).select("id");
  if (error) return partnerErrorMessage(error);
  if (!data || data.length === 0) return "Không xoá được tệp — tài khoản chưa có quyền chỉnh sửa Danh bạ đối tác.";
  try {
    await supabase.storage.from(PARTNER_BUCKET).remove([f.file_path]);
  } catch {
    /* tệp mồ côi không ảnh hưởng ai */
  }
  return null;
}

// Tải nội dung PDF về dạng Blob (qua quyền đăng nhập, policy xem của kho tệp). Dùng để xem trong
// cửa sổ giữa màn hình: link ký sẵn của Supabase Storage bị gắn CSP "sandbox" nên trình duyệt
// KHÔNG hiển thị PDF trong khung nhúng, còn blob: thì hiển thị được.
export async function downloadPartnerFile(path: string): Promise<Blob | null> {
  const { data, error } = await supabase.storage.from(PARTNER_BUCKET).download(path);
  if (error || !data) return null;
  return new Blob([data], { type: "application/pdf" });
}

// Tệp quá cỡ không phải lỗi mà là nhắc dùng link: giao diện hiện thông báo nhỏ màu vàng.
export function tooBigNotice(file: File): string {
  return `"${file.name}" lớn hơn ${MAX_FILE_BYTES / 1024 / 1024}MB nên không tải lên được. Hãy dán link tệp (Drive, SharePoint…) vào ô "Profile công ty" ở trên.`;
}

export function formatFileSize(n: number | null | undefined): string {
  if (!n) return "";
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

// ─── Tra cứu mã số thuế + cờ đỏ ───
// Nguồn: API công khai VietQR qua /api/tax-lookup (miễn phí, dữ liệu theo cơ quan thuế,
// có thể trễ vài ngày, chưa phủ hết doanh nghiệp). Chỉ cho biết tình trạng HIỆN TẠI —
// không nói gì về uy tín, nợ thuế hay danh sách rủi ro hóa đơn.
export type TaxLevel = "ok" | "red" | "unknown";

// "NNT đang hoạt động" -> ok. Mọi tình trạng ngừng / đóng MST / không hoạt động tại địa
// chỉ… -> red (cờ đỏ). Tình trạng lạ (VD "chuyển cơ quan thuế") -> unknown, hiện nguyên văn
// chứ không đoán. Kiểm tra từ khoá tiêu cực TRƯỚC vì "ngừng hoạt động" cũng chứa "hoạt động".
export function taxLevel(status: string | null | undefined): TaxLevel {
  if (!status || !status.trim()) return "unknown";
  const s = normalizeName(status);
  if (/ngung|dong ma|dong mst|khong hoat dong|chua hoat dong|bo tron|bo dia chi|giai the|thu hoi|cham dut|pha san|tam dung/.test(s)) return "red";
  if (/^(nnt )?dang hoat dong/.test(s)) return "ok";
  return "unknown";
}

export type TaxLookupResult =
  | { ok: true; found: true; name: string | null; address: string | null; status: string | null; usedBase: boolean; checkedAt: string }
  | { ok: true; found: false }
  | { ok: false; error: string };

export async function lookupTax(taxCode: string): Promise<TaxLookupResult> {
  try {
    const res = await apiFetch("/api/tax-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tax_code: taxCode }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: j?.error || `Lỗi tra cứu (${res.status}).` };
    if (!j.found) return { ok: true, found: false };
    return {
      ok: true,
      found: true,
      name: j.name || null,
      address: j.address || null,
      status: j.status || null,
      usedBase: !!j.usedBase,
      checkedAt: j.checkedAt || new Date().toISOString(),
    };
  } catch {
    return { ok: false, error: "Không kết nối được máy chủ để tra cứu mã số thuế." };
  }
}

// Kết quả tra MST càng cũ càng kém tin cậy: quá 90 ngày thì nhãn xanh chuyển vàng "nên tra lại".
export const TAX_STALE_DAYS = 90;
export function taxAgeDays(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t0 = new Date(iso).getTime();
  if (Number.isNaN(t0)) return null;
  return Math.max(0, Math.floor((Date.now() - t0) / 86400000));
}
export function taxAgeText(iso: string | null | undefined): string {
  const d = taxAgeDays(iso);
  if (d == null) return "";
  return d === 0 ? "hôm nay" : `${d} ngày trước`;
}

// Ngày giờ theo múi giờ Việt Nam (toLocale* không tự đổi múi giờ trên máy chủ UTC).
export function formatCheckedDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

// ─── Mức đầy đủ hồ sơ: 10 tiêu chí, mỗi tiêu chí 1 điểm ───
export const COMPLETENESS_CHECKS: { key: string; label: string; ok: (r: PartnerRow | PartnerInput) => boolean }[] = [
  { key: "name", label: "Tên", ok: (r) => !!r.name?.trim() },
  { key: "tax", label: "Mã số thuế", ok: (r) => !!r.tax_code?.trim() },
  { key: "address", label: "Địa chỉ", ok: (r) => !!r.address?.trim() },
  { key: "contact", label: "Người liên hệ", ok: (r) => !!r.contact_name?.trim() },
  { key: "title", label: "Chức danh", ok: (r) => !!r.contact_title?.trim() },
  { key: "phone", label: "Số điện thoại", ok: (r) => !!r.phone?.trim() },
  { key: "email", label: "Email", ok: (r) => !!r.email?.trim() },
  { key: "area", label: "Khu vực", ok: (r) => r.regions.length > 0 || r.provinces.length > 0 },
  { key: "fields", label: "Lĩnh vực", ok: (r) => r.fields.length > 0 },
  { key: "capability", label: "Mô tả năng lực", ok: (r) => !!r.capability?.trim() },
];

export function completeness(r: PartnerRow | PartnerInput): { score: number; total: number; missing: string[] } {
  const missing = COMPLETENESS_CHECKS.filter((c) => !c.ok(r)).map((c) => c.label);
  return { score: COMPLETENESS_CHECKS.length - missing.length, total: COMPLETENESS_CHECKS.length, missing };
}

// ─── Tìm kiếm có xếp hạng ───
// Trước đây: tách từ khoá rồi chỉ cần mỗi từ nằm ở BẤT KỲ ĐÂU (chuỗi con) trong mọi trường -> gõ
// "Thành An" ra cả những công ty không liên quan vì "an" nằm trong "tân", "nam", "hạng"… và không có
// thứ tự nên công ty tên "Thành An" thật bị chìm. Nay:
//   • khớp theo TỪ (bỏ dấu, không phân biệt hoa/thường): từ ≥ 3 ký tự khớp đầu từ ("thanh" ra "Thành");
//     từ ≤ 2 ký tự ("an") phải khớp NGUYÊN từ, không khớp lẫn trong từ khác;
//   • TẤT CẢ các từ phải khớp (có thể ở các trường khác nhau: "cọc đồng nai");
//   • xếp hạng: tên khớp nguyên cụm > tên chứa cụm > từ nằm trong tên > tên viết tắt / người liên hệ /
//     MST / email / lĩnh vực / tỉnh > năng lực, địa chỉ, nguồn. Cùng điểm thì giữ thứ tự mới nhập trước.
type SearchIdx = { nameWords: string[]; nameJoined: string; mid: string[]; midJoined: string; low: string[]; lowJoined: string; digits: string };
const SEARCH_CACHE = new WeakMap<PartnerRow, SearchIdx>();
const wordsOf = (...parts: (string | null | undefined)[]): string[] =>
  normalizeName(parts.filter(Boolean).join(" ")).split(/[^a-z0-9]+/).filter(Boolean);

function searchIdx(r: PartnerRow): SearchIdx {
  let x = SEARCH_CACHE.get(r);
  if (!x) {
    const nameWords = wordsOf(r.name);
    const mid = wordsOf(r.short_name, r.contact_name, r.legal_rep_name, r.tax_code, r.email, ...r.fields, ...r.provinces);
    const low = wordsOf(r.capability, r.address, r.source, r.website);
    x = {
      nameWords,
      nameJoined: nameWords.join(" "),
      mid,
      midJoined: mid.join(" "),
      low,
      lowJoined: low.join(" "),
      // Số điện thoại / MST gõ có hay không có dấu cách, dấu chấm: so thêm bản chỉ chữ số.
      digits: `${r.phone || ""} ${r.phone2 || ""} ${r.tax_code || ""}`.replace(/[^\d ]/g, "").replace(/\s+/g, " "),
    };
    SEARCH_CACHE.set(r, x);
  }
  return x;
}

const wordHit = (words: string[], tk: string): boolean =>
  tk.length <= 2 ? words.includes(tk) : words.some((w) => w.startsWith(tk));

// 0 = không khớp; càng cao càng khớp. Không có từ khoá -> 1 (mọi đối tác giữ nguyên thứ tự).
export function scorePartner(r: PartnerRow, query: string): number {
  const tokens = normalizeName(query).split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length === 0) return 1;
  const x = searchIdx(r);
  const phrase = tokens.join(" ");
  let tierSum = 0;
  for (const tk of tokens) {
    if (wordHit(x.nameWords, tk)) tierSum += 3;
    else if (wordHit(x.mid, tk) || (/^\d{4,}$/.test(tk) && x.digits.replace(/ /g, "").includes(tk))) tierSum += 2;
    else if (wordHit(x.low, tk)) {
      // Nhiều chữ mà một chữ chỉ khớp lẻ trong địa chỉ / năng lực ("thành" trong "Thành phố") là nhiễu:
      // chỉ nhận khi cả cụm nằm LIỀN NHAU ở đó (VD "bến lức" trong địa chỉ).
      if (tokens.length > 1 && !` ${x.lowJoined}`.includes(` ${phrase}`)) return 0;
      tierSum += 1;
    } else return 0;
  }
  let base = 0;
  if (x.nameJoined === phrase) base = 1000;
  else if (x.nameJoined.startsWith(phrase)) base = 900;
  else if (` ${x.nameJoined}`.includes(` ${phrase}`)) base = 800;
  return base + tierSum * 10;
}
export function phoneHref(p: string | null): string | null {
  if (!p) return null;
  const d = p.replace(/[^\d+]/g, "");
  return d ? `tel:${d}` : null;
}

// ─── Soạn thư: mỗi người chọn một lần, nhớ theo trình duyệt ───
// `mailto:` chỉ chạy khi máy đã đặt ứng dụng mail mặc định, còn người dùng Gmail /
// Outlook trên web thì không có gì mở ra — nên cho chọn cách mở.
export type MailApp = "gmail" | "outlook" | "app";
export const MAIL_APP_LABELS: Record<MailApp, string> = {
  gmail: "Gmail (web)",
  outlook: "Outlook (web)",
  app: "Ứng dụng mail trên máy",
};
const MAIL_PREF_KEY = "partnerDir.mailApp";

function isMobile(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function getMailPref(): MailApp {
  try {
    const v = localStorage.getItem(MAIL_PREF_KEY);
    if (v === "gmail" || v === "outlook" || v === "app") return v;
  } catch {
    /* trình duyệt chặn lưu trữ: dùng mặc định */
  }
  // Mặc định: điện thoại mở ứng dụng mail của máy, máy tính mở Gmail web.
  return isMobile() ? "app" : "gmail";
}

export function setMailPref(app: MailApp): void {
  try {
    localStorage.setItem(MAIL_PREF_KEY, app);
  } catch {
    /* không lưu được thì lần sau hỏi lại, không sao */
  }
}

export function emailHref(email: string | null, app: MailApp = getMailPref()): string | null {
  const e = (email || "").trim();
  if (!e) return null;
  const to = encodeURIComponent(e);
  if (app === "gmail") return `https://mail.google.com/mail/?view=cm&fs=1&to=${to}`;
  if (app === "outlook") return `https://outlook.office.com/mail/deeplink/compose?to=${to}`;
  return `mailto:${e}`;
}

// Số quốc tế chỉ chữ số: 0912… (VN) -> 84912…; số đã có +/00 giữ mã nước của nó.
function intlDigits(raw: string): string {
  const s = raw.trim();
  const d = s.replace(/\D/g, "");
  if (!d) return "";
  if (s.startsWith("+")) return d;
  if (d.startsWith("00")) return d.slice(2);
  if (d.startsWith("0")) return `84${d.slice(1)}`;
  return d;
}

export function whatsappHref(v: string | null): string | null {
  if (!v) return null;
  if (/^https?:\/\//i.test(v.trim())) return v.trim();
  const d = intlDigits(v);
  return d ? `https://wa.me/${d}` : null;
}

export function viberHref(v: string | null): string | null {
  if (!v) return null;
  const d = intlDigits(v);
  return d ? `viber://chat?number=%2B${d}` : null;
}

// Telegram nhập @tên_người_dùng hoặc số điện thoại hoặc link t.me.
export function telegramHref(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (/^\+?[\d\s.()-]{8,}$/.test(s)) {
    const d = intlDigits(s);
    return d ? `https://t.me/+${d}` : null;
  }
  const u = s.replace(/^@/, "");
  return /^[A-Za-z0-9_]{4,}$/.test(u) ? `https://t.me/${u}` : null;
}

// Link Zalo: dùng ô Zalo nếu có (số hoặc link), không thì lấy số điện thoại.
export function zaloHref(r: Pick<PartnerRow, "zalo" | "phone">): string | null {
  const z = (r.zalo || "").trim();
  if (/^https?:\/\//i.test(z)) return z;
  const d = (z || r.phone || "").replace(/\D/g, "");
  return d ? `https://zalo.me/${d}` : null;
}

// ─── Xuất Excel danh sách đang hiển thị (đã qua bộ lọc) ───
// Chỉ gồm những gì người xem vốn đã thấy trên màn hình; không có số tài khoản ngân hàng.
export async function exportPartnersXlsx(rows: PartnerRow[]): Promise<void> {
  const XLSX = await import("xlsx");
  const vn = (iso: string | null) => formatCheckedDate(iso);
  const header = [
    "STT", "Loại", "Tên doanh nghiệp / tổ đội", "Tên gọi tắt", "Mã số thuế", "Tình trạng MST", "Ngày tra MST",
    "Địa chỉ", "Người liên hệ", "Chức danh", "Điện thoại", "Điện thoại 2", "Email", "Zalo", "Viber", "WhatsApp", "Telegram",
    "Người đại diện pháp luật", "Chức danh (đại diện)", "Khu vực (miền)", "Tỉnh / thành", "Lĩnh vực", "Mô tả năng lực",
    "Đánh giá (0-5)", "Nhận xét đánh giá", "Nguồn", "Trạng thái", "Lý do (tạm dừng / danh sách đen)", "Website", "Profile công ty", "Ghi chú",
  ];
  const body = rows.map((r, i) => [
    i + 1, KIND_LABELS[r.kind], r.name, r.short_name || "", r.tax_code || "", r.tax_status || "", vn(r.tax_checked_at),
    r.address || "", r.contact_name || "", r.contact_title || "", r.phone || "", r.phone2 || "", r.email || "",
    r.zalo || "", r.viber || "", r.whatsapp || "", r.telegram || "",
    r.legal_rep_name || "", r.legal_rep_title || "", r.regions.map((x) => REGION_LABELS[x]).join(", "), r.provinces.join(", "),
    r.fields.join(", "), r.capability || "",
    r.rating == null ? "" : r.rating, r.rating_note || "", r.source || "", STATUS_LABELS[r.status], r.status_reason || "",
    r.website || "", r.profile_url || "", r.note || "",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  // MST / SĐT là chuỗi: ép kiểu văn bản để Excel không bỏ số 0 đầu hay đổi sang dạng khoa học.
  const textCols = [4, 10, 11, 13, 14, 15, 16];
  for (let rIdx = 1; rIdx <= body.length; rIdx++) {
    for (const c of textCols) {
      const cell = ws[XLSX.utils.encode_cell({ r: rIdx, c })];
      if (cell && cell.v !== "") {
        cell.t = "s";
        cell.v = String(cell.v);
      }
    }
  }
  ws["!cols"] = header.map((h, i) => ({ wch: [0, 14, 38, 18, 15, 26, 12, 40, 22, 20, 14, 14, 26, 14, 14, 14, 16, 22, 18, 16, 24, 34, 50, 10, 30, 24, 14, 30, 28, 34, 30][i] || Math.max(12, h.length) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Danh ba doi tac");
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  XLSX.writeFile(wb, `Danh-ba-doi-tac_${day}.xlsx`);
}
