import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import * as XLSX from "xlsx";

const DEPARTMENTS = [
  "Phòng Hành Chính Nhân Sự",
  "Phòng Tài Chính Kế Toán",
  "Phòng Vật Tư Thiết Bị",
  "Phòng Thị Trường",
  "Phòng Kế Hoạch Đấu Thầu",
  "Phòng Kỹ Thuật",
  "Phòng An Toàn Lao Động",
  "Phòng Quản Lý Dự Án",
  "Phòng Thư Ký, Trợ Lý",
  "Giám đốc",
  "Phó Giám đốc"
];

const PROJECTS = [
  "BĐH Vàm Lẽo",
  "BĐH Rạch Xuyên Tâm",
  "BĐH Thường Phước",
  "BĐH XLNT Tây Ninh",
  "BĐH KCN Cà Ná",
  "BĐH Chống Hạn Ninh Thuận",
  "BĐH Tỉnh Lộ 8",
  "BĐH Cầu Mã Đà",
  "BĐH ĐMT Trà Vinh 2",
  "BĐH Hương Lộ 11"
];

const SYSTEM_PROMPT = `
Bạn là AI chuyên phân tích phiếu/file yêu cầu văn phòng phẩm (VPP) của công ty Trung Nam E&C.
Nhiệm vụ của bạn là phân tích văn bản hoặc tệp (Excel, Word, PDF, hình ảnh) được tải lên và trích xuất các thông tin sau dưới định dạng JSON:

1. "targetType": Phân loại loại đối tượng yêu cầu. Phải là một trong hai giá trị sau:
   - "phongban": Nếu đối tượng yêu cầu là một Phòng ban văn phòng.
   - "duan": Nếu đối tượng yêu cầu là một Ban điều hành Dự án công trường.
   
2. "targetName": Tên phòng ban hoặc dự án yêu cầu, bắt buộc phải khớp (hoặc ánh xạ gần nhất    *(Ví dụ: Nếu trong file ghi "Phòng QLDA" hoặc "Dự án", hãy ánh xạ sang "Phòng Dự án"; nếu ghi "HCNS" ánh xạ sang "Phòng HCNS"; nếu ghi "BĐH Vàm Lẽo" hoặc "Vàm Lẽo" ánh xạ sang "Vàm Lẽo")*

3. "requesterName": Tên người yêu cầu/đề xuất cụ thể trên phiếu yêu cầu (ví dụ: "Thanh Hằng", "Nguyễn Văn A"...). Tìm kiếm xung quanh các dòng "Người yêu cầu", "Người đề xuất", hoặc chữ ký "Người nhận" / "Người lập". Nếu không tìm thấy, để là chuỗi rỗng "".

4. "items": Danh sách các vật tư yêu cầu cấp phát. Mỗi phần tử là một object gồm:
   - "name": Tên vật tư (ví dụ: "Bút bi Thiên Long xanh", "Giấy A4 Double A 70gsm", "Bìa còng 7cm"). Hãy chuẩn hóa và làm sạch tên vật tư (bỏ số thứ tự ở đầu, ký tự rác...).
   - "unit": Đơn vị tính (ví dụ: "Cái", "Ram", "Hộp", "Cuốn"). Nếu không có thông tin đơn vị tính, hãy dự đoán hợp lý dựa trên loại vật tư (ví dụ: bút -> cái/hộp, giấy -> ram/thùng).
   - "qty": Số lượng yêu cầu (kiểu số nguyên dương). Nếu ghi số lượng kèm chữ, chỉ trích xuất phần số nguyên (ví dụ: "5 cái" -> 5).

━━━ QUY TẮC PHÂN TÍCH ━━━
- Đọc kỹ tiêu đề bảng, các dòng tiêu đề, cột thông tin đơn vị, số lượng, tên vật tư.
- Trả về kết quả dạng JSON duy nhất, không kèm bất kỳ giải thích hay khối code markdown nào ngoài định dạng JSON thuần túy.

━━━ OUTPUT FORMAT (JSON ONLY) ━━━
{
  "targetType": "phongban | duan",
  "targetName": "...",
  "requesterName": "...",
  "items": [
    {
      "name": "...",
      "unit": "...",
      "qty": 10
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
        { error: "Mã khoá OpenAI API Key chưa được cấu hình. Vui lòng nhập trong mục Cài đặt hệ thống hoặc Cấu hình AI VPP." },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const file = form.get("vpp_file") as File | null;
    const originalFilename = form.get("original_filename") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Thiếu file văn bản cần phân tích." }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileType = file.name.toLowerCase();

    let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    const filenameInfo = originalFilename ? `Tên file tài liệu gốc: "${originalFilename}"` : `Tên file tài liệu: "${file.name}"`;
    const promptText = `Hãy phân tích tài liệu yêu cầu VPP này. 
${filenameInfo}
Hãy trích xuất thông tin dạng JSON gồm: targetType, targetName, requesterName, items.`;

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
      const model = req.headers.get("x-openai-model") || process.env.OPENAI_MODEL || "gpt-4o-mini";
      try {
        // Try the responses API first (if available in the library)
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
    console.error("Analyze VPP document error:", err);
    return NextResponse.json({ error: err.message || "Lỗi khi gọi OpenAI API" }, { status: 500 });
  }
}
