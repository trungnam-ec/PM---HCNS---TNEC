-- ============================================================
-- 080 — BẬT REALTIME CHO signing_submissions
--
-- LÝ DO (phát hiện 15/09/2026): chuông trên Header lắng nghe realtime cho
-- tasks / attendance_justifications / resource_bookings / benefit_claims /
-- task_comments / calendar_notes — nhưng KHÔNG có signing_submissions. Hệ quả:
-- phiếu trình ký nhích bước nào (kể cả BỊ TRẢ LẠI) thì chuông chỉ hiện sau khi
-- người dùng tự F5. Người bị trả phiếu ngồi nhìn chuông im re.
--
-- Đăng ký ở client (Header.tsx) là chưa đủ: Supabase chỉ phát sự kiện cho bảng
-- nằm trong publication `supabase_realtime`. Thiếu dòng này thì kênh vẫn kết
-- nối bình thường nhưng KHÔNG BAO GIỜ có sự kiện nào — hỏng trong im lặng.
--
-- Lộ dữ liệu? KHÔNG: realtime vẫn đi qua RLS của bảng (policy `signing_select`
-- của 074), nên mỗi người chỉ nhận được sự kiện của phiếu họ vốn đã xem được.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ -> Run.
-- An toàn chạy lại nhiều lần.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'signing_submissions'
  ) then
    alter publication supabase_realtime add table public.signing_submissions;
  end if;
end $$;

-- ─── KIỂM TRA: phải thấy signing_submissions trong danh sách ───
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;
