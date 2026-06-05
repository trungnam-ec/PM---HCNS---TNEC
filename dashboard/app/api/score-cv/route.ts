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

export const maxDuration = 60; // Vercel max for hobby plan

const SYSTEM_PROMPT = `
Bạn là Chuyên gia Tuyển dụng AI. Nhiệm vụ: đọc CV và JD, rồi (1) trích xuất thông tin và (2) chấm điểm xác định.

━━━ NGUYÊN TẮC CHẤM ĐIỂM CỐ ĐỊNH ━━━
- Chấm HOÀN TOÀN dựa vào nội dung CV và JD, KHÔNG dựa vào cảm tính.
- Mỗi tiêu chí có mức điểm cố định. PHẢI ghi rõ điểm và lý do cụ thể cho từng tiêu chí.
- 10 lần chấm cùng 1 CV + JD → điểm phải giống nhau.
- Không làm tròn tuỳ ý — chỉ cộng đúng điểm theo rubric.

━━━ RUBRIC CHẤM ĐIỂM (Tổng = 100 điểm) ━━━

[TIÊU CHÍ 1] KINH NGHIỆM LIÊN QUAN (max 40 điểm)
Đọc kỹ MỤC KINH NGHIỆM LÀM VIỆC trong CV. So sánh với yêu cầu JD:
  40đ → CV có ≥ 80% kinh nghiệm trực tiếp khớp với mô tả công việc trong JD (cùng lĩnh vực, cùng loại nhiệm vụ)
  30đ → CV có 60–79% kinh nghiệm phù hợp, hoặc cùng ngành nhưng vị trí khác
  20đ → CV có 40–59% kinh nghiệm tương đối liên quan
  10đ → CV có < 40% liên quan hoặc kinh nghiệm quá khác biệt
  0đ  → CV không có kinh nghiệm làm việc, hoặc hoàn toàn trái ngành

[TIÊU CHÍ 2] KỸ NĂNG CHUYÊN MÔN (max 30 điểm)
Liệt kê tối đa 5 kỹ năng bắt buộc từ JD. Đếm số kỹ năng ứng viên ĐÃ CÓ BẰNG CHỨNG thực tế (không chỉ liệt kê):
  30đ → Có ≥ 4/5 kỹ năng bắt buộc với bằng chứng thực tế
  20đ → Có 3/5 kỹ năng bắt buộc
  10đ → Có 2/5 kỹ năng bắt buộc
  0đ  → Có ≤ 1/5 kỹ năng bắt buộc

[TIÊU CHÍ 3] HỌC VẤN & BẰNG CẤP (max 15 điểm)
  15đ → Bằng cấp đúng yêu cầu JD (ĐH/CĐ/Thạc sĩ tùy JD yêu cầu gì)
  10đ → Bằng cấp thấp hơn 1 bậc so với yêu cầu nhưng bù bằng kinh nghiệm nhiều
  5đ  → Bằng cấp không đúng chuyên ngành nhưng học vấn đạt mức tối thiểu
  0đ  → Không đạt yêu cầu học vấn tối thiểu

[TIÊU CHÍ 4] SOFT SKILLS & PHÙ HỢP VĂN HÓA (max 15 điểm)
  15đ → CV thể hiện rõ ít nhất 3 soft skill yêu cầu (lãnh đạo, giao tiếp, tư duy phân tích, v.v.)
  10đ → CV thể hiện 2 soft skill
  5đ  → CV thể hiện 1 soft skill
  0đ  → Không có bằng chứng soft skill

ĐIỂM PHẠT (trừ vào tổng, tối đa -20):
  -10 → Không đáp ứng yêu cầu bắt buộc được ghi rõ trong JD (must-have)
  -5  → Kinh nghiệm không liên tục hoặc có khoảng trống > 1 năm không giải thích

ĐIỂM CUỐI = Tổng 4 tiêu chí - Phạt (làm tròn về 0 nếu âm)
PASS CV nếu điểm ≥ 70, FAIL nếu < 70.

━━━ QUY TẮC TRÍCH XUẤT ━━━
- Trích xuất chính xác, không suy diễn ngoài CV.
- Trường không có → điền đúng chuỗi "N/A".
- Ngày: YYYY-MM-DD. SĐT: 0xxx xxx xxx. Bằng cấp: ĐH | CĐ | Thạc sĩ | THPT | N/A.
- Kinh nghiệm: tổng số năm, định dạng "X năm". Fresher nếu chưa có KN.
- Phòng Ban & Người đánh giá: điền "N/A".

━━━ OUTPUT FORMAT (JSON ONLY, không giải thích ngoài JSON) ━━━
{
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
    "kinh_nghiem": { "diem": 0, "toi_da": 40, "ly_do": "Giải thích cụ thể dựa trên CV, trích dẫn công việc/nhiệm vụ cụ thể" },
    "ky_nang":     { "diem": 0, "toi_da": 30, "ly_do": "Liệt kê kỹ năng có/thiếu, trích dẫn từ CV" },
    "hoc_van":     { "diem": 0, "toi_da": 15, "ly_do": "Nêu bằng cấp và mức độ phù hợp" },
    "soft_skill":  { "diem": 0, "toi_da": 15, "ly_do": "Nêu bằng chứng soft skill tìm thấy trong CV" },
    "phat":        { "diem": 0, "toi_da": 0,  "ly_do": "Lý do phạt (nếu không phạt → ghi N/A)" }
  },
  "matching_skills": ["kỹ năng 1", "kỹ năng 2"],
  "missing_skills": ["kỹ năng thiếu 1", "kỹ năng thiếu 2"],
  "summary": "Tóm tắt 2-3 câu: điểm mạnh chính, điểm yếu chính, kết luận.",
  "recommendation": "Interview | Hold | Reject"
}
`.trim();

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
      // Use require for CJS compat with Next.js
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      const parsed = await pdfParse(fileBuffer);
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
