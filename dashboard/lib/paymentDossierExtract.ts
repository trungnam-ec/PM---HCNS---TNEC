"use client";

// ============================================================
// paymentDossierExtract.ts — Bóc tách hồ sơ thanh toán GỌI OPENAI THẲNG TỪ
// TRÌNH DUYỆT (giống module Biên bản họp).
//
// VÌ SAO KHÔNG QUA SERVER: Vercel gói Free cắt hàm serverless ở 60 GIÂY. Hợp
// đồng/hồ sơ nhiều trang + model suy luận (gpt-5.6) xử lý lâu hơn 60s -> hàm bị
// giết -> lỗi. Gọi thẳng từ trình duyệt thì KHÔNG có trần thời gian, đọc file
// lớn/chậm bao lâu cũng được (SDK để timeout 30 phút). Khoá dùng khoá OpenAI của
// chính người dùng trong localStorage.
//
// PDF -> Responses API input_file (đọc cả PDF chữ lẫn PDF scan/ảnh qua Vision).
// Ảnh -> Vision (chat). DOCX -> mammoth (bản browser). TXT -> đọc thẳng.
// ============================================================

import OpenAI from "openai";
import {
  SYSTEM_PROMPT,
  FULL_PROMPT,
  isReasoningModel,
  PAYMENT_REASONING_EFFORT,
} from "./paymentDossierPrompt";

function client(apiKey: string) {
  return new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true,
    timeout: 30 * 60 * 1000, // hồ sơ nhiều trang có thể chạy vài phút
    maxRetries: 1,
  });
}

// File -> data URL "data:<mime>;base64,....."
function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error || new Error("Không đọc được tệp"));
    r.readAsDataURL(file);
  });
}

export type ExtractResult = {
  data: Record<string, unknown>;
  validationScores: Record<string, number>;
};

export async function extractPaymentDossierInBrowser(opts: {
  apiKey: string;
  model: string;
  file: File;
}): Promise<ExtractResult> {
  const { apiKey, model, file } = opts;
  const openai = client(apiKey);
  const name = file.name.toLowerCase();
  let extracted: any;

  if (name.endsWith(".pdf")) {
    const dataUrl = await toDataUrl(file);
    const params: any = {
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: `${SYSTEM_PROMPT}\n\n${FULL_PROMPT}` },
            { type: "input_file", filename: file.name, file_data: dataUrl },
          ],
        },
      ],
      text: { format: { type: "json_object" } },
    };
    if (isReasoningModel(model)) params.reasoning = { effort: PAYMENT_REASONING_EFFORT };
    const resp: any = await openai.responses.create(params);
    extracted = JSON.parse(resp.output_text || "{}");
  } else if (/\.(png|jpe?g|webp)$/.test(name)) {
    const dataUrl = await toDataUrl(file);
    const params: any = {
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: FULL_PROMPT },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    };
    if (isReasoningModel(model)) params.reasoning_effort = PAYMENT_REASONING_EFFORT;
    else params.temperature = 0;
    const c: any = await openai.chat.completions.create(params);
    extracted = JSON.parse(c.choices?.[0]?.message?.content || "{}");
  } else if (name.endsWith(".docx") || name.endsWith(".doc")) {
    // @ts-expect-error — bản browser của mammoth không kèm .d.ts
    const mod: any = await import("mammoth/mammoth.browser");
    const mammoth = mod.default || mod;
    const arrayBuffer = await file.arrayBuffer();
    const res = await mammoth.extractRawText({ arrayBuffer });
    const text = String(res?.value || "").trim();
    if (text.length < 10) throw new Error("Văn bản trong file Word quá ngắn hoặc trống.");
    extracted = await chatText(openai, model, text);
  } else if (name.endsWith(".txt")) {
    const text = (await file.text()).trim();
    extracted = await chatText(openai, model, text);
  } else {
    throw new Error("Định dạng file không hỗ trợ. Dùng PDF, PNG, JPG, WEBP, DOCX hoặc TXT.");
  }

  const hasWrapper = extracted && typeof extracted === "object" && "data" in extracted;
  return {
    data: (hasWrapper ? extracted.data : extracted) || {},
    validationScores: (hasWrapper ? extracted.validationScores : {}) || {},
  };
}

async function chatText(openai: OpenAI, model: string, text: string): Promise<any> {
  const params: any = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `${FULL_PROMPT}\n\n--- NỘI DUNG VĂN BẢN ---\n${text}` },
    ],
    response_format: { type: "json_object" },
  };
  if (isReasoningModel(model)) params.reasoning_effort = PAYMENT_REASONING_EFFORT;
  else params.temperature = 0;
  const c: any = await openai.chat.completions.create(params);
  return JSON.parse(c.choices?.[0]?.message?.content || "{}");
}
