// ============================================================
// PHÂN LOẠI PHÒNG BAN CHO KHỐI TUYỂN DỤNG — nguồn duy nhất.
//
// Trước đây trang /recruitment và trang chủ (app/page.tsx) mỗi nơi giữ
// một bản copy của 2 hàm này. Bản ở trang chủ thiếu từ khoá "BĐH" (có
// dấu) và không nhận danh sách BĐH từ bảng `departments`, nên các BĐH
// không trùng từ khoá dự án (BĐH ĐT 769, BĐH Cầu Ba Lai 8, BĐH Cầu Quới
// An, BĐH XLNT Vĩnh Long, BĐH KCN Cà Ná...) bị xếp nhầm vào Khối Văn
// Phòng → 2 trang lệch số. Gom về đây để sửa 1 chỗ là đồng bộ cả hai.
// ============================================================

export const normalizeDepartment = (dept: string): string => {
  if (!dept) return "Chưa xác định";
  const trim = dept.trim();
  const lower = trim.toLowerCase();

  if (
    lower === "atld" ||
    lower === "atlđ" ||
    lower.includes("atlđ") ||
    lower.includes("atld") ||
    lower.includes("an toàn")
  ) {
    return "ATLĐ";
  }
  if (lower === "kỹ thuật" || lower.includes("kỹ thuật")) {
    return "Kỹ thuật";
  }
  if (
    lower === "phòng hành chính nhân sự" ||
    lower === "hcns" ||
    lower === "phòng hcns" ||
    lower.includes("hành chính") ||
    lower.includes("nhân sự")
  ) {
    return "HCNS";
  }
  if (
    lower === "vt-tb" ||
    lower === "vt_tb" ||
    lower.includes("vật tư") ||
    lower.includes("thiết bị")
  ) {
    return "VT-TB";
  }
  if (lower === "kế toán" || lower.includes("kế toán") || lower.includes("tài chính")) {
    return "Kế toán";
  }
  if (lower === "kế hoạch" || lower.includes("kế hoạch")) {
    return "Kế hoạch";
  }
  if (lower === "đấu thầu" || lower.includes("đấu thầu")) {
    return "Đấu thầu";
  }
  if (lower === "thị trường" || lower.includes("thị trường")) {
    return "Thị trường";
  }
  if (
    lower === "quản lý dự án" ||
    lower.includes("qlda") ||
    lower.includes("quản lí dự án") ||
    lower.includes("quản lý dự án")
  ) {
    return "Phòng QLDA";
  }

  return trim.charAt(0).toUpperCase() + trim.slice(1);
};

export const isProjectBlock = (deptName: string, bdhList: string[] = []): boolean => {
  const name = (deptName || "").trim().toUpperCase();

  // Nguồn chính xác nhất: tên nằm trong nhóm type='bdh' của bảng departments.
  // Đặt trước các phép đoán theo từ khoá bên dưới để BĐH mới thêm trong DB
  // (VD "BĐH KCN Cà Ná", "BĐH Hương Lộ 11") không bị xếp nhầm vào khối văn phòng.
  if (bdhList.some((b) => b.trim().toUpperCase() === name)) return true;

  // Direct project indicators (DA., DA , DỰ ÁN, DA)
  if (
    name.startsWith("DA.") ||
    name.startsWith("DA ") ||
    name.startsWith("DỰ ÁN") ||
    name.startsWith("DA") ||
    name.includes("DỰ ÁN") ||
    name.includes("CÔNG TRƯỜNG") ||
    name.includes("BAN ĐIỀU HÀNH") ||
    name.includes("BĐH") ||
    name.includes("BDH")
  ) {
    return true;
  }

  // Specific project keywords/names (RXT, Vàm Lẽo, Mã Đà, Trà Vinh, Thường Phước,
  // Tỉnh Lộ 8, Chống Hạn, Tây Ninh, ĐMT)
  const projectKeywords = [
    "VÀM LẼO", "RXT", "RẠCH XUYÊN TÂM", "MÃ ĐÀ", "TRÀ VINH",
    "THƯỜNG PHƯỚC", "TỈNH LỘ", "CHỐNG HẠN", "TÂY NINH", "ĐMT",
  ];

  return projectKeywords.some((keyword) => name.includes(keyword));
};
