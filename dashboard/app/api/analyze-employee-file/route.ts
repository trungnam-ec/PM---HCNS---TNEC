/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import * as XLSX from "xlsx";

const DEPARTMENTS = [
  "Phòng Hành Chính Nhân Sự",
  "Phòng Kế Toán",
  "Phòng Vật Tư Thiết Bị",
  "Phòng Thị Trường",
  "Phòng Kế Hoạch Đấu Thầu",
  "Phòng Kỹ Thuật",
  "Phòng An Toàn Lao Động",
  "Phòng Quản Lý Dự Án"
];

const SYSTEM_PROMPT = `
Bạn là một AI phân tích tài liệu và hồ sơ nhân sự chuyên nghiệp cho công ty Trung Nam E&C.
Nhiệm vụ của bạn là đọc và trích xuất danh sách thông tin nhân viên từ tệp tài liệu (Excel, Word, PDF, hình ảnh) được cung cấp.

Hãy trích xuất và chuyển đổi các thông tin thành định dạng JSON chứa một danh sách các nhân viên.

Mỗi nhân viên cần có các trường dữ liệu sau:
1. "name": Họ và tên đầy đủ của nhân viên. Viết hoa các chữ cái đầu (ví dụ: "Nguyễn Văn A").
2. "department": Tên phòng ban làm việc. PHẢI được ánh xạ chính xác về một trong các phòng ban hợp lệ dưới đây:
   ${JSON.stringify(DEPARTMENTS)}
   *(Ví dụ: "Hành chính nhân sự", "HCNS", "Phòng HCNS" -> "Phòng Hành Chính Nhân Sự"; "Kế toán", "P. Kế toán" -> "Phòng Kế Toán"; "Vật tư", "P. Vật tư" -> "Phòng Vật Tư Thiết Bị"; "Dự án", "QLDA", "Quản lý dự án" -> "Phòng Quản Lý Dự Án"; "Kỹ thuật" -> "Phòng Kỹ Thuật"; "An toàn lao động", "ATLĐ" -> "Phòng An Toàn Lao Động")*
3. "position": Chức vụ / Vị trí công việc (ví dụ: "Chuyên viên tuyển dụng", "Kỹ sư cầu đường", "Trưởng phòng"). Nếu không có, dự đoán hoặc điền "Nhân viên".
4. "phone": Số điện thoại liên hệ (ví dụ: "0912345678"). Nếu không có, điền "N/A".
5. "email": Địa chỉ email làm việc (ví dụ: "nguyenvana@gmail.com"). Nếu không có, điền "N/A".
6. "status": Trạng thái làm việc. Phải là một trong hai giá trị sau:
   - "Chính thức"
   - "Thử việc"
   *(Nếu không nêu rõ, mặc định là "Chính thức")*
7. "start": Ngày bắt đầu làm việc (định dạng YYYY-MM-DD, ví dụ: "2026-06-01"). Nếu không có, điền ngày hiện tại hoặc để trống "".

━━━ QUY TẮC PHÂN TÍCH ━━━
- Hãy đọc kỹ các tiêu đề cột (Họ tên, Phòng ban, Điện thoại, Email, Chức vụ, Ngày vào làm, Trạng thái...) để trích xuất đúng dòng thông tin của từng nhân viên.
- Trả về kết quả CHỈ dạng JSON chứa mảng "employees", không kèm giải thích bên ngoài.

━━━ OUTPUT FORMAT (JSON ONLY) ━━━
{
  "employees": [
    {
      "name": "...",
      "department": "...",
      "position": "...",
      "phone": "...",
      "email": "...",
      "status": "Chính thức | Thử việc",
      "start": "YYYY-MM-DD"
    }
  ]
}
`.trim();

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    const apiKey = (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null) || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Mã khoá OpenAI API Key chưa được cấu hình. Vui lòng nhập trong phần Cài đặt AI." },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const file = form.get("employee_file") as File | null;
    const originalFilename = form.get("original_filename") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Thiếu file danh sách cần phân tích." }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileType = file.name.toLowerCase();

    let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    const filenameInfo = originalFilename ? `Tên file tài liệu gốc: "${originalFilename}"` : `Tên file tài liệu: "${file.name}"`;
    const promptText = `Hãy phân tích tài liệu chứa thông tin nhân sự này. 
${filenameInfo}
Hãy trích xuất danh sách nhân viên dạng JSON chứa mảng 'employees'.`;

    if (fileType.endsWith(".xlsx") || fileType.endsWith(".xls")) {
      const workbook = XLSX.read(fileBuffer, { type: "buffer" });
      let excelText = "";
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        excelText += `--- SHEET: ${sheetName} ---\n${csv}\n\n`;
      }
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${promptText}\n\n--- NỘI DUNG SHEET EXCEL ---\n${excelText}` },
      ];
    } else if (fileType.endsWith(".docx") || fileType.endsWith(".doc")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      const text = result.value || "";
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${promptText}\n\n--- NỘI DUNG VĂN BẢN WORD ---\n${text}` },
      ];
    } else if (fileType.endsWith(".png") || fileType.endsWith(".jpg") || fileType.endsWith(".jpeg")) {
      const base64 = fileBuffer.toString("base64");
      const mimeType = fileType.endsWith(".png") ? "image/png" : "image/jpeg";
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: promptText },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ];
    } else if (fileType.endsWith(".pdf")) {
      const base64Pdf = fileBuffer.toString("base64");
      const model = req.headers.get("x-openai-model") || process.env.OPENAI_MODEL || "gpt-4o";
      try {
        if (typeof (openai as any).responses?.create === "function") {
          const response = await (openai as any).responses.create({
            model: model === "gpt-4o-mini" ? "gpt-4o-mini" : model,
            input: [{
              role: "user",
              content: [
                { type: "input_text", text: `${SYSTEM_PROMPT}\n\n${promptText}` },
                { type: "input_file", filename: originalFilename || file.name, file_data: `data:application/pdf;base64,${base64Pdf}` },
              ],
            }],
            text: { format: { type: "json_object" } },
          });
          const rawOutput = response.output_text || "{}";
          return NextResponse.json(JSON.parse(rawOutput));
        } else {
          throw new Error("openai.responses.create is not available, falling back to pdf-parse");
        }
      } catch (pdfErr: any) {
        console.warn("openai.responses.create failed, falling back to pdf-parse:", pdfErr);
        try {
          const pdfParse = require("pdf-parse");
          const parsed = await pdfParse(fileBuffer);
          const text = parsed.text || "";
          messages = [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `${promptText}\n\n--- NỘI DUNG VĂN BẢN PDF ---\n${text}` },
          ];
        } catch (fallbackErr: any) {
          console.error("pdf-parse fallback failed:", fallbackErr);
          return NextResponse.json({ error: "Lỗi phân tích file PDF: " + (fallbackErr.message || fallbackErr) }, { status: 500 });
        }
      }
    } else {
      return NextResponse.json({ error: "Định dạng file không hỗ trợ. Sử dụng Excel (XLSX/XLS), Word (DOCX/DOC), PDF hoặc ảnh (PNG/JPG)." }, { status: 400 });
    }

    const model = req.headers.get("x-openai-model") || process.env.OPENAI_MODEL || "gpt-4o-mini";
    const completion = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const reply = completion.choices[0]?.message?.content || "{}";
    const extractedData = JSON.parse(reply);

    return NextResponse.json(extractedData);
  } catch (err: any) {
    console.error("Analyze employee document error:", err);
    return NextResponse.json({ error: err.message || "Lỗi khi gọi OpenAI API" }, { status: 500 });
  }
}
