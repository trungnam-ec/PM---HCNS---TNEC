-- ============================================================
-- 087 — CỜ "XEM TOÀN BỘ ĐƠN NHÂN SỰ" MỞ LỊCH SỬ NGHỈ PHÉP Ở TẦNG CSDL
--
-- TRIỆU CHỨNG (user báo 18/09/2026): đã cấp cờ can_view_all_requests (085) và
-- mở module C&B (086), nhưng tab "Lịch sử nghỉ phép" vẫn chỉ hiện đơn của chính
-- mình, và nút xoá ở cột Thao tác không ăn.
--
-- NGUYÊN NHÂN — LẦN THỨ TƯ CỦA CÙNG MỘT BẪY:
-- Lịch sử nghỉ phép đọc thẳng bảng `tasks` (đơn phép là một dòng task). RLS của
-- `tasks` (migration 045) quyết định thấy đơn nghỉ phép/công tác của người khác
-- hay không bằng hàm `caller_can_approve_requests()` — hàm này CHỈ nhìn hai cờ
-- can_approve_leave / can_approve_trip.
-- Mà đó chính là hai cờ kiêm CÔNG TẮC bật cấp 2: bỏ tick để rút luồng xuống 1
-- cấp là người HCNS mất luôn tầm nhìn NGAY Ở CSDL. Sửa giao diện bao nhiêu cũng
-- vô ích vì truy vấn trả về đúng vài dòng của chính họ.
--
-- CÁCH VÁ — 2 việc, KHÔNG nới rộng hơn mức cần:
--   1. caller_can_approve_requests() nhận thêm can_view_all_requests -> ĐỌC
--      được đơn nghỉ phép / công tác toàn công ty.
--   2. Policy DELETE của `tasks` thêm MỘT nhánh hẹp: người giữ cờ đó xoá được
--      ĐƠN NGHỈ PHÉP / CÔNG TÁC. CỐ Ý không nới caller_can_manage_tasks() —
--      hàm ấy là nhánh ĐẦU TIÊN của cả policy SELECT lẫn DELETE, nới nó là mở
--      toàn bộ thẻ Kanban của công ty, vượt xa "lịch sử nghỉ phép".
--
-- ⚠ Tên hàm caller_can_approve_requests() nay không còn tả đúng việc nó làm:
-- trong task_visible_to() nó chỉ đóng vai "ai được NHÌN đơn của người khác",
-- không phải "ai được DUYỆT". Giữ nguyên tên để khỏi phải sửa 045; đọc kỹ chú
-- thích này trước khi dùng nó cho mục đích khác.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ -> Run.
-- An toàn chạy lại nhiều lần. YÊU CẦU: đã chạy 010, 029, 045, 085.
-- ============================================================

-- ─── 1. ĐỌC: mở tầm nhìn đơn nghỉ phép / công tác ───
create or replace function public.caller_can_approve_requests()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.approval_permissions p
    where coalesce(auth.jwt() ->> 'email', '') <> ''
      and position(lower(auth.jwt() ->> 'email') in lower(coalesce(p.email, ''))) > 0
      and (
           coalesce(p.can_approve_leave, false)
        or coalesce(p.can_approve_trip, false)
        -- 085: chỉ XEM, nhưng phải xem được toàn công ty.
        or coalesce(p.can_view_all_requests, false)
      )
  );
$fn$;

comment on function public.caller_can_approve_requests() is
  'Nguoi goi co duoc NHIN don nghi phep/cong tac cua NGUOI KHAC khong (input p_can_approve cua task_visible_to). KHONG phai quyen duyet — xem migration 087.';

-- ─── 2. XOÁ: nhánh hẹp cho đúng đơn nghỉ phép / công tác ───
-- Người giữ cờ xem toàn bộ đơn nhân sự được dọn lịch sử nghỉ phép (nút thùng rác
-- ở cột Thao tác), nhưng KHÔNG đụng được thẻ Kanban công việc thường.
create or replace function public.caller_can_view_all_requests()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.approval_permissions p
    where coalesce(auth.jwt() ->> 'email', '') <> ''
      and position(lower(auth.jwt() ->> 'email') in lower(coalesce(p.email, ''))) > 0
      and coalesce(p.can_view_all_requests, false)
  );
$fn$;

drop policy if exists "tasks delete by manager or owner" on public.tasks;

create policy "tasks delete by manager or owner"
  on public.tasks
  for delete
  to authenticated
  using (
    public.caller_can_manage_tasks()
    or public.caller_owns_task(assignee)
    -- 087 — chỉ ĐƠN nghỉ phép / công tác, không phải task Kanban thường.
    or (
      (select public.caller_can_view_all_requests())
      and (
           lower(coalesce(title,'')) like 'nghỉ phép%'
        or lower(coalesce(title,'')) like '%nghi phep%'
        or lower(coalesce(title,'')) like 'công tác%'
        or lower(coalesce(title,'')) like '%cong tac%'
      )
    )
  );

-- ─── 3. KIỂM TRA ───
-- 3a. Chạy trong SQL Editor (KHÔNG có JWT) -> PHẢI ra false cả hai.
select public.caller_can_approve_requests()  as phai_false_1,
       public.caller_can_view_all_requests() as phai_false_2;

-- 3b. Policy DELETE đã có nhánh mới (điều kiện phải chứa can_view_all_requests).
select policyname, cmd, coalesce(qual, '—') as dieu_kien_using
from pg_policies
where schemaname = 'public' and tablename = 'tasks' and cmd = 'DELETE';

-- 3c. Ai đang mở được tầm nhìn đơn toàn công ty.
select email, can_approve_leave, can_approve_trip, can_view_all_requests
from public.approval_permissions
where can_approve_leave or can_approve_trip or can_view_all_requests
order by email;
