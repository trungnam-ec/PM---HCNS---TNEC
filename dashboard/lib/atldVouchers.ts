// ============================================================
// Kho BHLĐ — PHIẾU XUẤT KHO (tạo từ tab Giá nhập kho, migration 116 + 123)
//
// Luồng: Thủ kho lập (Nháp) -> Gửi duyệt (Chờ duyệt) -> TP/PP ATLĐ Duyệt (trừ kho
// theo FIFO, hiện ở cột Xuất SP của Tổng kho) hoặc Trả lại (kèm lý do, thủ kho
// sửa rồi gửi lại). Phiếu đã duyệt chỉ HUỶ được (sinh dòng đảo) — TP/PP / Admin.
// Mọi bước đổi trạng thái đi qua hàm SQL atld_* — client không tự ghi status.
//
// Giá: sale_price = đơn giá bán người dùng gõ; unit_price của dòng = giá vốn FIFO
// do hàm duyệt điền -> giá trị tồn kho không bị giá bán làm lệch.
// Thông báo: chuông (Header) + email (/api/send-atld-email, chạy ngầm).
// ============================================================

import { supabase } from "./supabase";
import { apiFetch } from "./apiClient";
import { type AtldItem, atldErrorMessage } from "./atldStock";
import { emailFieldMatches } from "./emailMatch";

export type IssueStatus = "draft" | "pending" | "returned" | "posted" | "cancelled";

export const ISSUE_STATUS_META: Record<IssueStatus, { label: string; cls: string }> = {
  draft: { label: "Nháp", cls: "bg-slate-100 text-slate-600" },
  pending: { label: "Chờ duyệt", cls: "bg-amber-100 text-amber-700" },
  returned: { label: "Bị trả lại", cls: "bg-rose-100 text-rose-700" },
  posted: { label: "Đã duyệt", cls: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Đã huỷ", cls: "bg-slate-200 text-slate-500 line-through" },
};

export type IssueLineInput = { item_id: string; qty: number; sale_price: number | null };

export type IssueInput = {
  ngay: string;
  contractor_id: string | null;   // khách hàng trong Danh mục đối tác chung
  contractor_name: string;        // tên khách hàng (gõ tay khi ngoài danh mục)
  bdh_name: string;
  nguoi_nhan: string;
  dia_chi: string;
  ly_do: string;
  chung_tu: string;
  vat_percent: number;
  phi_van_chuyen: number;
  ghi_chu: string;
  lines: IssueLineInput[];
};

export type IssueVoucher = IssueInput & { id: string; so_phieu: string; status: IssueStatus; created_by: string | null; return_reason: string | null };

export type SharedPartner = { id: string; name: string; short_name: string | null; party_type: string };

export async function fetchSharedPartners(): Promise<SharedPartner[]> {
  const { data, error } = await supabase.rpc("atld_shared_partner_list");
  if (error || !data) return [];
  return (data as SharedPartner[]).filter((r) => r.id && r.name);
}

export async function fetchIssueVoucher(id: string): Promise<{ voucher: IssueVoucher | null; error: string | null }> {
  const [{ data: v, error: e1 }, { data: ls, error: e2 }] = await Promise.all([
    supabase.from("atld_vouchers").select("*").eq("id", id).single(),
    supabase.from("atld_voucher_lines").select("item_id, qty, sale_price, line_no").eq("voucher_id", id).order("line_no"),
  ]);
  if (e1 || !v) return { voucher: null, error: atldErrorMessage(e1) };
  if (e2) return { voucher: null, error: atldErrorMessage(e2) };
  const r = v as Record<string, unknown>;
  return {
    voucher: {
      id,
      so_phieu: String(r.so_phieu || ""),
      status: r.status as IssueStatus,
      created_by: (r.created_by as string) || null,
      return_reason: (r.return_reason as string) || null,
      ngay: String(r.ngay),
      contractor_id: (r.contractor_id as string) || null,
      contractor_name: (r.contractor_name as string) || "",
      bdh_name: (r.bdh_name as string) || "",
      nguoi_nhan: (r.nguoi_nhan as string) || "",
      dia_chi: (r.dia_chi as string) || "",
      ly_do: (r.ly_do as string) || "",
      chung_tu: (r.chung_tu as string) || "",
      vat_percent: Number(r.vat_percent) || 0,
      phi_van_chuyen: Number(r.phi_van_chuyen) || 0,
      ghi_chu: (r.ghi_chu as string) || "",
      lines: ((ls as { item_id: string; qty: number; sale_price: number | null }[]) || []).map((l) => ({
        item_id: l.item_id,
        qty: Number(l.qty),
        sale_price: l.sale_price == null ? null : Number(l.sale_price),
      })),
    },
    error: null,
  };
}

// Lưu phiếu (tạo mới hoặc sửa phiếu Nháp / Bị trả lại). Dòng hàng thay toàn bộ:
// xoá dòng cũ rồi chèn lại — RLS chỉ cho làm khi phiếu còn sửa được.
export async function saveIssueVoucher(input: IssueInput, id?: string): Promise<{ id: string | null; error: string | null }> {
  const header = {
    ngay: input.ngay,
    contractor_id: input.contractor_id,
    contractor_name: input.contractor_id ? null : input.contractor_name.trim() || null,
    bdh_name: input.bdh_name.trim() || null,
    nguoi_nhan: input.nguoi_nhan.trim() || null,
    dia_chi: input.dia_chi.trim() || null,
    ly_do: input.ly_do.trim() || null,
    chung_tu: input.chung_tu.trim() || null,
    vat_percent: input.vat_percent > 0 ? input.vat_percent : 0,
    phi_van_chuyen: input.phi_van_chuyen > 0 ? input.phi_van_chuyen : 0,
    ghi_chu: input.ghi_chu.trim() || null,
  };
  let vid = id || null;
  if (vid) {
    const { data, error } = await supabase.from("atld_vouchers").update(header).eq("id", vid).select("id");
    if (error) return { id: null, error: atldErrorMessage(error) };
    if (!data || data.length === 0) return { id: null, error: "Không sửa được — phiếu đã gửi duyệt / đã duyệt, hoặc tài khoản chưa có quyền Thủ kho." };
    const { error: ed } = await supabase.from("atld_voucher_lines").delete().eq("voucher_id", vid);
    if (ed) return { id: null, error: atldErrorMessage(ed) };
  } else {
    const { data: me } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("atld_vouchers")
      .insert({ ...header, loai: "xuat", created_by_name: (me.user?.user_metadata?.full_name as string) || null })
      .select("id")
      .single();
    if (error || !data) return { id: null, error: atldErrorMessage(error) };
    vid = (data as { id: string }).id;
  }
  const { error: el } = await supabase.from("atld_voucher_lines").insert(
    input.lines.map((l, i) => ({ voucher_id: vid, line_no: i + 1, item_id: l.item_id, qty: l.qty, sale_price: l.sale_price }))
  );
  if (el) return { id: vid, error: atldErrorMessage(el) };
  return { id: vid, error: null };
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<string | null> {
  const { error } = await supabase.rpc(fn, args);
  return error ? atldErrorMessage(error) : null;
}

export const submitIssue = (id: string) => rpc("atld_submit_issue", { p_voucher: id });
export const approveIssue = (id: string, note?: string) => rpc("atld_approve_issue", { p_voucher: id, p_note: note || null });
export const returnIssue = (id: string, reason: string) => rpc("atld_return_issue", { p_voucher: id, p_reason: reason });
export const cancelIssue = (id: string, reason: string) => rpc("atld_cancel_voucher", { p_voucher: id, p_reason: reason });

export async function deleteIssueDraft(id: string): Promise<string | null> {
  const { data, error } = await supabase.from("atld_vouchers").delete().eq("id", id).select("id");
  if (error) return atldErrorMessage(error);
  if (!data || data.length === 0) return "Không xoá được — chỉ xoá phiếu Nháp / Bị trả lại, và cần quyền Thủ kho ATLĐ.";
  return null;
}

// ─── Email (chạy ngầm, không chặn thao tác) ───
// Người nhận cấp duyệt = mọi email trong dòng approval_permissions có cờ duyệt xuất.
async function approverEmails(): Promise<string[]> {
  const { data } = await supabase.from("approval_permissions").select("*");
  const out: string[] = [];
  for (const r of (data as { email?: string | null; can_approve_atld_issue?: boolean }[]) || []) {
    if (!r.can_approve_atld_issue || !r.email) continue;
    out.push(...r.email.split(/[\s,;]+/).filter((e) => e.includes("@")));
  }
  return Array.from(new Set(out.map((e) => e.toLowerCase())));
}

export type IssueEmailEvent = "trinh" | "duyet" | "tra_lai" | "huy";

export function notifyIssue(
  event: IssueEmailEvent,
  info: { soPhieu: string; ngay: string; khachHang: string; bdh: string; nguoiNhan: string; tongTien: number | null; soDong: number; creatorEmail: string | null; actorName: string; lyDo?: string }
): void {
  void (async () => {
    try {
      const myEmail = (await supabase.auth.getUser()).data.user?.email || "";
      const approvers = event === "trinh" ? (await approverEmails()).filter((e) => !emailFieldMatches(myEmail, e)) : [];
      await apiFetch("/api/send-atld-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, ...info, approverEmails: approvers, siteUrl: typeof window !== "undefined" ? window.location.origin : "" }),
      });
    } catch (e) {
      console.warn("[atld] Không gửi được email thông báo phiếu xuất:", e);
    }
  })();
}

// ─── Danh sách phiếu xuất (tab "Xuất kho cho BĐH/Đối tác") ───
// Mỗi phiếu một dòng, kèm các dòng hàng để bung ra xem. Tiền hàng tính theo GIÁ
// BÁN (sale_price; thiếu thì giá vốn đã chốt) + VAT + phí vận chuyển.
export type IssueLineView = { id: string; item_id: string; qty: number; sale_price: number | null; cost: number | null };

export type IssueRow = {
  id: string;
  so_phieu: string;
  ngay: string;
  status: IssueStatus;
  contractor_name: string | null;
  bdh_name: string | null;
  nguoi_nhan: string | null;
  dia_chi: string | null;
  ly_do: string | null;
  chung_tu: string | null;
  vat_percent: number;
  phi_van_chuyen: number;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  return_reason: string | null;
  cancel_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  goc_file_path: string | null;   // chứng từ gốc — tệp trong kho atld-files (migration 124)
  goc_file_name: string | null;
  goc_link: string | null;        // chứng từ gốc — link ngoài khi tệp > 2MB
  lines: IssueLineView[];
  tienHang: number;
  tongCong: number;
  tongSL: number;
};

export async function fetchIssueRows(): Promise<{ rows: IssueRow[]; error: string | null }> {
  const { data: vs, error } = await supabase
    .from("atld_vouchers")
    .select("*")
    .eq("loai", "xuat")
    .order("ngay", { ascending: false })
    .order("seq", { ascending: false })
    .limit(2000);
  if (error) return { rows: [], error: atldErrorMessage(error) };
  const list = (vs as Record<string, unknown>[]) || [];
  const ids = list.map((v) => v.id as string);
  const linesBy = new Map<string, IssueLineView[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: ls, error: el } = await supabase
      .from("atld_voucher_lines")
      .select("id, voucher_id, item_id, qty, sale_price, unit_price, line_no")
      .in("voucher_id", ids.slice(i, i + 200))
      .order("line_no");
    if (el) return { rows: [], error: atldErrorMessage(el) };
    for (const l of (ls as Record<string, unknown>[]) || []) {
      const arr = linesBy.get(l.voucher_id as string) || [];
      arr.push({
        id: l.id as string,
        item_id: l.item_id as string,
        qty: Number(l.qty) || 0,
        sale_price: l.sale_price == null ? null : Number(l.sale_price),
        cost: l.unit_price == null ? null : Number(l.unit_price),
      });
      linesBy.set(l.voucher_id as string, arr);
    }
  }
  return {
    rows: list.map((v) => {
      const lines = linesBy.get(v.id as string) || [];
      const vat = Number(v.vat_percent) || 0;
      const ship = Number(v.phi_van_chuyen) || 0;
      const tienHang = lines.reduce((s, l) => s + l.qty * (l.sale_price ?? l.cost ?? 0), 0);
      return {
        id: v.id as string,
        so_phieu: String(v.so_phieu || ""),
        ngay: String(v.ngay),
        status: v.status as IssueStatus,
        contractor_name: (v.contractor_name as string) || null,
        bdh_name: (v.bdh_name as string) || null,
        nguoi_nhan: (v.nguoi_nhan as string) || null,
        dia_chi: (v.dia_chi as string) || null,
        ly_do: (v.ly_do as string) || null,
        chung_tu: (v.chung_tu as string) || null,
        vat_percent: vat,
        phi_van_chuyen: ship,
        created_by: (v.created_by as string) || null,
        created_by_name: (v.created_by_name as string) || null,
        created_at: String(v.created_at || ""),
        return_reason: (v.return_reason as string) || null,
        cancel_reason: (v.cancel_reason as string) || null,
        approved_by: (v.approved_by as string) || null,
        approved_at: (v.approved_at as string) || null,
        goc_file_path: (v.goc_file_path as string) || null,
        goc_file_name: (v.goc_file_name as string) || null,
        goc_link: (v.goc_link as string) || null,
        lines,
        tienHang,
        tongCong: Math.round(tienHang * (1 + vat / 100) + ship),
        tongSL: lines.reduce((s, l) => s + l.qty, 0),
      };
    }),
    error: null,
  };
}

// ─── Xem trước / tải phiếu theo mẫu Phieu_xuat_kho_atld.xlsx ───
// Một bộ dữ liệu dùng chung cho màn hình xem trước và route xuất Excel
// (/api/export-atld-issue) -> hai bản không lệch nhau.
export type IssuePrintLine = { code: string; name: string; unit: string; qty: number; price: number | null; note: string };
export type IssuePrint = {
  soPhieu: string;
  ngay: string;
  hoTen: string;
  noiDung: string;
  diaChi: string;
  lines: IssuePrintLine[];
  vatPercent: number;
  phiVanChuyen: number;
  tienHang: number;
  tienVat: number;
  tongCong: number;
};

export function issuePrintData(r: IssueRow, byId: Map<string, AtldItem>): IssuePrint {
  const lines = r.lines.map((l) => {
    const it = byId.get(l.item_id);
    return {
      code: it?.code || "",
      name: it?.name || "(mã đã xoá)",
      unit: it?.unit || "",
      qty: l.qty,
      price: l.sale_price ?? l.cost,
      // Cột "Ghi chú" của mẫu ghi size / màu của mã hàng.
      note: [it?.size, it?.color].filter(Boolean).join(" - "),
    };
  });
  const tienHang = lines.reduce((a, l) => a + (l.price == null ? 0 : l.qty * l.price), 0);
  const tienVat = (tienHang * r.vat_percent) / 100;
  return {
    soPhieu: r.so_phieu,
    ngay: r.ngay,
    // Mẫu chỉ có một ô "Họ và tên" — người nhận; phiếu không ghi thì lấy khách hàng / BĐH.
    hoTen: r.nguoi_nhan || r.contractor_name || r.bdh_name || "",
    noiDung: r.ly_do || "",
    diaChi: r.dia_chi || "",
    lines,
    vatPercent: r.vat_percent,
    phiVanChuyen: r.phi_van_chuyen,
    tienHang,
    tienVat,
    tongCong: tienHang + tienVat + r.phi_van_chuyen,
  };
}

export async function downloadIssueXlsx(p: IssuePrint): Promise<void> {
  const fileName = `Phieu_xuat_kho_${p.soPhieu.replace(/[^a-zA-Z0-9.-]+/g, "_")}.xlsx`;
  const res = await apiFetch("/api/export-atld-issue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...p, fileName }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error === "template_not_found" ? "Không tìm thấy file mẫu Phieu_xuat_kho_atld.xlsx." : j.error || `Lỗi xuất phiếu (${res.status})`);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Chứng từ gốc (migration 124): 1 tệp ảnh/PDF ≤ 2MB trong kho riêng tư
// atld-files, HOẶC link ngoài khi tệp lớn hơn. Ghi qua hàm atld_set_issue_original
// để sửa được cả phiếu đã duyệt (policy UPDATE của 116 khoá phiếu ngoài Nháp).
// Thứ tự: tải tệp mới -> ghi CSDL -> xoá tệp cũ (Storage không theo RLS của bảng,
// xoá trước mà ghi CSDL hỏng là mất tệp).
export const ATLD_FILES_BUCKET = "atld-files";
export const ATLD_FILE_MAX_BYTES = 2 * 1024 * 1024;

export async function uploadIssueOriginal(voucherId: string, file: File): Promise<{ path: string; name: string }> {
  if (!(file.type === "application/pdf" || file.type.startsWith("image/"))) {
    throw new Error(`"${file.name}" không phải ảnh hoặc PDF — chỉ nhận hai loại này.`);
  }
  if (file.size > ATLD_FILE_MAX_BYTES) {
    throw new Error(`"${file.name}" vượt 2MB — hãy tải lên Drive rồi dán link vào ô bên dưới.`);
  }
  const path = `xuat/${voucherId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const { error } = await supabase.storage
    .from(ATLD_FILES_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
  if (error) {
    const hint = /bucket not found/i.test(error.message)
      ? " — chưa có kho tệp. Chạy migrations/124_atld_issue_original_file.sql trong Supabase > SQL Editor."
      : /row-level security|policy/i.test(error.message)
      ? " — tài khoản chưa có quyền Thủ kho / duyệt xuất ATLĐ."
      : "";
    throw new Error(`Không tải lên được "${file.name}": ${error.message}${hint}`);
  }
  return { path, name: file.name };
}

export async function setIssueOriginal(voucherId: string, filePath: string | null, fileName: string | null, link: string | null): Promise<string | null> {
  const { error } = await supabase.rpc("atld_set_issue_original", {
    p_voucher: voucherId,
    p_file_path: filePath,
    p_file_name: fileName,
    p_link: link,
  });
  if (!error) return null;
  if (/Could not find the function .*atld_set_issue_original/i.test(error.message || "")) {
    return "Chưa chạy migration 124 (chứng từ gốc) trong Supabase > SQL Editor.";
  }
  return atldErrorMessage(error);
}

export async function removeIssueOriginalFile(path: string): Promise<void> {
  try {
    await supabase.storage.from(ATLD_FILES_BUCKET).remove([path]);
  } catch {
    // tệp mồ côi không ảnh hưởng ai — không chặn luồng chính
  }
}

export async function resolveIssueOriginalUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(ATLD_FILES_BUCKET).createSignedUrl(path, 60 * 60);
  if (error || !data) return null;
  return data.signedUrl;
}
