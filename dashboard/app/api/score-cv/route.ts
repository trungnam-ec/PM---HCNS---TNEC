import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// Polyfill DOMMatrix cho Node.js (pdfjs-dist v5+ yêu cầu DOMMatrix trong môi trường browser)
if (typeof globalThis.DOMMatrix === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DOMMatrix = class DOMMatrix {
    m11=1; m12=0; m13=0; m14=0;
    m21=0; m22=1; m23=0; m24=0;
    m31=0; m32=0; m33=1; m34=0;
    m41=0; m42=0; m43=0; m44=1;
    is2D=true; isIdentity=true;
    constructor() {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static fromMatrix(m: any) { return new (globalThis as any).DOMMatrix(m); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static fromFloat32Array(a: any) { return new (globalThis as any).DOMMatrix(a); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static fromFloat64Array(a: any) { return new (globalThis as any).DOMMatrix(a); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    multiply(m: any) { void m; return this; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    translate(x: any, y: any, z?: any) { void x; void y; void z; return this; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scale(s: any) { void s; return this; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rotate(a: any) { void a; return this; }
    inverse() { return this; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transformPoint(p: any) { return p || { x: 0, y: 0 }; }
    toFloat32Array() { return new Float32Array(16); }
    toFloat64Array() { return new Float64Array(16); }
    toString() { return "matrix(1, 0, 0, 1, 0, 0)"; }
  };
}

// Cấu hình GlobalWorkerOptions và WorkerMessageHandler cho pdfjs-dist trong Node.js / Next.js
try {
  const path = require("path");
  const pdfjsWorker = require("pdfjs-dist/legacy/build/pdf.worker.mjs");
  (globalThis as any).pdfjsWorker = {
    WorkerMessageHandler: pdfjsWorker.WorkerMessageHandler
  };
  const pdfjs = require("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
} catch (e) {
  console.warn("Failed to set pdfjs worker setup:", e);
}

export const maxDuration = 60; // Vercel max for hobby plan

const SYSTEM_PROMPT = `
Bạn là Chuyên gia Tuyển dụng AI cao cấp. Nhiệm vụ của bạn là thực hiện đánh giá mức độ phù hợp giữa CV ứng viên và JD (Mô tả công việc) bằng cách áp dụng suy luận logic chặt chẽ, đối chiếu bằng chứng thực tế từ văn bản, và tính toán điểm số một cách nhất quán theo công thức toán học cố định (Deterministic Scoring Rubric). 

Tất cả các đánh giá phải dựa trên bằng chứng hiển thị trong văn bản, TUYỆT ĐỐI không suy diễn, không tự suy đoán, không ước lượng cảm tính, và không chấm điểm ngẫu hứng. 10 lần chấm điểm cho cùng một cặp CV và JD phải cho ra kết quả điểm số giống nhau hoàn toàn.

━━━ QUY TRÌNH SUY LUẬN LOGIC & ĐỐI CHIẾU (3 BƯỚC BẮT BUỘC) ━━━

▶ BƯỚC 1 — PHÂN TÍCH JD & THIẾT LẬP CHECKLIST TIÊU CHUẨN
Hãy trích xuất chính xác các yêu cầu sau từ JD (Nếu JD không đề cập hoặc ghi chung chung, hãy ghi rõ):
  A. Các kỹ năng chuyên môn BẮT BUỘC (Must-have Hard Skills): Liệt kê và đánh số thứ tự rõ ràng (Ví dụ: 1. AutoCAD, 2. Dự toán G8, 3. Shopdrawing). Chỉ lấy những kỹ năng chuyên môn mà JD ghi rõ là yêu cầu bắt buộc hoặc tối thiểu cần có.
  B. Yêu cầu KINH NGHIỆM tối thiểu: Số năm kinh nghiệm tối thiểu và lĩnh vực cụ thể (Ví dụ: "3 năm thi công cầu đường").
  C. Yêu cầu HỌC VẤN tối thiểu: Bằng cấp tối thiểu và chuyên ngành cụ thể (Ví dụ: "Đại học chuyên ngành Cầu đường").
  D. Các kỹ năng mềm (Soft Skills) yêu cầu: Liệt kê rõ các kỹ năng mềm JD nhắc tới.

▶ BƯỚC 2 — ĐỐI CHIẾU CV & TRÍCH XUẤT BẰNG CHỨNG THỰC TẾ
Với từng yêu cầu đã thiết lập ở Bước 1, hãy tìm kiếm bằng chứng trong CV:
  - Bằng chứng ĐẠT (Có bằng chứng): Trích dẫn nguyên văn (trong ngoặc kép "") câu/cụm từ mô tả công việc, dự án hoặc phần kỹ năng trong CV thể hiện rõ ứng viên có kỹ năng hoặc kinh nghiệm đó.
  - Bằng chứng KHÔNG ĐẠT (Không có bằng chứng): Ghi rõ "Không tìm thấy bằng chứng thực tế trong CV".
  * Lưu ý logic quan trọng: Một kỹ năng chỉ liệt kê suông ở mục "Kỹ năng" của CV mà không có mô tả dự án hoặc công việc thực tế sử dụng kỹ năng đó sẽ chỉ được tính là "Đạt một nửa" hoặc "Không đạt" nếu JD yêu cầu kinh nghiệm thực tế về kỹ năng đó. Hãy suy luận dựa trên bằng chứng công việc thực tế của ứng viên.

▶ BƯỚC 3 — TÍNH TOÁN ĐIỂM SỐ THEO CÔNG THỨC TOÁN HỌC CỐ ĐỊNH
Không được tự ý tăng/giảm điểm ngoài các quy tắc sau:

1. KINH NGHIỆM LIÊN QUAN (Tối đa 40 điểm):
   - Bước A: Xác định số năm yêu cầu tối thiểu trong JD (N). Ví dụ: N = 3 năm. (Nếu JD không yêu cầu số năm cụ thể, mặc định N = 1 năm).
   - Bước B: Cộng tổng số năm kinh nghiệm thực tế có liên quan trực tiếp đến vị trí tuyển dụng trong CV có bằng chứng thời gian rõ ràng (Y). Ví dụ: Y = 2.5 năm.
   - Bước C: Tính tỷ lệ đáp ứng R_kn = Y / N.
   - Bước D: Chấm điểm dựa trên tỷ lệ R_kn:
     + R_kn >= 1.0 (Đáp ứng >= 100% số năm yêu cầu) -> 40 điểm.
     + 0.8 <= R_kn < 1.0 (Đáp ứng từ 80% đến dưới 100% số năm yêu cầu) -> 30 điểm.
     + 0.5 <= R_kn < 0.8 (Đáp ứng từ 50% đến dưới 80% số năm yêu cầu) -> 20 điểm.
     + 0.2 <= R_kn < 0.5 (Đáp ứng từ 20% đến dưới 50% số năm yêu cầu) -> 10 điểm.
     + R_kn < 0.2 hoặc không có kinh nghiệm liên quan -> 0 điểm.

2. KỸ NĂNG CHUYÊN MÔN (Tối đa 30 điểm):
   - Bước A: Đếm tổng số kỹ năng chuyên môn bắt buộc trích xuất từ JD ở Bước 1 (K). Ví dụ: K = 4 kỹ năng.
   - Bước B: Đếm số kỹ năng có bằng chứng thực tế trong CV (H). Ví dụ: H = 3 kỹ năng.
   - Bước C: Tính tỷ lệ đáp ứng R_knang = H / K.
   - Bước D: Chấm điểm theo tỷ lệ R_knang:
     + R_knang >= 0.8 (Đáp ứng >= 80% kỹ năng bắt buộc) -> 30 điểm.
     + 0.6 <= R_knang < 0.8 (Đáp ứng từ 60% đến 79%) -> 22 điểm.
     + 0.4 <= R_knang < 0.6 (Đáp ứng từ 40% đến 59%) -> 15 điểm.
     + 0.2 <= R_knang < 0.4 (Đáp ứng từ 20% đến 39%) -> 8 điểm.
     + R_knang < 0.2 -> 0 điểm.

3. HỌC VẤN (Tối đa 15 điểm):
   - Đáp ứng đúng cả bằng cấp tối thiểu và đúng chuyên ngành yêu cầu theo JD -> 15 điểm.
   - Đáp ứng đúng bằng cấp tối thiểu, chuyên ngành khác nhưng có liên quan mật thiết -> 10 điểm.
   - Bằng cấp thấp hơn 1 bậc so với yêu cầu (Ví dụ: JD yêu cầu Đại học, CV có Cao đẳng) -> 7 điểm.
   - Không đạt yêu cầu học vấn tối thiểu hoặc CV không ghi thông tin học vấn -> 0 điểm.

4. SOFT SKILLS (Tối đa 15 điểm):
   - Bước A: Đếm tổng số kỹ năng mềm JD yêu cầu ở Bước 1 (S_jd). Nếu JD không yêu cầu kỹ năng mềm nào, mặc định S_jd = 3 tiêu chí chung: "Làm việc nhóm", "Giao tiếp", "Giải quyết vấn đề".
   - Bước B: Đếm số kỹ năng mềm có bằng chứng thực tế/mô tả cụ thể trong CV (S_cv).
   - Bước C: Chấm điểm:
     + S_cv >= 3 soft skills có bằng chứng -> 15 điểm.
     + S_cv = 2 soft skills có bằng chứng -> 10 điểm.
     + S_cv = 1 soft skill có bằng chứng -> 5 điểm.
     + S_cv = 0 -> 0 điểm.

5. ĐIỂM PHẠT (Trừ điểm trực tiếp):
   - Phạt trừ 10 điểm cho MỖI yêu cầu cực kỳ quan trọng/bắt buộc cốt lõi của JD mà CV hoàn toàn thiếu (Ví dụ: JD yêu cầu bắt buộc có chứng chỉ hành nghề giám sát hạng II nhưng CV không có -> phạt -10 điểm). Tối đa phạt -20 điểm cho mục này.
   - Phạt trừ 5 điểm nếu có khoảng trống kinh nghiệm (gap year) > 12 tháng liên tục không được giải thích trong CV (trừ khoảng thời gian đi học hoặc ứng viên mới tốt nghiệp dưới 1 năm).

ĐIỂM CUỐI CÙNG = Kinh nghiệm + Kỹ năng + Học vấn + Soft Skills - Phạt (Điểm tối đa là 100, tối thiểu là 0, không được âm).
Trạng thái PASS CV nếu ĐIỂM CUỐI CÙNG >= 70 điểm. Trạng thái FAIL nếu ĐIỂM CUỐI CÙNG < 70 điểm.

━━━ QUY TẮC TRÍCH XUẤT THÔNG TIN CHUNG ━━━
- Trích xuất thông tin ứng viên chính xác từ văn bản CV. Nếu không có thông tin, ghi "N/A".
- Định dạng Ngày: YYYY-MM-DD.
- Số điện thoại: Chuẩn hóa dạng "0xxx xxx xxx".
- Học vấn/Bằng cấp: Chỉ ghi một trong các giá trị: ĐH | CĐ | Thạc sĩ | Tiến sĩ | Trung cấp | THPT | N/A.
- Tổng số năm kinh nghiệm: Định dạng dạng "X năm" hoặc "Fresher" nếu chưa có kinh nghiệm.
- Phòng Ban & Người đánh giá: Mặc định ghi "N/A" (Hệ thống sẽ ghi đè).

━━━ OUTPUT — CHỈ JSON, KHÔNG GIẢI THÍCH NGOÀI JSON ━━━
{
  "jd_requirements": {
    "bat_buoc": ["yêu cầu bắt buộc 1", "yêu cầu bắt buộc 2"],
    "uu_tien": ["ưu tiên 1"],
    "hoc_van": "bằng cấp yêu cầu",
    "kinh_nghiem_yeu_cau": "X năm trong lĩnh vực Y"
  },
  "cv_evidence": {
    "dap_ung": ["yêu cầu X -> bằng chứng: [trích dẫn từ CV]"],
    "khong_dap_ung": ["yêu cầu Y -> Không tìm thấy trong CV"]
  },
  "extracted_info": {
    "stt": null,
    "ngay": "YYYY-MM-DD",
    "ten_ung_vien": "...",
    "email": "...",
    "sdt": "...",
    "bang_cap": "...",
    "chuyen_nganh": "...",
    "kinh_nghiem": "...",
    "chuc_danh_gan_nhat": "...",
    "cong_ty_gan_nhat": "...",
    "khu_vuc": "...",
    "phong_ban": "N/A",
    "vi_tri": "...",
    "trang_thai": "PASS CV hoặc FAIL",
    "nguon": "...",
    "nguoi_danh_gia": "N/A"
  },
  "score": 0,
  "score_breakdown": {
    "kinh_nghiem": {
      "diem": 0,
      "toi_da": 40,
      "phan_tram_dap_ung": 0,
      "ly_do": "Kinh nghiệm yêu cầu (N): X năm, Kinh nghiệm thực tế (Y): Z năm (Trích dẫn: \\\"...\\\"). Tỷ lệ đáp ứng: R_kn = Y/N = W%. Điểm chấm: U/40đ."
    },
    "ky_nang": {
      "diem": 0,
      "toi_da": 30,
      "phan_tram_dap_ung": 0,
      "ly_do": "Tổng kỹ năng bắt buộc (K): X, Số kỹ năng đáp ứng (H): Y (Trích dẫn: [Kỹ năng 1: \\\"...\\\", Kỹ năng 2: \\\"...\\\"]). Tỷ lệ đáp ứng: R_knang = H/K = Z%. Điểm chấm: W/30đ."
    },
    "hoc_van": {
      "diem": 0,
      "toi_da": 15,
      "ly_do": "Yêu cầu JD: X, Học vấn CV: Y (Trích dẫn: \\\"...\\\"). Đối chiếu: Z. Điểm chấm: W/15đ."
    },
    "soft_skill": {
      "diem": 0,
      "toi_da": 15,
      "ly_do": "Số kỹ năng mềm có bằng chứng (S_cv): X/Y (Trích dẫn: \\\"...\\\"). Điểm chấm: Z/15đ."
    },
    "phat": {
      "diem": 0,
      "toi_da": 0,
      "ly_do": "Nêu rõ các lỗi phạt nếu có (Ví dụ: -10đ do thiếu yêu cầu cốt lõi X, -5đ do gap year > 12 tháng từ YYYY đến YYYY). Tổng điểm phạt: -Zđ."
    }
  },
  "matching_skills": ["kỹ năng CV có và JD yêu cầu"],
  "missing_skills": ["kỹ năng JD yêu cầu nhưng CV không có"],
  "summary": "Tóm tắt logic chấm điểm: Điểm tổng cộng là X/100đ, bao gồm Kinh nghiệm Y/40đ, Kỹ năng Z/30đ, Học vấn W/15đ, Soft Skill U/15đ, Điểm phạt Vđ. Lý do chính đạt điểm này dựa trên bằng chứng...",
  "recommendation": "Interview | Hold | Reject"
}
`;


// Classification logic (port from department_classifier.py)
const DEPT_KEYWORDS: Record<string, string[]> = {
  "Phòng Kế Hoạch": ["đấu thầu", "dau thau", "dự toán", "du toan", "bóc tách khối lượng", "quyết toán", "quyet toan", "kinh tế xây dựng", "kinh te xay dung", "kế hoạch", "ke hoach"],
  "Phòng Kỹ Thuật": ["shopdrawing", "shop drawing", "kết cấu cầu", "ket cau cau", "kỹ thuật", "ky thuat", "bản vẽ", "ban ve", "thiết kế", "thiet ke", "cầu đường", "cau duong", "thi công", "thi cong"],
  "Phòng ATLĐ": ["hse", "an toàn lao động", "an toan lao dong", "atlđ", "atld", "pccc", "môi trường", "moi truong"],
  "Phòng Vật Tư Thiết Bị": ["vật tư", "vat tu", "cung ứng", "cung ung", "mua hàng", "mua hang", "logistics", "kho", "warehouse", "thiết bị", "thiet bi", "procurement"],
  "Phòng Kế Toán": ["kế toán", "ke toan", "tài chính", "tai chinh", "hạch toán", "hach toan", "công nợ", "cong no", "thuế", "thue", "kiểm toán", "kiem toan"],
  "Phòng Hành Chính Nhân Sự": ["hành chính", "hanh chinh", "nhân sự", "nhan su", "tuyển dụng", "tuyen dung", "văn thư", "van thu", "marketing", "hr", "đào tạo", "dao tao"],
  "Phòng Trợ Lý": ["thư ký", "thu ky", "trợ lý", "tro ly", "trợ lý giám đốc", "tro ly giam doc", "secretary", "assistant", "administrative assistant"],
  "Phòng Dự Án": ["quản lý dự án", "quan ly du an", "dự án", "du an", "project manager", "project management", "điều phối dự án", "dieu phoi du an"],
  "Phòng QLCC": ["quản lý chất lượng", "quan ly chat luong", "qlcc", "chất lượng công trình", "chat luong cong trinh", "quality control", "qc", "kiểm định", "kiem dinh"],
};
const REVIEWER_MAP: Record<string, string> = {
  "Phòng Kỹ Thuật": "Phó Giám Đốc",
  "Phòng Dự Án": "PP Dự Án",
  "Phòng Vật Tư Thiết Bị": "TP Vật Tư Thiết Bị",
  "Phòng Kế Hoạch": "TP Kế Hoạch",
  "Phòng ATLĐ": "TP ATLĐ",
  "Phòng Hành Chính Nhân Sự": "TP HCNS",
  "Phòng QLCC": "Ban Lãnh Đạo",
  "Phòng Trợ Lý": "Ban Lãnh Đạo",
  "Phòng Kế Toán": "Kế Toán Trưởng",
};

function classifyDept(jdText: string, viTri = ""): { phong_ban: string; nguoi_danh_gia: string } {
  const combined = (jdText + " " + viTri).toLowerCase();
  const scores: Record<string, number> = {};
  for (const [dept, kws] of Object.entries(DEPT_KEYWORDS)) {
    const count = kws.filter((kw) => combined.includes(kw)).length;
    if (count > 0) scores[dept] = count;
  }
  const phong_ban = Object.keys(scores).length
    ? Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0]
    : "N/A";
  return { phong_ban, nguoi_danh_gia: REVIEWER_MAP[phong_ban] ?? "N/A" };
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    const apiKey = (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null) || process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY chưa được cấu hình. Vui lòng nhập trong phần Cài đặt." }, { status: 500 });
    }

    const form = await req.formData();
    const jdText = (form.get("jd_text") as string) || "";
    const nguon = (form.get("nguon") as string) || "N/A";
    const file = form.get("cv_file") as File | null;

    if (!file) return NextResponse.json({ error: "Thiếu file CV." }, { status: 400 });

    const today = new Date().toISOString().slice(0, 10);
    const openai = new OpenAI({ apiKey });

    // ── Extract CV content ────────────────────────────────────────────────
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileType = file.name.toLowerCase();

    let messages: OpenAI.Chat.ChatCompletionMessageParam[];

    if (fileType.endsWith(".pdf")) {
      const { PDFParse } = require("pdf-parse");
      const u8 = new Uint8Array(fileBuffer.buffer, fileBuffer.byteOffset, fileBuffer.byteLength);
      const parser = new PDFParse(u8);
      const parsed = await parser.getText();
      const cvText = parsed.text || "";
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `--- MÔ TẢ CÔNG VIỆC (JD) ---\n${jdText}\n\n--- NỘI DUNG CV ---\n${cvText}\n\nTRÍCH XUẤT ĐẦY ĐỦ 16 TRƯỜNG VÀ CHẤM ĐIỂM. TRẢ VỀ JSON.` },
      ];
    } else if (fileType.endsWith(".docx") || fileType.endsWith(".doc")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      const cvText = result.value || "";
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `--- MÔ TẢ CÔNG VIỆC (JD) ---\n${jdText}\n\n--- NỘI DUNG CV ---\n${cvText}\n\nTRÍCH XUẤT ĐẦY ĐỦ 16 TRƯỜNG VÀ CHẤM ĐIỂM. TRẢ VỀ JSON.` },
      ];
    } else if (fileType.endsWith(".png") || fileType.endsWith(".jpg") || fileType.endsWith(".jpeg")) {
      // Vision mode
      const base64 = fileBuffer.toString("base64");
      const mimeType = fileType.endsWith(".png") ? "image/png" : "image/jpeg";
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: `--- MÔ TẢ CÔNG VIỆC (JD) ---\n${jdText}\n\n--- ẢNH CHỤP CV ---` },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
            { type: "text", text: "TRÍCH XUẤT ĐẦY ĐỦ 16 TRƯỜNG VÀ CHẤM ĐIỂM. TRẢ VỀ JSON." },
          ],
        },
      ];
    } else if (fileType.endsWith(".txt")) {
      const cvText = fileBuffer.toString("utf-8");
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `--- MÔ TẢ CÔNG VIỆC (JD) ---\n${jdText}\n\n--- NỘI DUNG CV ---\n${cvText}\n\nTRÍCH XUẤT ĐẦY ĐỦ 16 TRƯỜNG VÀ CHẤM ĐIỂM. TRẢ VỀ JSON.` },
      ];
    } else {
      return NextResponse.json({ error: "Định dạng file không hỗ trợ. Dùng PDF, DOCX, PNG, JPG, hoặc TXT." }, { status: 400 });
    }

    // ── Call OpenAI ───────────────────────────────────────────────────────
    const model = process.env.OPENAI_MODEL || "gpt-4o";
    const completion = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const rawJson = completion.choices[0].message.content || "{}";
    const data = JSON.parse(rawJson);

    // ── Override phong_ban + nguoi_danh_gia ───────────────────────────────
    const viTri = data.extracted_info?.vi_tri || "";
    const { phong_ban, nguoi_danh_gia } = classifyDept(jdText, viTri);
    if (data.extracted_info) {
      data.extracted_info.phong_ban = phong_ban;
      data.extracted_info.nguoi_danh_gia = nguoi_danh_gia;
      data.extracted_info.nguon = nguon;
      data.extracted_info.ngay = today;
      // Fallback vi_tri
      if (!viTri || viTri.toUpperCase() === "N/A") {
        const cd = data.extracted_info.chuc_danh_gan_nhat || "";
        data.extracted_info.vi_tri = cd && cd.toUpperCase() !== "N/A" ? cd : "N/A";
      }
    }
    data.file_name = file.name;

    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
