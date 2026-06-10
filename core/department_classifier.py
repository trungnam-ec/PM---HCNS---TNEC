"""
department_classifier.py
Phân loại Phòng Ban và gán Người Đánh Giá dựa trên từ khóa trong JD / vị trí ứng tuyển.
"""

from __future__ import annotations

# ─────────────────────────────────────────────────────────────────────────────
# 1. KEYWORD → PHÒNG BAN mapping
#    Mỗi phòng ban kèm danh sách từ khóa đặc trưng (lowercase, không dấu).
# ─────────────────────────────────────────────────────────────────────────────

DEPARTMENT_KEYWORDS: dict[str, list[str]] = {
    "Phòng Kế Hoạch": [
        # nhóm đấu thầu / dự toán
        "đấu thầu", "dau thau",
        "lập giá dự thầu", "lap gia du thau",
        "phân tích đơn giá", "phan tich don gia",
        "dự toán", "du toan",
        "bóc tách khối lượng", "boc tach khoi luong",
        "phân tích giá vật liệu", "phan tich gia vat lieu",
        "kiểm soát chi phí", "kiem soat chi phi",
        "quyết toán công trình", "quyet toan cong trinh",
        "lập dòng tiền dự án", "lap dong tien du an",
        "quản lý hợp đồng xây dựng", "quan ly hop dong xay dung",
        "thanh quyết toán", "thanh quyet toan",
        "khối lượng phát sinh", "khoi luong phat sinh",
        "hồ sơ pháp lý dự án", "ho so phap ly du an",
        "báo cáo sản lượng", "bao cao san luong",
        "kinh tế xây dựng", "kinh te xay dung",
        "kế hoạch", "ke hoach",
    ],
    "Phòng Kỹ Thuật": [
        "shopdrawing", "shop drawing",
        "kết cấu cầu", "ket cau cau",
        "kỹ thuật", "ky thuat",
        "bản vẽ", "ban ve",
        "thiết kế", "thiet ke",
        "cầu đường", "cau duong",
        "xây dựng", "xay dung",
        "thi công", "thi cong",
        "giám sát kỹ thuật", "giam sat ky thuat",
    ],
    "Phòng ATLĐ": [
        "hse",
        "an toàn lao động", "an toan lao dong",
        "atlđ", "atld",
        "giám sát an toàn", "giam sat an toan",
        "bảo hộ lao động", "bao ho lao dong",
        "an toàn", "an toan",
        "pccc",
        "môi trường", "moi truong",
    ],
    "Phòng Vật Tư Thiết Bị": [
        "vật tư", "vat tu",
        "cung ứng", "cung ung",
        "mua hàng", "mua hang",
        "logistics",
        "nhà cung cấp", "nha cung cap",
        "kho", "warehouse",
        "thiết bị", "thiet bi",
        "cung cấp vật tư", "cung cap vat tu",
        "procurement",
    ],
    "Phòng Tài Chính Kế Toán": [
        "kế toán", "ke toan",
        "tài chính", "tai chinh",
        "hạch toán", "hach toan", "hoach toan",
        "công nợ", "cong no",
        "thanh toán", "thanh toan",
        "dòng tiền", "dong tien",
        "ngân sách", "ngan sach",
        "kiểm toán", "kiem toan",
        "thuế", "thue",
    ],
    "Phòng Hành Chính Nhân Sự": [
        "hành chính", "hanh chinh",
        "nhân sự", "nhan su",
        "tuyển dụng", "tuyen dung",
        "văn thư", "van thu",
        "marketing",
        "lao động tiền lương", "lao dong tien luong",
        "c&b",
        "hr",
        "đào tạo", "dao tao",
    ],
    "Phòng Thư Ký, Trợ Lý": [
        "thư ký", "thu ky",
        "trợ lý", "tro ly",
        "trợ lý giám đốc", "tro ly giam doc",
        "secretary",
        "assistant",
        "administrative assistant",
    ],
    "Phòng Dự Án": [
        "quản lý dự án", "quan ly du an",
        "dự án", "du an",
        "project manager",
        "project management",
        "pm",
        "điều phối dự án", "dieu phoi du an",
    ],
    "Phòng QLCC": [
        "quản lý chất lượng", "quan ly chat luong",
        "qlcc",
        "chất lượng công trình", "chat luong cong trinh",
        "quality control", "qc",
        "kiểm định", "kiem dinh",
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
# 2. PHÒNG BAN → NGƯỜI ĐÁNH GIÁ mapping
# ─────────────────────────────────────────────────────────────────────────────

REVIEWER_MAP: dict[str, str] = {
    "Phòng Kỹ Thuật":          "Phó Giám Đốc",
    "Phòng Dự Án":             "PP Dự Án",
    "Phòng Vật Tư Thiết Bị":   "TP Vật Tư Thiết Bị",
    "Phòng Kế Hoạch":          "TP Kế Hoạch",
    "Phòng ATLĐ":              "TP ATLĐ",
    "Phòng Hành Chính Nhân Sự":"TP HCNS",
    "Phòng QLCC":              "Ban Lãnh Đạo",
    "Phòng Thư Ký, Trợ Lý":    "Ban Lãnh Đạo",
    "Phòng Tài Chính Kế Toán":  "Kế Toán Trưởng",
}

# ─────────────────────────────────────────────────────────────────────────────
# 3. PUBLIC FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────

def _normalize(text: str) -> str:
    """Lowercase + strip, giữ dấu tiếng Việt để khớp keyword."""
    return text.lower().strip()


def classify_department(jd_text: str, vi_tri: str = "") -> str:
    """
    Phân tích JD và vị trí ứng tuyển → trả về tên Phòng Ban phù hợp nhất.

    Thuật toán: đếm số keyword khớp cho từng phòng ban → chọn phòng ban có
    điểm cao nhất. Nếu không khớp gì → trả về "N/A".
    """
    combined = _normalize(f"{jd_text} {vi_tri}")

    scores: dict[str, int] = {}
    for dept, keywords in DEPARTMENT_KEYWORDS.items():
        count = sum(1 for kw in keywords if kw in combined)
        if count > 0:
            scores[dept] = count

    if not scores:
        return "N/A"

    return max(scores, key=lambda d: scores[d])


def get_reviewer(phong_ban: str) -> str:
    """
    Dựa vào tên Phòng Ban → trả về tên Người Đánh Giá tương ứng.
    Nếu không tìm thấy → "N/A".
    """
    return REVIEWER_MAP.get(phong_ban, "N/A")


def classify_and_assign(jd_text: str, vi_tri: str = "") -> tuple[str, str]:
    """
    Tiện ích kết hợp: trả về (phong_ban, nguoi_danh_gia) cùng lúc.
    """
    phong_ban = classify_department(jd_text, vi_tri)
    nguoi_danh_gia = get_reviewer(phong_ban)
    return phong_ban, nguoi_danh_gia


# ─────────────────────────────────────────────────────────────────────────────
# Quick test
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    sample_jd = """
    I/ PHÒNG KINH TẾ KẾ HOẠCH:
    - Đấu thầu, lập giá dự thầu
    - Bóc tách khối lượng bản vẽ
    - Quyết toán công trình
    """
    dept, reviewer = classify_and_assign(sample_jd)
    print(f"Phòng: {dept}  |  Người đánh giá: {reviewer}")

    sample_jd2 = "Tuyển kỹ sư shopdrawing kết cấu cầu, đọc bản vẽ kỹ thuật"
    dept2, reviewer2 = classify_and_assign(sample_jd2)
    print(f"Phòng: {dept2}  |  Người đánh giá: {reviewer2}")
