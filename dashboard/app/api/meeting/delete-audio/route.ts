import { requireApiAuth, supabaseForCaller } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import { MEETINGS_BUCKET } from "@/lib/meetingModels";

// ============================================================
// DỌN FILE GHI ÂM CỦA MỘT CUỘC HỌP
//
// Họp 2 tiếng để lại 6 file webm (~30MB). Giữ mãi thì dung lượng Storage phình
// ra trong khi thứ thực sự cần lưu là bản gỡ băng và biên bản Word.
//
// HAI CHỐT CHẶN ĐẶT Ở SERVER, không bỏ qua được từ giao diện:
//   1. Biên bản phải ở trạng thái `confirmed` — bản nháp chưa chốt thì người
//      kiểm tra còn phải nghe lại để soát.
//   2. `transcript_raw` phải còn nội dung — để không bao giờ xảy ra trường hợp
//      mất CẢ file ghi âm LẪN bản gỡ băng, tức mất trắng cuộc họp.
//
// `audio_paths` được GIỮ NGUYÊN sau khi xoá, làm dấu vết đã xoá những gì.
// ============================================================

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const { meetingId } = await req.json();
    if (!meetingId) {
      return NextResponse.json({ error: "Thiếu meetingId." }, { status: 400 });
    }

    const dbClient = supabaseForCaller(auth.caller);

    const { data: meeting, error: readError } = await dbClient
      .from("meetings")
      .select("id, title, status, transcript_raw, audio_paths, audio_url, audio_deleted_at")
      .eq("id", meetingId)
      .single();

    if (readError || !meeting) {
      return NextResponse.json(
        { error: `Không tìm thấy biên bản: ${readError?.message || "Rỗng"}` },
        { status: 404 }
      );
    }

    // ── Chốt chặn 1 ──
    if (meeting.status !== "confirmed") {
      return NextResponse.json({
        error: "Chỉ xoá được file ghi âm của biên bản ĐÃ XÁC NHẬN. Biên bản này còn là bản nháp — hãy soát và khoá biên bản trước."
      }, { status: 400 });
    }

    // ── Chốt chặn 2 ──
    if (!meeting.transcript_raw || !meeting.transcript_raw.trim()) {
      return NextResponse.json({
        error: "Biên bản này chưa có bản gỡ băng. Xoá file ghi âm bây giờ là mất trắng nội dung cuộc họp — hệ thống không cho phép."
      }, { status: 400 });
    }

    const paths: string[] = Array.isArray(meeting.audio_paths) ? meeting.audio_paths.filter(Boolean) : [];

    if (paths.length === 0) {
      return NextResponse.json({
        success: true,
        deleted_count: 0,
        message: meeting.audio_deleted_at
          ? "File ghi âm của biên bản này đã được dọn trước đó."
          : "Biên bản này không có file ghi âm nào được lưu lại."
      });
    }

    const { error: removeError } = await dbClient.storage.from(MEETINGS_BUCKET).remove(paths);
    if (removeError) {
      throw new Error(`Lỗi xoá file khỏi Storage: ${removeError.message}`);
    }

    const { data: updatedRows, error: updateError } = await dbClient
      .from("meetings")
      .update({
        audio_url: "",
        audio_deleted_at: new Date().toISOString(),
        audio_deleted_by: auth.caller.email,
      })
      .eq("id", meetingId)
      .select("id");

    if (updateError) {
      throw new Error(`Lỗi cập nhật CSDL: ${updateError.message}`);
    }
    // RLS chặn UPDATE trả 0 dòng mà không báo lỗi: file đã xoá thật rồi mà CSDL
    // vẫn ghi là còn — phải báo cho người dùng biết tình trạng lệch này.
    if (!updatedRows || updatedRows.length === 0) {
      throw new Error("Đã xoá file trên Storage nhưng KHÔNG cập nhật được trạng thái vào biên bản (bị chặn bởi quyền truy cập CSDL). Vui lòng báo Quản trị viên.");
    }

    return NextResponse.json({
      success: true,
      deleted_count: paths.length,
      message: `Đã xoá ${paths.length} file ghi âm của biên bản "${meeting.title}". Bản gỡ băng và biên bản Word vẫn được giữ nguyên.`,
    });
  } catch (err: any) {
    console.error("Delete meeting audio error:", err);
    return NextResponse.json({ error: err.message || "Lỗi khi dọn file ghi âm" }, { status: 500 });
  }
}
