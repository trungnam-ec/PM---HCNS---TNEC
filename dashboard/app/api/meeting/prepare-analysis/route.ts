import { requireApiAuth, supabaseForCaller } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import { normalizePlan, isFeatureAllowed } from "@/lib/planShared";
import { getTenantConfigServer } from "@/lib/tenantConfigServer";
import { DEFAULT_ANALYSIS_MODEL, ANALYSIS_REASONING_EFFORT } from "@/lib/meetingModels";
import {
  buildSystemPrompt,
  buildTimedTranscript,
  resolveTimelineMode,
  type DiarizedSegment,
} from "@/lib/meetingAnalysisServer";

// ============================================================
// SOẠN PROMPT DỰNG BIÊN BẢN — máy chủ ra đề, trình duyệt đi thi.
//
// Cuộc gọi OpenAI chạy ở trình duyệt (gói Vercel Free cắt hàm ở 60 giây, mà
// dựng biên bản một cuộc họp 2 tiếng mất vài phút). Nhưng LUẬT CHỐNG BỊA phải
// do máy chủ soạn: danh sách tên đóng, chế độ timeline suy từ dữ liệu thật
// trong CSDL, cấu hình công ty. Để client tự dựng prompt là mỗi máy một luật.
//
// Route này chỉ đọc CSDL và ghép chuỗi -> luôn xong trong mili giây.
// ============================================================

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { meetingId } = body;
    const roster: string[] = Array.isArray(body.roster) ? body.roster.filter(Boolean) : [];

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

    // Lấy bản gỡ băng TỪ CSDL (không tin body của client) để tự quyết chế độ
    // timeline — client không có quyền quyết định việc này.
    const { data: meeting, error: readError } = await dbClient
      .from("meetings")
      .select("transcript_raw, transcript_segments, speaker_map, recording_started_at")
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
    const speakerMap: Record<string, string> = (meeting.speaker_map && typeof meeting.speaker_map === "object")
      ? meeting.speaker_map
      : {};

    const timelineMode = resolveTimelineMode(segments, meeting.recording_started_at);
    const transcriptForAI = segments.length > 0
      ? buildTimedTranscript(segments, speakerMap, meeting.recording_started_at)
      : (meeting.transcript_raw || "");

    if (!transcriptForAI.trim()) {
      return NextResponse.json({ error: "Biên bản chưa có nội dung gỡ băng để phân tích." }, { status: 400 });
    }

    const tenantCfg = await getTenantConfigServer();
    const systemPrompt = buildSystemPrompt(
      tenantCfg.company_name,
      tenantCfg.chairman_name,
      timelineMode,
      roster,
    );

    return NextResponse.json({
      success: true,
      system_prompt: systemPrompt,
      user_content: `Hãy chắt lọc các ý chính trọng tâm từ bản gỡ băng sau và trả về JSON theo đúng định dạng:\n\n${transcriptForAI}`,
      timeline_mode: timelineMode,
      default_model: process.env.OPENAI_MODEL || DEFAULT_ANALYSIS_MODEL,
      reasoning_effort: ANALYSIS_REASONING_EFFORT,
    });
  } catch (err: any) {
    console.error("Prepare analysis error:", err);
    return NextResponse.json({ error: err.message || "Lỗi soạn nội dung phân tích" }, { status: 500 });
  }
}
