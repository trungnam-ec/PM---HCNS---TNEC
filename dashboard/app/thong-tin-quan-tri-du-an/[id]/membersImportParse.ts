// Dò cột cho "Nhập thành viên từ Excel" (MembersImport.tsx). Hàm thuần, không import
// gì — để chạy thử được ngoài trình duyệt với file mẫu công ty / file "Tải Excel".

export type ImportField =
  | "name" | "unit_group" | "department" | "title" | "project_role"
  | "duty" | "reports_to" | "phone" | "email" | "status";

export type ImportStatus = "NOT_JOINED" | "JOINED" | "CONCURRENT" | "COMPANY_LEVEL";

export function fold(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

// Tên cột -> trường. Bỏ qua: STT, Mã dự án / Dự án / Tên dự án, Quyền hệ thống.
export function fieldOf(header: string): ImportField | null {
  const h = fold(header);
  if (!h) return null;
  if (h.includes("quyen") || h.includes("du an") || h === "stt") return null;
  if (h.includes("trang thai")) return "status";
  if (h.includes("ho va ten") || h.includes("ho ten") || h === "ten" || h.includes("ten nhan su")) return "name";
  if (h.includes("chuc danh") || h.includes("chuc vu")) return "title";
  if (h.includes("vai tro")) return "project_role";
  if (h.includes("nhiem vu")) return "duty";
  if (h.includes("quan ly") || h.includes("bao cao")) return "reports_to";
  if (h.includes("phong ban") || h.includes("bo phan")) return "department";
  if (h.includes("nhom don vi") || h.includes("don vi")) return "unit_group";
  if (h.includes("sdt") || h.includes("dien thoai")) return "phone";
  if (h.includes("mail")) return "email";
  return null;
}

export function statusOf(text: string): ImportStatus {
  const t = fold(text);
  if (t.includes("chua")) return "NOT_JOINED";
  if (t.includes("kiem nhiem")) return "CONCURRENT";
  if (t.includes("cong ty")) return "COMPANY_LEVEL";
  return "JOINED";
}

// Dò hàng tên cột trong 20 dòng đầu: có cột Họ và tên + ít nhất 2 cột khác nhận ra.
export function findHeader(aoa: unknown[][]): { cols: Partial<Record<ImportField, number>>; headerLine: number } | null {
  for (let r = 0; r < Math.min(aoa.length, 20); r++) {
    const cols: Partial<Record<ImportField, number>> = {};
    (aoa[r] || []).forEach((v, i) => {
      const f = fieldOf(String(v ?? ""));
      if (f && cols[f] === undefined) cols[f] = i;
    });
    if (cols.name !== undefined && Object.keys(cols).length >= 3) return { cols, headerLine: r };
  }
  return null;
}
