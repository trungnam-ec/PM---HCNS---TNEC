// ============================================================
// taskActivity — ghi dấu "hôm nay người này có thao tác trong công việc" để
// tính điểm ở bảng Đo lường sử dụng (migration 131).
//
// Mỗi (người, loại, ngày) chỉ ghi 1 lần — khử trùng bằng localStorage. Điểm tính
// theo SỐ NGÀY nên ghi thêm cũng vô ích, ghi ít thì đỡ tải DB.
// Mọi lỗi đều im lặng: không bao giờ được chặn người dùng làm việc.
// ============================================================

import { supabase } from "./supabase";

export type TaskActivityKind = "comment" | "upload" | "update";

export function logTaskActivity(kind: TaskActivityKind): void {
  (async () => {
    try {
      if (typeof window === "undefined") return;
      const { data } = await supabase.auth.getSession();
      const email = (data?.session?.user?.email || "").toLowerCase().trim();
      if (!email) return;

      // Ngày theo giờ Việt Nam (en-CA cho dạng YYYY-MM-DD).
      const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
      const key = `hcns_taskact:${email}:${kind}`;
      if (window.localStorage.getItem(key) === day) return;
      window.localStorage.setItem(key, day);

      await supabase.from("task_activity_events").insert({ email, kind });
    } catch {
      /* im lặng */
    }
  })();
}
