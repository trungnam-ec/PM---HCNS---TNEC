import { requireApiAuth, supabaseForCaller } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import { normalizePlan, isFeatureAllowed } from "@/lib/planShared";

// ============================================================
// LƯU BẢN GỠ BĂNG CỦA MỘT ĐOẠN
//
// Việc gọi OpenAI đã chuyển sang trình duyệt (xem lib/meetingOpenAI.ts) vì gói
// Vercel Free cắt hàm ở 60 giây, không đủ cho một đoạn ghi âm nào. Route này chỉ
// còn phần nhanh: kiểm quyền, gác gói dịch vụ, soi dấu hiệu lặp vòng và NỐI
// THÊM vào bản gỡ băng — tất cả tính bằng mili giây nên không bao giờ đụng trần.
//
// Vẫn phải là máy chủ ghi chứ không để client tự ghi thẳng: đây là chỗ duy nhất
// bảo đảm nối thêm chứ không ghi đè, và là chỗ gác gói dịch vụ.
// ============================================================

type DiarizedSegment = { speaker: string; start: number; end: number; text: string };

/**
 * Nhận diện lỗi lặp vòng của model gỡ băng: cùng một câu trả về hàng chục lần,
 * dấu hiệu model không nghe được nội dung thật (thu âm quá nén, im lặng dài).
 *
 * QUAN TRỌNG: hàm này CHỈ để cảnh báo. Không bao giờ dùng kết quả của nó để vứt
 * nội dung đi — mất 20 phút họp mà chỉ đổi lấy một dòng log là cái giá quá đắt
 * cho một phép đoán.
 */
function detectHallucination(text: string): { isHallucination: boolean; warning: string } {
  if (!text || text.length < 50) {
    return { isHallucination: true, warning: "Bản gỡ băng quá ngắn hoặc rỗng. File âm thanh có thể bị hỏng hoặc không có giọng nói." };
  }

  // Chỉ xét các câu đủ dài (>15 ký tự) để bỏ qua các câu đệm ngắn tự nhiên trong
  // hội thoại (VD: "Vâng ạ.", "Dạ đúng rồi.") — lặp lại nhiều là bình thường.
  const sentences = text.split(/[.!?。]+/).map(s => s.trim()).filter(s => s.length > 15);
  if (sentences.length < 15) return { isHallucination: false, warning: "" };

  const counts: Record<string, number> = {};
  for (const s of sentences) counts[s] = (counts[s] || 0) + 1;
  const unique = new Set(sentences);
  const uniqueRatio = unique.size / sentences.length;

  let mostRepeated = "";
  let maxCount = 0;
  for (const [sentence, count] of Object.entries(counts)) {
    if (count > maxCount) { maxCount = count; mostRepeated = sentence; }
  }

  // Chỉ báo khi vừa có tỉ lệ trùng lặp cao VỪA có 1 câu dài lặp rất nhiều lần —
  // kết hợp 2 điều kiện để giảm báo sai với họp dài, tự nhiên.
  if (uniqueRatio < 0.15 && maxCount >= 8) {
    return {
      isHallucination: true,
      warning: `Nghi ngờ AI gỡ băng bị lặp vòng: chỉ ${unique.size} câu độc nhất trong ${sentences.length} câu, câu "${mostRepeated.substring(0, 80)}..." lặp ${maxCount} lần. Nội dung VẪN được giữ lại — hãy đọc kiểm tra đoạn này ở màn Review.`,
    };
  }

  const phrases = ["tạm biệt", "hẹn gặp lại", "cảm ơn các bạn đã theo dõi", "đừng quên like",
    "đăng ký kênh", "subscribe", "video tiếp theo", "thank you for watching"];
  const lower = text.toLowerCase();
  for (const phrase of phrases) {
    const matches = lower.match(new RegExp(phrase, "gi"));
    if (matches && matches.length > 8) {
      return {
        isHallucination: true,
        warning: `Nghi ngờ AI gỡ băng bị lặp vòng: cụm "${phrase}" xuất hiện ${matches.length} lần. Nội dung VẪN được giữ lại — hãy đọc kiểm tra đoạn này ở màn Review.`,
      };
    }
  }

  return { isHallucination: false, warning: "" };
}

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { meetingId } = body;
    const text: string = String(body.text || "");
    const segments: DiarizedSegment[] = Array.isArray(body.segments) ? body.segments : [];
    /** true = xoá sạch bản gỡ băng cũ trước khi ghi (dùng cho "Gỡ record"). */
    const reset: boolean = body.reset === true;

    if (!meetingId) {
      return NextResponse.json({ error: "Thiếu meetingId." }, { status: 400 });
    }

    const dbClient = supabaseForCaller(auth.caller);

    // GATE GÓI DỊCH VỤ: module Biên bản họp mở từ gói Basic (lib/planShared.ts)
    const { data: planRow } = await dbClient
      .from("tenant_config").select("value").eq("key", "plan").maybeSingle();
    if (!isFeatureAllowed(normalizePlan(planRow?.value), "meeting_ai")) {
      return NextResponse.json({
        error: "Tính năng Biên bản họp AI chưa được mở cho gói dịch vụ hiện tại. Vui lòng liên hệ Quản trị viên để nâng cấp."
      }, { status: 403 });
    }

    const { data: current, error: readError } = await dbClient
      .from("meetings")
      .select("transcript_raw, transcript_segments")
      .eq("id", meetingId)
      .single();
    if (readError) {
      throw new Error(`Không đọc được biên bản để nối bản gỡ băng: ${readError.message}`);
    }

    // NỐI THÊM, KHÔNG ghi đè. Cuộc họp 2 tiếng gồm nhiều đoạn; ghi đè thì tiến
    // trình chết giữa chừng chỉ còn lại đoạn cuối và phải gỡ băng lại từ đầu.
    const prevText = reset ? "" : (current?.transcript_raw || "");
    const prevSegments: DiarizedSegment[] = reset || !Array.isArray(current?.transcript_segments)
      ? []
      : current.transcript_segments;

    const { data: updatedRows, error: dbError } = await dbClient
      .from("meetings")
      .update({
        transcript_raw: prevText ? `${prevText}\n\n${text}` : text,
        transcript_segments: [...prevSegments, ...segments],
      })
      .eq("id", meetingId)
      .select("id");

    if (dbError) throw new Error(`Lỗi cập nhật CSDL: ${dbError.message}`);
    // RLS chặn UPDATE thì Supabase trả 0 dòng mà KHÔNG báo lỗi — phải bắt tường
    // minh, nếu không client tưởng đã lưu trong khi bản gỡ băng rơi mất.
    if (!updatedRows || updatedRows.length === 0) {
      throw new Error("Không lưu được bản gỡ băng (bị chặn bởi quyền truy cập CSDL). Vui lòng đăng nhập lại và thử lần nữa.");
    }

    const check = detectHallucination(text);
    return NextResponse.json({
      success: true,
      is_hallucination: check.isHallucination,
      hallucination_warning: check.warning,
    });
  } catch (err: any) {
    console.error("Save transcript error:", err);
    return NextResponse.json({ error: err.message || "Lỗi lưu bản gỡ băng" }, { status: 500 });
  }
}
