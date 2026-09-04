import { requireApiAuth, supabaseForCaller } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// ============================================================
// /api/analyze-payment-dossier — Bóc tách "Hồ sơ thanh toán" (module Kế toán)
//
// Dùng CHUNG hệ thống ChatGPT sẵn có: header `Authorization: Bearer <khoá>` là
// khoá OpenAI của người dùng (fallback OPENAI_API_KEY của công ty),
// `x-openai-model` là model. Danh tính vẫn qua `x-supabase-auth` (requireApiAuth).
//
// PDF gửi thẳng lên OpenAI Responses API (input_file) -> đọc được cả PDF chữ lẫn
// PDF scan/ảnh chụp, không cần render pdfjs phía client, không đụng giới hạn
// 4.5MB serverless. Ảnh -> Vision. DOCX -> mammoth. TXT -> đọc thẳng.
//
// Prompt giữ NGUYÊN "linh hồn" bản gốc: ưu tiên trang "Phiếu đề nghị thanh toán",
// trả về { data: {11 trường}, validationScores: {điểm tin cậy} }.
// ============================================================

const SYSTEM_PROMPT = `
Bạn là chuyên gia OCR và trích xuất dữ liệu hồ sơ thanh toán tại Việt Nam. Nhiệm vụ: phân tích TOÀN BỘ nội dung PDF của bộ "Hồ sơ thanh toán" và trả về JSON.

## ƯU TIÊN SỐ 1: PHIẾU ĐỀ NGHỊ THANH TOÁN / GIẤY ĐỀ NGHỊ CHUYỂN TIỀN
⚠️ QUAN TRỌNG NHẤT: Mỗi bộ hồ sơ thanh toán LUÔN CÓ một trang đề nghị chi tiền. Trang này có thể mang MỘT trong các tên sau — TẤT CẢ đều tương đương và xử lý GIỐNG HỆT NHAU:
- "PHIẾU ĐỀ NGHỊ THANH TOÁN" / "Giấy đề nghị thanh toán"
- "GIẤY ĐỀ NGHỊ CHUYỂN TIỀN" / "Phiếu đề nghị chuyển tiền" / "Đề nghị chuyển khoản"
Hai mẫu "Phiếu đề nghị thanh toán" và "Giấy đề nghị chuyển tiền" là HAI BIỂU MẪU có nội dung thanh toán cho ĐỐI TÁC tương tự nhau (đều ghi: người/đơn vị nhận tiền, số tiền, nội dung, số tài khoản, ngân hàng). Dù gặp mẫu nào, hãy trích xuất theo đúng 11 trường bên dưới. Trang này chứa ĐẦY ĐỦ NHẤT các thông tin cần trích xuất.

Bạn PHẢI TÌM VÀ ĐỌC KỸ trang đề nghị chi tiền (theo bất kỳ tên nào ở trên) TRƯỚC TIÊN. Cấu trúc điển hình:
- Tiêu đề: "PHIẾU ĐỀ NGHỊ THANH TOÁN" (in đậm, nằm đầu trang)
- Mã số: "TCKT/BM/..." hoặc tương tự
- Ngày: "Ngày ... / ... / ..."
- Các dòng: "Người đề nghị thanh toán:", "Đơn vị công tác:", "Nội dung thanh toán:", "Hạng mục:"
- Bảng kê chi tiết: STT | Nội dung thanh toán | Ngày Hóa Đơn | Số Hóa Đơn | Số tiền | Ghi chú
- Dòng "Tổng" ở cuối bảng
- Hình thức thanh toán: Tiền mặt / Chuyển khoản
- Phần chuyển khoản: "Đơn vị/Cá nhân nhận tiền:", "Số tài khoản:", "Tại Ngân hàng:"
- Dòng "Số tiền đề nghị thanh toán:" (CON SỐ CHÍNH XÁC NHẤT)
- Các ô ký: TRƯỞNG ĐƠN VỊ | KẾ TOÁN TRƯỞNG | PHỤ TRÁCH ĐƠN VỊ | NGƯỜI ĐỀ NGHỊ

HÃY TRÍCH XUẤT DỮ LIỆU TỪ TRANG NÀY LÀ CHÍNH. Chỉ dùng các trang khác (hóa đơn, hợp đồng, biên bản) để bổ sung thông tin còn thiếu.

## TRƯỜNG DỮ LIỆU CẦN TRÍCH XUẤT:
Trả về object "data" với 11 key sau (tiếng Việt có dấu, chính xác tuyệt đối):
"Ngày đề nghị", "Người nhận tiền", "Nội dung thanh toán", "Số tiền đề nghị thanh toán", "Dự án", "Người đề nghị thanh toán", "Đơn vị công tác", "Số tài khoản", "Tại Ngân hàng", "Hạn Thanh toán", "Danh mục hs kèm theo"

## CHIẾN LƯỢC TÌM TỪNG TRƯỜNG:

### 1. "Ngày đề nghị"
- Tìm ngày trên "Giấy đề nghị thanh toán", "Phiếu đề nghị thanh toán" hoặc tiêu đề tài liệu
- BẮT BUỘC trả về dạng "DD/MM/YYYY". VD: "ngày 13 tháng 3 năm 2026" → "13/03/2026"

### 2. "Người nhận tiền"
- Tìm trong mục "Người nhận tiền", "Đơn vị thụ hưởng", "Tên người hưởng", "Người thụ hưởng"

### 3. "Nội dung thanh toán"
- Tìm trong mục "Nội dung", "Nội dung thanh toán", "Diễn giải", "Lý do thanh toán", "V/v", "Về việc", "Trích yếu"
- Tóm tắt ngắn gọn nội dung thanh toán

### 4. "Số tiền đề nghị thanh toán" — TRƯỜNG QUAN TRỌNG NHẤT
Quét TOÀN BỘ tài liệu theo thứ tự ưu tiên:
1. Tìm "Số tiền đề nghị", "Tổng số tiền", "Số tiền thanh toán", "Số tiền đề nghị thanh toán", "Tổng cộng", "Thành tiền"
2. Tìm số tiền lớn nhất đi kèm VND/VNĐ/đồng/USD
3. Tìm trong bảng: dòng cuối (TỔNG CỘNG) của bảng chi tiết
4. Tìm số tiền viết bằng chữ: "Năm triệu đồng" → 5.000.000
⚠️ TUYỆT ĐỐI KHÔNG trả "N/A" nếu có BẤT KỲ con số nào đi kèm đơn vị tiền tệ
⚠️ Chỉ trả về CON SỐ, không kèm đơn vị. VD: "200000" hoặc "5000000" (không dùng dấu phân cách)

### 5. "Dự án"
- Tìm "Dự án", "Công trình", "Tên dự án", "Project" trong toàn bộ tài liệu

### 6. "Người đề nghị thanh toán"
- Tìm "Người đề nghị", "Người lập", "Người yêu cầu" — thường là người ký ở cuối đơn đề nghị

### 7. "Đơn vị công tác"
- Tìm "Phòng/Ban", "Đơn vị", "Bộ phận" — phòng ban của người đề nghị

### 8. "Số tài khoản"
- Tìm "Số TK", "STK", "Số tài khoản", "Account number"

### 9. "Tại Ngân hàng"
- Tìm "Ngân hàng", "NH", "Bank", "Tại NH"

### 10. "Hạn Thanh toán"
- Tìm "Hạn thanh toán", "Thời hạn thanh toán", "Thanh toán trước ngày"
- Nếu không tìm thấy → trả "N/A". BẮT BUỘC dạng "DD/MM/YYYY" nếu có

### 11. "Danh mục hs kèm theo"
- BẮT BUỘC PHẢI QUÉT TOÀN BỘ NỘI DUNG hồ sơ để kiểm tra.
- Nếu CÓ "Hóa đơn giá trị gia tăng" (hoặc "Hóa đơn GTGT") trong hồ sơ, hãy ghi kết quả trả về trường này (có thể kèm các tài liệu khác, VD: "Đề nghị TT + Hóa đơn giá trị gia tăng", "Hóa đơn GTGT").
- Tương tự, liệt kê các tài liệu khác (nếu có) như Đề nghị TT, HĐ, BBNT...
- Nếu KHÔNG CÓ hóa đơn trong toàn bộ hồ sơ, bạn BẮT BUỘC trả kết quả ghi là: "Không hóa đơn".
- Từ viết tắt phổ biến: TT = Thanh toán, HĐ = Hợp đồng, BBNT = Biên bản nghiệm thu

## CẤU TRÚC JSON BẮT BUỘC (chỉ trả JSON, không giải thích):
{
  "data": {
    "Ngày đề nghị": "...",
    "Người nhận tiền": "...",
    "Nội dung thanh toán": "...",
    "Số tiền đề nghị thanh toán": "...",
    "Dự án": "...",
    "Người đề nghị thanh toán": "...",
    "Đơn vị công tác": "...",
    "Số tài khoản": "...",
    "Tại Ngân hàng": "...",
    "Hạn Thanh toán": "...",
    "Danh mục hs kèm theo": "..."
  },
  "validationScores": { "Ngày đề nghị": 90, "Số tiền đề nghị thanh toán": 95 }
}
`.trim();

const FULL_PROMPT =
  'Hãy phân tích bộ "Hồ sơ thanh toán" này và trích xuất 11 trường theo đúng cấu trúc JSON { "data": {...}, "validationScores": {...} } đã hướng dẫn. Ưu tiên đọc trang đề nghị chi tiền — có thể là "Phiếu đề nghị thanh toán" HOẶC "Giấy đề nghị chuyển tiền" (hai mẫu tương đương).';

async function analyzeWithResponsesAPI(
  openai: OpenAI,
  model: string,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<Record<string, unknown>> {
  const base64Data = fileBuffer.toString("base64");
  const fileDataUrl = `data:${mimeType};base64,${base64Data}`;

  const response = await openai.responses.create({
    model,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: `${SYSTEM_PROMPT}\n\n${FULL_PROMPT}` },
          { type: "input_file", filename: fileName, file_data: fileDataUrl },
        ],
      },
    ],
    text: { format: { type: "json_object" } },
  });

  return JSON.parse(response.output_text || "{}");
}

async function analyzeWithChatCompletions(
  openai: OpenAI,
  model: string,
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
): Promise<Record<string, unknown>> {
  const completion = await openai.chat.completions.create({
    model,
    messages,
    temperature: 0,
    response_format: { type: "json_object" },
  });
  return JSON.parse(completion.choices[0]?.message?.content || "{}");
}

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const authHeader = req.headers.get("Authorization");
    const apiKey =
      (authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : null) || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Chưa cấu hình khoá OpenAI API Key. Vui lòng nhập trong nút 'Cài đặt AI' của trang Hồ sơ thanh toán." },
        { status: 400 }
      );
    }

    // Hai đường vào:
    //  1) JSON { storage_path, filename }: file đã tải thẳng lên Supabase Storage
    //     (né giới hạn 4.5MB của Vercel) -> route tự tải về. Đường mặc định.
    //  2) FormData document_file: gửi trực tiếp (chỉ hợp file nhỏ < 4.5MB).
    const contentType = req.headers.get("content-type") || "";
    let fileBuffer: Buffer;
    let fileName: string;
    let storagePath: string | null = null;
    const caller = supabaseForCaller(auth.caller);

    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      storagePath = (body?.storage_path || "").toString();
      fileName = (body?.filename || "").toString() || "hoso.pdf";
      if (!storagePath) {
        return NextResponse.json({ error: "Thiếu đường dẫn tệp trong kho tạm." }, { status: 400 });
      }
      const dl = await caller.storage.from("payment-dossiers").download(storagePath);
      if (dl.error || !dl.data) {
        return NextResponse.json(
          { error: "Không tải được tệp từ kho tạm: " + (dl.error?.message || "không rõ") },
          { status: 400 }
        );
      }
      fileBuffer = Buffer.from(await dl.data.arrayBuffer());
    } else {
      const form = await req.formData();
      const file = form.get("document_file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "Thiếu file hồ sơ cần phân tích." }, { status: 400 });
      }
      fileName = file.name;
      fileBuffer = Buffer.from(await file.arrayBuffer());
    }

    const openai = new OpenAI({ apiKey });
    const file = { name: fileName };
    const fileType = fileName.toLowerCase();
    const model = req.headers.get("x-openai-model") || process.env.OPENAI_MODEL || "gpt-4o";

    let extracted: Record<string, unknown>;

    if (fileType.endsWith(".pdf")) {
      extracted = await analyzeWithResponsesAPI(openai, model, fileBuffer, file.name, "application/pdf");
    } else if (fileType.endsWith(".docx") || fileType.endsWith(".doc")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      const text = (result.value || "").trim();
      if (text.length < 10) {
        return NextResponse.json(
          { error: "Văn bản trong file Word quá ngắn hoặc trống, không thể phân tích." },
          { status: 400 }
        );
      }
      extracted = await analyzeWithChatCompletions(openai, model, [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${FULL_PROMPT}\n\n--- NỘI DUNG VĂN BẢN ---\n${text}` },
      ]);
    } else if (
      fileType.endsWith(".png") ||
      fileType.endsWith(".jpg") ||
      fileType.endsWith(".jpeg") ||
      fileType.endsWith(".webp")
    ) {
      const base64 = fileBuffer.toString("base64");
      const mimeType = fileType.endsWith(".png")
        ? "image/png"
        : fileType.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";
      extracted = await analyzeWithChatCompletions(openai, model, [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: FULL_PROMPT },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
          ],
        },
      ]);
    } else if (fileType.endsWith(".txt")) {
      const text = fileBuffer.toString("utf-8");
      extracted = await analyzeWithChatCompletions(openai, model, [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${FULL_PROMPT}\n\n--- NỘI DUNG VĂN BẢN ---\n${text}` },
      ]);
    } else {
      return NextResponse.json(
        { error: "Định dạng file không hỗ trợ. Dùng PDF, DOCX, PNG, JPG, WEBP hoặc TXT." },
        { status: 400 }
      );
    }

    // Chuẩn hoá hình dạng đầu ra: một số model trả thẳng 11 key (không bọc "data").
    const hasWrapper = extracted && typeof extracted === "object" && "data" in extracted;
    const data = hasWrapper ? (extracted as any).data : extracted;
    const validationScores = hasWrapper ? (extracted as any).validationScores || {} : {};

    // Xử lý xong -> xoá file tạm trong kho (best-effort, không chặn phản hồi).
    if (storagePath) {
      try { await caller.storage.from("payment-dossiers").remove([storagePath]); } catch {}
    }

    return NextResponse.json({ data: data || {}, validationScores });
  } catch (err: any) {
    console.error("Analyze payment dossier error:", err);
    return NextResponse.json({ error: err.message || "Lỗi khi gọi OpenAI API" }, { status: 500 });
  }
}
