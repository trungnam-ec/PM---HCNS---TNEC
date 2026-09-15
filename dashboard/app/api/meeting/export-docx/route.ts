import { requireApiAuth, supabaseForCaller } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { meetingId } = body;

    if (!meetingId) {
      return NextResponse.json({ error: "Thiếu meetingId." }, { status: 400 });
    }

    // PHẢI chạy bằng token của chính người gọi, KHÔNG dùng client anon dùng chung:
    //   • RLS của 078 chỉ trả biên bản của người đó (anon trả 0 dòng -> lỗi khó hiểu
    //     "Cannot coerce...");
    //   • file Word tạo ra được Storage ghi nhận chủ sở hữu theo token này — upload
    //     bằng client anon là file vô chủ, chính người vừa xuất cũng không tải được.
    const dbClient = supabaseForCaller(auth.caller);

    // 1. Fetch meeting details from Supabase
    const { data: meeting, error: fetchError } = await dbClient
      .from("meetings")
      .select("*")
      .eq("id", meetingId)
      .single();

    if (fetchError || !meeting) {
      return NextResponse.json(
        { error: `Không tìm thấy thông tin cuộc họp: ${fetchError?.message || "Rỗng"}` },
        { status: 404 }
      );
    }

    // 2. Format dates & inputs
    const dateObj = meeting.meeting_date ? new Date(meeting.meeting_date) : new Date();
    const day = String(dateObj.getDate()).padStart(2, "0");
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const year = dateObj.getFullYear();
    
    const meeting_date_text = `${day} tháng ${month} năm ${year}`;
    const location_date = `TP.HCM, ngày ${day} tháng ${month} năm ${year}`;

    // Format list of attendees to a single string: Name (Role)
    const attendeesList = Array.isArray(meeting.attendees) ? meeting.attendees : [];
    const attendeesText = attendeesList.join(", ") || "………";

    // Prepare tasks list for Docxtemplater loop
    const rawTasks = Array.isArray(meeting.action_items) ? meeting.action_items : [];
    const tasksList = rawTasks.map((t: any, index: number) => ({
      stt: t.stt || (index + 1),
      content: t.content || "",
      assignee: t.assignee || "",
      coop: t.coop || "",
      deadline: t.deadline || "",
    }));

    // 3. Load template
    const templateFileName = "bien_ban_hop_template_1.docx";
    const templatePath = path.join(process.cwd(), "public", "templates", templateFileName);

    if (!fs.existsSync(templatePath)) {
      return NextResponse.json(
        { error: `Không tìm thấy file template Word tại: ${templateFileName}` },
        { status: 404 }
      );
    }

    const content = fs.readFileSync(templatePath, "binary");

    // 4. Initialize docxtemplater and zip
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // 5. Fill data
    // Auto-generate a document number if none is set
    const docNumber = meeting.project_name 
      ? `Số: ${day}${month}/${year}/BBH/${meeting.project_name.toUpperCase()}`
      : `Số: ${day}${month}/${year}/BBH/TNE&C`;

    doc.setData({
      doc_number: meeting.doc_number || docNumber,
      location_date: location_date,
      // KHÔNG điền giờ/địa điểm giả vào văn bản chính thức: thiếu thì để dấu
      // chấm lửng cho người ký điền tay (xem quy tắc chống bịa ở lib/meetingAnalysisServer.ts).
      start_time: meeting.start_time || "………",
      meeting_date_text: meeting_date_text,
      meeting_location: meeting.location || "………",
      meeting_title: meeting.title || "Cuộc họp giao ban",
      chair_name: meeting.chairperson || "………",
      chair_role: "Chủ trì",
      sec_name: meeting.secretary || "………",
      sec_role: "Thư ký",
      attendees_text: attendeesText,
      end_time: meeting.end_time || "………",
      distribution: meeting.distribution || "P. KHĐT, P. QLDA, P. VTTB; Lưu: HCNS.",
      tasks: tasksList,
      meeting_summary: meeting.summary || "Không có tóm tắt.",
    });

    // 6. Compile document
    doc.render();

    const generatedBuffer = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    });

    // 7. Upload generated document to Supabase Storage
    const storageFileName = `documents/bien_ban_hop_${meetingId}.docx`;
    const { error: uploadError } = await dbClient.storage
      .from("meetings")
      .upload(storageFileName, generatedBuffer, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage document upload error:", uploadError);
      throw new Error(`Lỗi upload file lên storage: ${uploadError.message}`);
    }

    // 8. Kho `meetings` là PRIVATE (078):
    //    - CSDL lưu ĐƯỜNG DẪN trong kho, không lưu URL (URL ký sẽ hết hạn);
    //    - trả về một link ký để trình duyệt tải ngay file vừa xuất.
    //    Cũng không cần ?v= chống cache nữa — private thì CDN không giữ bản cũ.
    const { data: signed, error: signError } = await dbClient.storage
      .from("meetings")
      .createSignedUrl(storageFileName, 60 * 60);
    if (signError || !signed?.signedUrl) {
      throw new Error(`Lỗi tạo link tải file Word: ${signError?.message || "không ký được"}`);
    }

    const { error: dbUpdateError } = await dbClient
      .from("meetings")
      .update({ document_url: storageFileName })
      .eq("id", meetingId);

    if (dbUpdateError) {
      console.error("DB update error:", dbUpdateError);
      throw new Error(`Lỗi cập nhật CSDL: ${dbUpdateError.message}`);
    }

    return NextResponse.json({
      success: true,
      documentUrl: signed.signedUrl,
      documentPath: storageFileName,
    });
  } catch (err: any) {
    console.error("Export docx error:", err);
    return NextResponse.json({ error: err.message || "Lỗi tạo file Word biên bản" }, { status: 500 });
  }
}
