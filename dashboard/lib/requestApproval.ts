import { supabase } from "./supabase";

/**
 * Bước DUYỆT CUỐI của đơn nghỉ phép / đi công tác — phần GHI CSDL, dùng chung cho
 * trang Cài đặt > Duyệt yêu cầu và nút duyệt nhanh ở trang Lịch công việc.
 *
 * Tách ra đây vì từ 16/09/2026 luồng có thể chỉ còn 1 cấp (không ai giữ cờ duyệt
 * cuối — xem fetchCap2ApproverEmails trong lib/approvers.ts), nghĩa là chính nút
 * "Phê duyệt" của cấp 1 ở CẢ HAI trang đều phải ghi được trạng thái cuối. Để mỗi
 * trang tự chép một bản là kiểu lỗi đã xảy ra nhiều lần trong dự án này: hai nơi
 * cùng một việc rồi trôi lệch nhau.
 *
 * Chỉ ghi CSDL. Gửi email và thông báo trên màn hình vẫn do từng trang tự làm
 * (mỗi trang có hộp thông báo và cấu hình SMTP riêng).
 */

export type LeaveTripTask = {
  id: string;
  title?: string | null;
  assignee?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  notes?: string | null;
};

/**
 * Bóc điểm đến / nhiệm vụ / chi phí từ phần ghi chú của đơn công tác để tạo dòng
 * trong bảng business_trips. Giữ NGUYÊN các biểu thức đang chạy — nội dung notes
 * do form công tác sinh ra, đổi cách bóc ở đây là lệch với form.
 */
function parseTripFromNotes(task: LeaveTripTask) {
  let dest = "Chưa xác định";
  let mission = "Đi công tác";
  let cost = 0;

  if (task.notes) {
    const destMatch = task.notes.match(/-\s+\*\*Điểm công tác chính\*\*:\s*(.*)/i);
    if (destMatch) dest = destMatch[1].trim();

    const missionMatch = task.notes.match(/-\s+\*\*Nhiệm vụ cụ thể\*\*:\s*(.*)/i);
    if (missionMatch) mission = missionMatch[1].trim();

    const metaMatch = task.notes.match(/<!--METADATA:(.*?)-->/);
    if (metaMatch) {
      try {
        const meta = JSON.parse(metaMatch[1]);
        if (meta && typeof meta.totalAmount !== "undefined") cost = Number(meta.totalAmount);
      } catch (e) {
        console.error("Error parsing task metadata:", e);
      }
    }

    if (!cost) {
      const totalMatch = task.notes.match(/\*\*TỔNG ĐỀ NGHỊ THANH TOÁN\*\*:\s*([0-9.,\s]+)/i);
      if (totalMatch) cost = Number(totalMatch[1].replace(/[.,\s]/g, ""));
    }
  }

  // Đơn cũ không ghi tiền: ước lượng theo số ngày (120k/ngày + 350k/đêm) để bảng
  // chi phí công tác không có dòng 0 đồng.
  if (!cost) {
    const days = task.start_date && task.due_date
      ? Math.max(1, Math.round((new Date(task.due_date).getTime() - new Date(task.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1)
      : 1;
    const nights = days >= 2 ? days - 1 : 0;
    cost = days * 120000 + nights * 350000;
  }

  return { dest, mission, cost };
}

/**
 * Duyệt CUỐI một đơn: tạo dòng chi phí công tác (nếu là đơn công tác) rồi chuyển
 * `tasks.status` sang trạng thái đã duyệt.
 *
 * Ném lỗi khi không ghi được — kể cả trường hợp RLS chặn: Postgres KHÔNG báo lỗi
 * mà chỉ sửa 0 dòng, nên phải `.select("id")` rồi đếm. Bỏ qua bước đếm này là tái
 * hiện đúng sự cố 16/09/2026 của phiếu trình ký: giao diện báo thành công, email
 * bay đi, còn trạng thái thì đứng im.
 */
export async function finalizeLeaveTripApproval(params: {
  task: LeaveTripTask;
  isTrip: boolean;
  deciderName: string;
}): Promise<void> {
  const { task, isTrip, deciderName } = params;

  if (isTrip) {
    const { dest, mission, cost } = parseTripFromNotes(task);
    const { error: insertError } = await supabase.from("business_trips").insert([{
      name: task.assignee || "Nhân viên",
      dest,
      from_date: task.start_date || new Date().toISOString().split("T")[0],
      to_date: task.due_date || new Date().toISOString().split("T")[0],
      purpose: mission,
      cost,
      status: "Đã duyệt",
      task_id: task.id,
    }]);
    // Không chặn việc duyệt đơn: dòng chi phí thiếu thì bổ sung tay ở trang C&B,
    // còn đơn của nhân sự thì phải được duyệt xong.
    if (insertError) console.error("Error inserting business trip:", insertError.message);
  }

  const { data, error } = await supabase
    .from("tasks")
    .update({
      status: isTrip ? "in_progress" : "completed",
      progress: isTrip ? 50 : 100,
      approval_stage: "approved",
      final_decision_by: deciderName,
      final_decision_at: new Date().toISOString(),
    })
    .eq("id", task.id)
    .select("id");

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Không ghi được quyết định duyệt — tài khoản của bạn không có quyền cập nhật đơn này.");
  }
}
