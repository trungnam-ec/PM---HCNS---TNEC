// ============================================================
// emailMatch — NHẬN DIỆN EMAIL ĐĂNG NHẬP: KHỚP TUYỆT ĐỐI, KHÔNG CHUỖI CON
//
// Lỗ hổng đã vá (08/09/2026): khắp hệ thống tra "email đăng nhập này là nhân sự
// nào" bằng `email LIKE '%loginEmail%'` (chuỗi con). Vì `phamthanhloc92vn@gmail.com`
// CHỨA chuỗi `thanhloc92vn@gmail.com`, nên email phụ chưa được cấp phép vẫn lọt
// vào hệ thống dưới hồ sơ của email chính. Đây là lỗi bảo mật nghiêm trọng.
//
// Nguyên tắc: một ô email (cột employees_directory.email / allowed_users.email /
// approval_permissions.email …) có thể chứa NHIỀU email của cùng một người, ngăn
// cách bằng dấu phẩy / chấm phẩy / khoảng trắng / xuống dòng. Email đăng nhập chỉ
// được coi là khớp khi nó BẰNG ĐÚNG một trong các token đó — sai một ký tự (thừa
// hoặc thiếu) là email KHÁC, không được vào.
//
// Cách dùng với Supabase: vẫn để `.ilike("email", `%${login}%`)` làm bộ lọc THÔ
// ở DB (một tập cha an toàn — mọi email khớp tuyệt đối đều là chuỗi con), rồi lọc
// lại bằng emailFieldMatches() trong JS để lấy đúng dòng. Nhớ `select` kèm cột
// `email` và BỎ `.maybeSingle()` (bộ lọc thô có thể trả nhiều dòng).
// ============================================================

// Chuẩn hoá MỘT email: bỏ khoảng trắng hai đầu + thường hoá. KHÔNG cắt bỏ dấu
// chấm / dấu cộng hay bất kỳ ký tự nào khác — mọi khác biệt ký tự phải giữ nguyên
// để hai email khác nhau không bị coi là một.
export function normalizeEmail(s?: string | null): string {
  return (s || "").trim().toLowerCase();
}

// Tách một ô email (có thể chứa nhiều địa chỉ) thành danh sách email rời đã chuẩn hoá.
export function splitEmails(field?: string | null): string[] {
  return (field || "")
    .split(/[\s,;]+/)
    .map((e) => normalizeEmail(e))
    .filter(Boolean);
}

// Ô email đã lưu có chứa ĐÚNG email đăng nhập hay không — khớp tuyệt đối từng ký
// tự (sau trim + thường hoá), KHÔNG phải khớp chuỗi con.
export function emailFieldMatches(storedField?: string | null, loginEmail?: string | null): boolean {
  const target = normalizeEmail(loginEmail);
  if (!target) return false;
  return splitEmails(storedField).includes(target);
}

// Tiện ích: từ danh sách dòng có cột `email`, lấy dòng đầu tiên khớp TUYỆT ĐỐI
// email đăng nhập. Trả về { row, matches } để nơi gọi biết có nhiều dòng trùng
// (hồ sơ trùng email) mà cảnh báo nếu cần.
export function pickRowByEmail<T extends { email?: string | null }>(
  rows: T[] | null | undefined,
  loginEmail?: string | null
): { row: T | null; matches: T[] } {
  const matches = (rows || []).filter((r) => emailFieldMatches(r.email, loginEmail));
  return { row: matches[0] || null, matches };
}
