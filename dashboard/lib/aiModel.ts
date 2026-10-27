// ============================================================
// aiModel.ts — model OpenAI dùng chung cho Hành chính, Nhân sự, C&B, Văn thư, Trình ký
//
// GPT-6.1 Sol là model SUY LUẬN: không nhận `temperature`, không nhận `max_tokens`
// (phải là `max_completion_tokens`, và khoản này đã gồm cả token suy nghĩ), dùng
// `reasoning_effort`. Gom về một chỗ để mọi nơi gọi cùng một kiểu tham số.
// ============================================================

export const SOL_MODEL = "gpt-6.1-sol";
export const TERRA_MODEL = "gpt-6.1-terra";

// Mặc định Terra (rẻ hơn ~50%, nhanh hơn); Sol để chọn khi hồ sơ khó, nhiều bảng số.
export const DEFAULT_AI_MODEL = TERRA_MODEL;

// Danh sách cho ô chọn model ở các module dùng file này.
export const AI_MODEL_OPTIONS = [
  { id: TERRA_MODEL, label: "GPT-6.1 Terra (mặc định, nhanh & rẻ hơn)" },
  { id: SOL_MODEL, label: "GPT-6.1 Sol (chính xác nhất, đọc được ảnh, PDF, bảng)" },
] as const;

// Chuyển MỘT LẦN mọi lựa chọn Sol đã lưu sang Terra khi Terra thành mặc định. Chạy lúc
// nạp module (trước effect của mọi component đọc localStorage); có cờ nên ai chọn lại
// Sol sau đó thì giữ nguyên. Chỉ gồm các khoá của module dùng file này — Biên bản họp,
// Kế toán, Đối tác có danh sách model riêng, mặc định vẫn là Sol.
const SOL_TO_TERRA_FLAG = "ai_model_sol_to_terra_done";
const SHARED_MODEL_KEYS = ["openai_model_hanh_chinh", "openai_model_nhan_su", "openai_model_van_thu", "openai_model"];
if (typeof window !== "undefined") {
  try {
    if (!localStorage.getItem(SOL_TO_TERRA_FLAG)) {
      for (const k of SHARED_MODEL_KEYS) {
        if (localStorage.getItem(k) === SOL_MODEL) localStorage.setItem(k, TERRA_MODEL);
      }
      localStorage.setItem(SOL_TO_TERRA_FLAG, "1");
    }
  } catch {
    /* trình duyệt chặn lưu trữ: bỏ qua, các trang tự về mặc định */
  }
}

// Route chạy trên Vercel gói Free bị cắt ở 60 giây -> để "low" cho nhanh. Việc bóc
// dữ liệu từ hồ sơ không cần suy luận sâu, prompt đã nêu sẵn quy tắc.
const SERVER_EFFORT = "low";

export const isReasoningModel = (m: string) => /^gpt-[5-9]/i.test(m) || /^o\d/i.test(m);

/**
 * Chọn model cho một lượt gọi. Giá trị cũ còn nằm trong localStorage của người dùng
 * (gpt-4o, gpt-4o-mini…) hoặc trong biến môi trường OPENAI_MODEL đều được đưa về mặc định.
 */
export function resolveModel(requested?: string | null): string {
  const m = (requested || "").trim();
  return isReasoningModel(m) ? m : DEFAULT_AI_MODEL;
}

/** Tham số cho chat.completions.create. `maxTokens` là trần số token đầu ra (nếu cần). */
export function chatParams(model: string, maxTokens?: number): Record<string, unknown> {
  if (isReasoningModel(model)) {
    const p: Record<string, unknown> = { reasoning_effort: SERVER_EFFORT };
    // Token suy nghĩ tính chung vào trần -> nới rộng để JSON dài không bị cắt cụt.
    if (maxTokens) p.max_completion_tokens = maxTokens * 2;
    return p;
  }
  const p: Record<string, unknown> = { temperature: 0 };
  if (maxTokens) p.max_tokens = maxTokens;
  return p;
}

/** Tham số cho responses.create (đọc PDF dạng tệp). */
export function responsesParams(model: string): Record<string, unknown> {
  return isReasoningModel(model) ? { reasoning: { effort: SERVER_EFFORT } } : {};
}
