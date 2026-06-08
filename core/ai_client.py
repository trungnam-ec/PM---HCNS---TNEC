import os
import json
import time
from openai import OpenAI
from dotenv import load_dotenv
from core.config_manager import ConfigManager
from core.department_classifier import classify_and_assign

load_dotenv()

class AIClient:
    """
    Wrapper for OpenAI compatible APIs (OpenAI / DeepSeek).
    V2: Extracts 16 structured fields + scoring in one call.
    Settings are prioritized from ConfigManager (config.json) then Environment Variables.
    """
    def __init__(self, api_key: str = None, model: str = None):
        # Prioritize ConfigManager -> Environment Variables -> Arguments
        config = ConfigManager.load_config()
        
        self.api_key = api_key or config.get("openai_api_key") or os.getenv("OPENAI_API_KEY")
        self.base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
        self.model = model or config.get("openai_model") or os.getenv("OPENAI_MODEL", "gpt-4o-mini")

        if not self.api_key:
            # We don't raise immediately here because UI might allow user to enter it later
            # But the client object won't be usable for calls yet.
            self.client = None
        else:
            self.client = OpenAI(
                api_key=self.api_key,
                base_url=self.base_url
            )

    def extract_and_score(
        self,
        cv_data: dict,
        jd_text: str,
        nguon: str = "N/A",
        nguoi_danh_gia: str = "AI Auto",
        ngay: str = None,
        max_retries: int = 3,
    ) -> str:
        if not self.client:
            return self._fallback_json("Missing API Key. Please configure it in Settings.")

        import datetime
        if ngay is None:
            ngay = datetime.date.today().strftime("%Y-%m-%d")

        system_msg, user_msg_content = self._construct_v2_payload(
            cv_data, jd_text, nguon, nguoi_danh_gia, ngay
        )

        for attempt in range(max_retries):
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": system_msg},
                        {"role": "user",   "content": user_msg_content}
                    ],
                    temperature=0.0,
                    seed=42,
                    response_format={"type": "json_object"}
                )
                raw_json = response.choices[0].message.content
                # ── Ghi đè phong_ban và nguoi_danh_gia bằng classifier ──
                return self._override_dept_reviewer(raw_json, jd_text)

            except Exception as e:
                error_str = str(e)
                if "rate_limit" in error_str.lower() and attempt < max_retries - 1:
                    wait = 2 ** attempt
                    time.sleep(wait)
                    continue
                return self._fallback_json(f"API Error: {error_str}")

    def _construct_v2_payload(self, cv_data: dict, jd_text: str,
                               nguon: str, nguoi_danh_gia: str, ngay: str):
        system_msg = f"""
Bạn là Chuyên gia Tuyển dụng AI (AI Recruitment Expert).
Nhiệm vụ: Đọc CV ứng viên và thực hiện ĐỒNG THỜI hai việc:
  1. TRÍCH XUẤT thông tin cá nhân theo đúng 16 trường quy định.
  2. CHẤM ĐIỂM mức độ phù hợp với JD (Job Description).

━━━ QUY TẮC TRÍCH XUẤT (extracted_info) ━━━
- Trích xuất chính xác, không suy diễn ngoài CV.
- Trường không có trong CV → điền chính xác chuỗi "N/A".
- Ngày: luôn định dạng YYYY-MM-DD (hôm nay = {ngay}).
- SĐT: Luôn định dạng: 0xxx xxx xxx (ví dụ: 0932 458 213). Bắt buộc có khoảng trắng ngăn cách. Ghi là text (chuỗi), không phải số nguyên.
- Bằng cấp chuẩn hóa về: ĐH | CĐ | Thạc sĩ | THPT | N/A.
- Kinh nghiệm: Tính TỔNG số năm kinh nghiệm làm việc của ứng viên.
  + Định dạng trả về bắt buộc: "X năm" (ví dụ: "1 năm", "3 năm", "10 năm").
  + Nếu là sinh viên mới ra trường hoặc chưa có kinh nghiệm → trả về "Fresher".
  + Nếu không có thông tin trong CV → trả về "N/A".
- Chức danh gần nhất: Tìm vị trí / chức danh công việc GẦN NHẤT (ưu tiên năm mới nhất: 2025 > 2024 > 2023...).
  + Trả về chức danh dạng ngắn gọn (ví dụ: "Nhân viên", "Chuyên viên", "Kỹ sư kết cấu", "Trưởng phòng").
  + Nếu không rõ → trả về "N/A".
- Công ty gần nhất: Tìm tên công ty / tổ chức ứng viên làm việc GẦN NHẤT (ưu tiên năm mới nhất: 2025 > 2024 > 2023...).
  + Trả về tên đầy đủ của công ty (ví dụ: "Công ty TNHH ABC", "Tập đoàn XYZ").
  + Nếu không rõ → trả về "N/A".
- Vị trí ứng tuyển: Vị trí / công việc mà ứng viên MUỐN APPLY (lấy từ CV, không phải từ JD).
  + Tìm trong CV các từ khóa: "Vị trí ứng tuyển", "Mục tiêu nghề nghiệp", "Vị trí mong muốn"...
  + Nếu không ghi rõ → suy từ mục tiêu và kinh nghiệm trong CV (ví dụ: CV toàn đấu thầu → "Kỹ sư Đấu Thầu").
  + CHỈ điền chức danh ngắn gọn (ví dụ: "Kỹ sư kết cấu cầu", "Kế toán tổng hợp", "Nhân viên văn thư").
  + Tuyệt đối KHÔNG sao chép tên phòng ban → chỉ đưa ra chức danh công việc.
- Nguồn = "{nguon}".
- Phòng Ban & Người đánh giá: hệ thống sẽ tự phân loại từ JD, bạn điền "N/A" cho cả hai trường này.

━━━ ĐẶC THÙ NGÀNH XÂY DỰNG – VỊ TRÍ TRỢ LÝ GIÁM ĐỐC ━━━
Khi JD hoặc vị trí ứng tuyển liên quan đến "Trợ lý Giám đốc", "Thư ký Ban Giám đốc", "Assistant to Director" trong công ty xây dựng/hạ tầng/giao thông, áp dụng bộ tiêu chí sau:

► CHUYÊN NGÀNH PHÙ HỢP (chấp nhận):
  - Xây dựng cầu đường, Giao thông, Hạ tầng, Xây dựng dân dụng & công nghiệp
  - Quản lý xây dựng, Công nghệ kỹ thuật xây dựng
  - Kinh tế xây dựng, Kỹ thuật công trình
  - Quản trị kinh doanh, Quản lý dự án (nếu có kinh nghiệm ngành xây dựng)
  - Lưu ý: ĐH/CĐ là yêu cầu tối thiểu – sinh viên chưa tốt nghiệp không đủ điều kiện.

► HARD SKILLS ĐẶC THÙ (cần đối chiếu kỹ trong CV):
  NHÓM 1 – VĂN PHÒNG & CÔNG NGHỆ (bắt buộc):
  - Thành thạo Word, Excel, PowerPoint (tìm kiếm: "soạn thảo văn bản", "báo cáo tổng hợp", "lập bảng biểu", "trình bày slide")
  - Sử dụng công cụ AI: ChatGPT, Copilot, Gemini, hoặc các AI hỗ trợ công việc
  - Email & lịch công tác: quản lý lịch họp, sắp xếp cuộc họp, theo dõi tiến độ công việc
  
  NHÓM 2 – TỔNG HỢP BÁO CÁO & PHỐI HỢP (quan trọng):
  - Tổng hợp báo cáo định kỳ (tuần/tháng/quý)
  - Phân tích dữ liệu, lập bảng theo dõi dự án
  - Soạn thảo văn bản hành chính, công văn, tờ trình
  - Điều phối thông tin giữa các phòng ban / dự án
  
  NHÓM 3 – HIỂU BIẾT NGÀNH XÂY DỰNG (lợi thế lớn):
  - Có kinh nghiệm làm việc tại công ty xây dựng, nhà thầu, tư vấn giám sát, chủ đầu tư
  - Hiểu quy trình dự án xây dựng: lập hồ sơ, giám sát tiến độ, thanh quyết toán
  - Quen thuộc với: hồ sơ thầu, hồ sơ pháp lý, biên bản nghiệm thu
  - Kinh nghiệm trợ lý dự án hoặc trợ lý Ban Giám đốc trong lĩnh vực xây dựng

► SOFT SKILLS ƯU TIÊN:
  - Kỹ năng giao tiếp, phối hợp đa phòng ban
  - Làm việc độc lập, chủ động, cẩn thận, có trách nhiệm
  - Chịu được áp lực công việc
  - Tiếng Anh giao tiếp / đọc hiểu tài liệu (lợi thế)
  - Có thể đi công tác (lợi thế)

► ĐỐI TƯỢNG ƯU TIÊN:
  - Nữ, tuổi 23-35
  - Có kinh nghiệm làm trợ lý/thư ký Ban Giám đốc
  - Có kinh nghiệm quản lý dự án xây dựng
  - Có khả năng giao tiếp tiếng Anh

► CÁCH ĐỌC HIỂU CV ĐỂ ĐỐI CHIẾU:
  1. Đọc phần "Kinh nghiệm làm việc" → Xác định đã từng làm trợ lý/thư ký/PA chưa
  2. Đọc phần "Kỹ năng" → Tìm các phần mềm văn phòng, công cụ AI, kỹ năng tổng hợp báo cáo
  3. Đọc phần "Học vấn" → Kiểm tra chuyên ngành có liên quan xây dựng/kỹ thuật không
  4. Đọc "Mục tiêu nghề nghiệp" → Có định hướng làm trợ lý/hành chính không
  5. Ưu tiên ứng viên có kinh nghiệm THỰC TẾ trong doanh nghiệp ngành xây dựng (nhà thầu, chủ đầu tư, tư vấn)
  6. KHÔNG loại ngay nếu chuyên ngành không phải xây dựng – cần đánh giá kinh nghiệm thực tế

━━━ QUY TẮC CHẤM ĐIỂM (score) ━━━
Bước 1: Phân tích JD → xác định đây có phải vị trí "Trợ lý Giám đốc ngành xây dựng" không.
  - Nếu CÓ → áp dụng bộ tiêu chí ĐẶC THÙ NGÀNH ở trên.
  - Nếu KHÔNG → áp dụng bộ tiêu chí CHUNG cho các vị trí khác (Hành chính, Nhân sự, Kế toán, Kỹ sư, v.v.) dựa trên yêu cầu trong JD.
Bước 2: Quét toàn bộ CV (không chỉ phần "Kỹ năng") để tìm bằng chứng kỹ năng và kinh nghiệm thực tế.
  - Ưu tiên các kỹ năng được chứng minh qua lịch sử kinh nghiệm làm việc thực tế, không chỉ liệt kê từ khóa.
Bước 3: Tính điểm:
  * Trường hợp 1: Nếu là vị trí Trợ lý GĐ ngành xây dựng:
    - Kỹ năng văn phòng & tổng hợp (Max 30): Word/Excel/PPT + báo cáo + điều phối.
    - Hiểu biết & kinh nghiệm ngành xây dựng (Max 25): từng làm ở DN xây dựng / quen quy trình dự án.
    - Kinh nghiệm trợ lý / thư ký (Max 25): số năm & vị trí phù hợp.
    - Soft skills & ưu tiên (Max 20): giới tính, tuổi, tiếng Anh, công tác, AI tools.
  * Trường hợp 2: Đối với các vị trí tuyển dụng thông thường khác (như Hành chính, Nhân sự, Kế toán, Kỹ sư...):
    - Kinh nghiệm làm việc liên quan (Max 40): Số năm làm việc và độ tương thích với vị trí trong JD (Ví dụ: ứng viên có trên 3 năm kinh nghiệm làm hành chính/nhân sự đúng như JD yêu cầu sẽ nhận 35-40 điểm).
    - Kỹ năng chuyên môn / Hard Skills (Max 25): Mức độ tương thích giữa kỹ năng trong CV với các yêu cầu kỹ thuật/nghiệp vụ cụ thể trong JD (Ví dụ: đặt vé, quản lý thiết bị văn phòng, điều phối xe, lưu trữ hồ sơ, xử lý chứng từ thanh toán).
    - Học vấn / Bằng cấp (Max 15): Trình độ bằng cấp và chuyên ngành có phù hợp với vị trí ứng tuyển.
    - Kỹ năng mềm & Công cụ văn phòng (Max 20): Word, Excel, PowerPoint, giao tiếp, ngoại ngữ, công cụ AI.
Bước 4: Phạt điểm (áp dụng chung):
  - -20 nếu không đạt yêu cầu bằng cấp tối thiểu ghi trong JD.
  - -15 nếu không có kỹ năng làm việc hoặc kinh nghiệm liên quan cơ bản nào.
  - -10 nếu là sinh viên mới ra trường ứng tuyển vào vị trí yêu cầu kinh nghiệm.
Bước 5: Nếu score >= 70 → Trạng thái = "PASS CV", ngược lại = "FAIL".

━━━ TÍNH NHẤT QUÁN & ĐỊNH HÌNH ĐIỂM SỐ (Consistency & Determinism) ━━━
- Quá trình chấm điểm phải tuyệt đối KHÁCH QUAN, ĐỒNG NHẤT và KHÔNG ĐƯỢC phép thay đổi kết quả ngẫu nhiên giữa các lần chấm.
- Với cùng một hồ sơ CV và mô tả công việc JD, bạn bắt buộc phải tính toán ra số điểm giống nhau 100% trong mọi lần chạy (ví dụ chấm 10 lần đều phải ra cùng một số điểm).
- Thực hiện cộng/trừ điểm một cách cơ học và toán học chuẩn xác theo đúng khung tiêu chí đã quy định, không được tự ý nâng/hạ điểm số dựa trên cảm tính.

━━━ OUTPUT FORMAT (JSON ONLY) ━━━
{{
  "extracted_info": {{
    "stt": null,
    "ngay": "{ngay}",
    "ten_ung_vien": "...",
    "email": "...",
    "sdt": "...",
    "bang_cap": "...",
    "chuyen_nganh": "...",
    "kinh_nghiem": "...",
    "chuc_danh_gan_nhat": "...",
    "cong_ty_gan_nhat": "...",
    "khu_vuc": "...",
    "phong_ban": "...",
    "vi_tri": "...",
    "trang_thai": "PASS CV | FAIL",
    "nguon": "{nguon}",
    "nguoi_danh_gia": "{nguoi_danh_gia}"
  }},
  "score": 0-100,
  "matching_skills": ["..."],
  "missing_skills": ["..."],
  "summary": "Giải thích ngắn cách tính điểm.",
  "recommendation": "Interview | Hold | Reject"
}}
"""
        user_content = []
        user_content.append({"type": "text", "text": f"--- MÔ TẢ CÔNG VIỆC (JD) ---\n{jd_text}\n\n"})
        if cv_data.get("is_scanned") and cv_data.get("images"):
            user_content.append({"type": "text", "text": "--- ẢNH CHỤP CV (SCANNED) ---\n"})
            for b64_img in cv_data["images"]:
                user_content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64_img}"}})
        else:
            user_content.append({"type": "text", "text": f"--- NỘI DUNG CV (TEXT) ---\n{cv_data.get('text', '')}"})
        user_content.append({"type": "text", "text": "\nTRÍCH XUẤT ĐẦY ĐỦ 16 TRƯỜNG VÀ CHẤM ĐIỂM. TRẢ VỀ JSON."})
        return system_msg, user_content

    def _override_dept_reviewer(self, raw_json: str, jd_text: str) -> str:
        """Override phong_ban, nguoi_danh_gia từ JD và fallback vi_tri nếu N/A."""
        try:
            data = json.loads(raw_json)
            vi_tri_ai = data.get("extracted_info", {}).get("vi_tri", "")
            phong_ban, nguoi_danh_gia = classify_and_assign(jd_text, vi_tri_ai)
            if "extracted_info" in data:
                data["extracted_info"]["phong_ban"] = phong_ban
                data["extracted_info"]["nguoi_danh_gia"] = nguoi_danh_gia
                # Nếu AI vẫn trả vi_tri = N/A, dùng chức danh gần nhất làm fallback
                current_vi_tri = str(data["extracted_info"].get("vi_tri", "")).strip()
                if not current_vi_tri or current_vi_tri.upper() == "N/A":
                    chuc_danh = str(data["extracted_info"].get("chuc_danh_gan_nhat", "")).strip()
                    data["extracted_info"]["vi_tri"] = chuc_danh if chuc_danh and chuc_danh.upper() != "N/A" else "N/A"
            return json.dumps(data, ensure_ascii=False)
        except Exception:
            return raw_json

    def _fallback_json(self, error_msg: str) -> str:
        return json.dumps({
            "extracted_info": {
                "stt": None, "ngay": "N/A", "ten_ung_vien": "Lỗi", "trang_thai": "FAIL"
            },
            "score": 0, "matching_skills": [], "missing_skills": [],
            "summary": error_msg, "recommendation": "Reject"
        }, ensure_ascii=False)