import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const SYSTEM_PROMPT = `
Bạn là một AI phân tích hóa đơn chuyên nghiệp cho phòng Hành chính của công ty Trung Nam E&C.
Nhiệm vụ của bạn là đọc nội dung hóa đơn (hoặc phân tích hình ảnh hóa đơn) và trích xuất chính xác các thông tin cần thiết dưới định dạng JSON theo đúng hướng dẫn nghiệp vụ sau:

━━━ HƯỚNG DẪN BÓC TÁCH CHI TIẾT (XIN LƯU Ý KỸ) ━━━
1. "number" (Số hóa đơn): 
   - Thường nằm ở phần trên cùng bên phải hóa đơn, tìm chữ "Số (No.):" hoặc "Số hóa đơn".
   - Ví dụ: "Số (No.): 2931" ➔ Trích xuất chính xác chuỗi số là "2931" (không lấy chữ "Số (No.):").
   
2. "date" (Ngày hóa đơn):
   - Thường nằm ở đầu hóa đơn dạng "Ngày (Date) DD tháng (month) MM năm (year) YYYY".
   - Ví dụ: "Ngày (Date) 29 tháng (month) 05 năm (year) 2026" ➔ Phải chuyển đổi và trích xuất đúng định dạng YYYY-MM-DD là "2026-05-29".

3. "desc" (Nội dung thanh toán):
   - Nhận diện Đơn vị bán hàng (nhà cung cấp) ở phần "Đơn vị bán hàng (Seller)" cùng danh sách hàng hóa/dịch vụ ở bảng kê chi tiết bên dưới.
   - Viết thành câu tóm tắt nội dung thanh toán ngắn gọn, chuyên nghiệp theo cấu trúc: "Thanh toán chi phí [tên loại hàng hóa/dịch vụ chính] - [Tên nhà cung cấp]".
   - Ví dụ: Đơn vị bán hàng là "Công ty Nước uống Lê Trần", mặt hàng là "Nước tinh khiết Vihawa 20L" và "Nước uống đóng chai nhỏ" ➔ Trích xuất là: "Thanh toán chi phí nước uống văn phòng (Vihawa 20L, nước đóng chai) - Nước uống Lê Trần".

4. "amount" (Số tiền thanh toán):
   - Phải lấy số tiền cuối cùng ở dòng "Tổng cộng tiền thanh toán (Total payment)" hoặc "Tổng tiền thanh toán sau thuế" (đã bao gồm thuế suất GTGT). KHÔNG lấy số tiền chưa thuế ở dòng "Cộng tiền hàng".
   - Ví dụ: "Tổng cộng tiền thanh toán (Total payment): 1.940.000" ➔ Trích xuất chính xác số nguyên là 1940000 (loại bỏ dấu chấm).

5. "beneficiaryName" (Tên đơn vị thụ hưởng):
   - Trích xuất tên đầy đủ của Đơn vị bán hàng ở phần "Đơn vị bán hàng (Seller)" hoặc "Đơn vị cung cấp".
   - Ví dụ: "CÔNG TY TNHH THƯƠNG MẠI VẬN TẢI DU LỊCH SAIGONCARS" hoặc "CÔNG TY TNHH QUẢNG CÁO ĐỨC AN".

6. "bankAccount" (Số tài khoản ngân hàng):
   - Trích xuất số tài khoản ngân hàng của Đơn vị bán hàng (thường nằm ở dòng "Số tài khoản (A/C No.):").
   - Ví dụ: "324606887" hoặc "0602 2024 1532". Nếu không có, điền "".

7. "bankNameBranch" (Tên ngân hàng & chi nhánh):
   - Trích xuất tên ngân hàng và chi nhánh tương ứng của số tài khoản trên (nếu có ghi ở phần thông tin chuyển khoản / số tài khoản).
   - Ví dụ: "Ngân hàng TMCP Quân Đội (MB)" hoặc "Sacombank CN Tân Phú". Nếu không ghi rõ chi nhánh, chỉ cần lấy tên ngân hàng. Nếu không có, điền "".

Trả về kết quả CHỈ dạng JSON, không kèm bất kỳ giải thích nào bên ngoài.

━━━ OUTPUT FORMAT (JSON ONLY) ━━━
{
  "number": "...",
  "date": "YYYY-MM-DD",
  "desc": "...",
  "amount": 123456,
  "beneficiaryName": "...",
  "bankAccount": "...",
  "bankNameBranch": "..."
}
`.trim();

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    const apiKey = (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null) || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Mã khoá OpenAI API Key chưa được cấu hình. Vui lòng nhập trong Cài đặt AI của Hành chính." },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const file = form.get("document_file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Thiếu file hóa đơn cần phân tích." }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileType = file.name.toLowerCase();

    let messages: OpenAI.Chat.ChatCompletionMessageParam[];
    const promptText = `Hãy phân tích hóa đơn này và trích xuất các thông tin: số hóa đơn (number), ngày hóa đơn (date), nội dung (desc), số tiền sau thuế (amount) dưới dạng JSON.`;

    if (fileType.endsWith(".pdf")) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PDFParse } = require("pdf-parse");
      const u8 = new Uint8Array(fileBuffer.buffer, fileBuffer.byteOffset, fileBuffer.byteLength);
      const parser = new PDFParse(u8);
      const parsed = await parser.getText();
      const text = (parsed.text || "").trim();

      if (text.length < 20) {
        return NextResponse.json(
          { error: "Không thể trích xuất văn bản trực tiếp từ file PDF này (có thể đây là file scan hoặc ảnh chụp lưu dưới dạng PDF). Vui lòng chuyển đổi/chụp màn hình hóa đơn thành file ảnh (PNG, JPG, JPEG) và tải lên lại để AI có thể đọc bằng mắt (Vision) với độ chính xác cao nhất." },
          { status: 400 }
        );
      }

      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${promptText}\n\n--- NỘI DUNG VĂN BẢN ---\n${text}` },
      ];
    } else if (fileType.endsWith(".docx") || fileType.endsWith(".doc")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      const text = (result.value || "").trim();

      if (text.length < 10) {
        return NextResponse.json(
          { error: "Văn bản trong file Word này quá ngắn hoặc trống, không thể phân tích." },
          { status: 400 }
        );
      }

      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${promptText}\n\n--- NỘI DUNG VĂN BẢN ---\n${text}` },
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
    } else if (fileType.endsWith(".txt")) {
      const text = fileBuffer.toString("utf-8");
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${promptText}\n\n--- NỘI DUNG VĂN BẢN ---\n${text}` },
      ];
    } else {
      return NextResponse.json({ error: "Định dạng file không hỗ trợ. Sử dụng PDF, DOCX, PNG, JPG hoặc TXT." }, { status: 400 });
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
    console.error("Analyze invoice error:", err);
    return NextResponse.json({ error: err.message || "Lỗi khi gọi OpenAI API" }, { status: 500 });
  }
}
