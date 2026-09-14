import { requireApiAuth, supabaseForCaller } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import { normalizePlan, isFeatureAllowed } from "@/lib/planShared";
import {
  resolveTimelineMode,
  stripFileOffsetTimes,
  type DiarizedSegment,
} from "@/lib/meetingAnalysisServer";

// ============================================================
// KIỂM TRA VÀ LƯU BIÊN BẢN AI VỪA DỰNG.
//
// AI chạy ở trình duyệt (xem prepare-analysis), nhưng kết quả KHÔNG được ghi
// thẳng vào CSDL từ đó: chốt chặn chống bịa và luật "thiếu thì để trống" phải
// đứng ở máy chủ, nơi client không sửa được.
//
// Chế độ timeline tính LẠI từ dữ liệu trong CSDL chứ không nhận từ client —
// nếu không, chỉ cần khai man "clock" là qua được chốt chặn giờ giả.
// ============================================================

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { meetingId, model } = body;
    const ext = body.data;

    if (!meetingId || !ext || typeof ext !== "object") {
      return NextResponse.json({ error: "Thiếu meetingId hoặc dữ liệu biên bản." }, { status: 400 });
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

    const { data: meeting, error: readError } = await dbClient
      .from("meetings")
      .select("transcript_segments, recording_started_at")
      .eq("id", meetingId)
      .single();
    if (readError || !meeting) {
      return NextResponse.json(
        { error: `Không đọc được biên bản: ${readError?.message || "Không tìm thấy"}` },
        { status: 404 }
      );
    }

    const segments: DiarizedSegment[] = Array.isArray(meeting.transcript_segments)
      ? meeting.transcript_segments
      : [];
    const timelineMode = resolveTimelineMode(segments, meeting.recording_started_at);

    // Chốt chặn: xoá giờ họp mà AI quy nhầm từ mốc phút-của-file.
    stripFileOffsetTimes(ext, timelineMode);

    // Người dự do người dùng chọn trước khi chạy đáng tin hơn danh sách AI nghe
    // được, nên chỉ ghi đè khi AI thực sự trả về tên — AI trả mảng rỗng mà ghi
    // đè là xoá mất danh sách đã chọn.
    const aiAttendees = Array.isArray(ext.attendees) ? ext.attendees.filter(Boolean) : [];

    // KHÔNG điền giá trị mặc định cho các ô AI để trống — thà để người dùng tự
    // điền còn hơn đưa số liệu phỏng đoán vào văn bản chính thức. Riêng
    // title/meeting_date phải có vì là cột NOT NULL.
    const today = new Date().toISOString().split("T")[0];
    const { data: updatedRows, error: dbError } = await dbClient
      .from("meetings")
      .update({
        title: ext.title || "Biên bản họp (chưa đặt tên)",
        meeting_date: ext.meeting_date || today,
        start_time: ext.start_time || "",
        end_time: ext.end_time || "",
        location: ext.location || "",
        secretary: ext.secretary || "",
        ...(aiAttendees.length > 0 ? { attendees: aiAttendees } : {}),
        project_name: ext.project_name || "",
        package_name: ext.package_name || "",
        transcript_clean: ext.transcript_clean || "",
        summary: ext.summary || "",
        action_items: Array.isArray(ext.action_items) ? ext.action_items : [],
        ai_model: model || null,
      })
      .eq("id", meetingId)
      .select("id");

    if (dbError) throw new Error(`Lỗi cập nhật CSDL: ${dbError.message}`);
    // RLS chặn sẽ trả về 0 dòng mà không báo lỗi — phải bắt tường minh, nếu
    // không client tưởng thành công nhưng biên bản vẫn trống metadata.
    if (!updatedRows || updatedRows.length === 0) {
      throw new Error("Không lưu được kết quả phân tích vào biên bản (bị chặn bởi quyền truy cập CSDL). Vui lòng đăng nhập lại và thử lần nữa.");
    }

    return NextResponse.json({
      success: true,
      used_real_timeline: timelineMode === "clock",
      timeline_mode: timelineMode,
    });
  } catch (err: any) {
    console.error("Save analysis error:", err);
    return NextResponse.json({ error: err.message || "Lỗi lưu biên bản" }, { status: 500 });
  }
}
