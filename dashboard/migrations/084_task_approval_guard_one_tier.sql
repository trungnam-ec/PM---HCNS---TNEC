-- ============================================================
-- 084 — VÁ TRIGGER DUYỆT ĐƠN: LUỒNG 1 CẤP BỊ CHÍNH TRIGGER KHOÁ CHẾT
--
-- TRIỆU CHỨNG (user báo 18/09/2026): cấp 1 bấm Phê duyệt đơn nghỉ phép / đi
-- công tác -> hiện hộp đỏ "Bạn không có quyền duyệt cuối loại đơn này. Cần cờ
-- Duyệt nghỉ phép trong Cài đặt -> Cờ quyền người dùng." Đơn không duyệt được.
--
-- NGUYÊN NHÂN — HAI NƠI GIỮ LUẬT, ĐÃ TRÔI LỆCH NHAU:
-- Migration 008 đặt luật CỨNG: hễ đẩy đơn sang trạng thái duyệt cuối
-- (nghỉ phép -> 'completed', công tác -> 'in_progress') thì BẮT BUỘC phải giữ
-- cờ can_approve_leave / can_approve_trip.
--
-- Nhưng bản 16/09/2026 (commit 704c00a) thêm CÔNG TẮC 1 CẤP / 2 CẤP: bỏ tick cờ
-- duyệt cuối ở MỌI người = luồng rút còn 1 cấp, và khi đó chính CẤP 1 ghi thẳng
-- trạng thái cuối (fetchCap2ApproverEmails trả chuỗi rỗng -> handleCap1Confirm
-- gọi handleFinalDecision). Client đã đổi, trigger thì không.
--
-- Nghịch lý: điều kiện làm luồng thành 1 cấp (KHÔNG ai giữ cờ) lại chính là điều
-- kiện khiến trigger chặn. Bật công tắc 1 cấp = khoá chết luôn cả hai luồng.
--
-- CÁCH VÁ: chỉ đòi cờ KHI LUỒNG VẪN CÒN CẤP 2. Thêm hàm leave_trip_has_cap2()
-- hỏi đúng câu mà client hỏi (fetchCap2ApproverEmails): còn ai giữ cờ không.
--
-- ⚠ CÒN GIỮ NGUYÊN chốt chặn quan trọng nhất của 008: KHÔNG AI được tự duyệt
-- đơn đứng tên chính mình. Đó mới là lỗ hổng mà 008 sinh ra để bịt.
-- Luồng cấp 1 vẫn KHÔNG bị siết thêm trong CSDL — đúng như 008 đã cố ý chọn
-- ("logic đó phức tạp và đang nằm ở lib/approvers.ts"), vì người duyệt cấp 1 có
-- thể là tổ trưởng, TP/PP, HOẶC người được chỉ định đích danh trong biểu mẫu —
-- chép luật đó xuống SQL là tự tạo thêm một bản nữa để trôi lệch.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ -> Run.
-- An toàn chạy lại nhiều lần. YÊU CẦU: đã chạy 008.
-- ============================================================

-- ─── 1. LUỒNG NÀY CÒN CẤP 2 KHÔNG ───
-- Cùng một câu hỏi với fetchCap2ApproverEmails() bên lib/approvers.ts: có dòng
-- nào trong approval_permissions đang bật cờ duyệt cuối của loại đơn này không.
create or replace function public.leave_trip_has_cap2(p_is_trip boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.approval_permissions p
    where case when p_is_trip then p.can_approve_trip else p.can_approve_leave end = true
      and coalesce(btrim(p.email), '') <> ''
  );
$fn$;

-- ─── 2. TRIGGER (chép nguyên 008, chỉ đổi đúng nhánh đòi cờ) ───

create or replace function public.guard_task_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  title_lower text := lower(coalesce(old.title, ''));
  is_leave     boolean;
  is_trip      boolean;
  is_request   boolean;
  approval_changed boolean;
  becomes_approved boolean;
  me text;
  is_admin boolean;
begin
  -- Chỉ quan tâm đơn nghỉ phép / công tác. Task Kanban thường bỏ qua hoàn toàn.
  is_leave := title_lower like 'nghỉ phép%' or title_lower like '%nghi phep%';
  is_trip  := title_lower like 'công tác%'  or title_lower like '%cong tac%';
  is_request := is_leave or is_trip;
  if not is_request then
    return new;
  end if;

  -- Có đụng vào cột quyết định duyệt không?
  approval_changed :=
        new.approval_stage      is distinct from old.approval_stage
     or new.status              is distinct from old.status
     or new.manager_approved_by is distinct from old.manager_approved_by
     or new.manager_approved_at is distinct from old.manager_approved_at
     or new.final_decision_by   is distinct from old.final_decision_by
     or new.final_decision_at   is distinct from old.final_decision_at;

  if not approval_changed then
    return new;   -- sửa mô tả, ngày tháng... không phải việc của trigger này
  end if;

  is_admin := exists (
    select 1 from public.allowed_users au
    where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.role = 'Admin'
  );
  if is_admin then
    return new;
  end if;

  -- (1) KHÔNG ai được tự quyết đơn đứng tên chính mình
  me := public.caller_employee_name();
  if me is not null and lower(btrim(me)) = lower(btrim(coalesce(old.assignee, ''))) then
    raise exception
      'Không thể tự duyệt hoặc tự thay đổi trạng thái đơn của chính mình. Đơn phải do người có thẩm quyền duyệt.'
      using errcode = 'check_violation';
  end if;

  -- (2) Duyệt CUỐI phải có cờ duyệt tương ứng
  --     (nghỉ phép -> completed, công tác -> in_progress; xem settings/page.tsx)
  becomes_approved :=
        old.status is distinct from new.status
    and (
         (is_trip  and new.status = 'in_progress')
      or (is_leave and new.status = 'completed')
    );

  -- CHỈ đòi cờ khi luồng VẪN CÒN CẤP 2. Không ai giữ cờ = Admin đã cố ý rút
  -- luồng xuống 1 cấp, và khi đó chính cấp 1 là người duyệt cuối — đòi cờ ở đây
  -- là khoá chết luồng mà Admin vừa bật (sự cố 18/09/2026).
  if becomes_approved
     and public.leave_trip_has_cap2(is_trip)
     and not public.caller_can_approve(is_trip) then
    raise exception
      'Bạn không có quyền duyệt cuối loại đơn này. Cần cờ % trong Cài đặt -> Cờ quyền người dùng.',
      case when is_trip then 'Duyệt công tác' else 'Duyệt nghỉ phép' end
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_task_approval on public.tasks;
create trigger trg_guard_task_approval
  before update on public.tasks
  for each row
  execute function public.guard_task_approval();

-- ─── 3. KIỂM TRA ───
-- 3a. Luồng đang là 1 cấp hay 2 cấp. false = 1 cấp (cấp 1 duyệt cuối luôn).
select public.leave_trip_has_cap2(false) as nghi_phep_con_cap2,
       public.leave_trip_has_cap2(true)  as cong_tac_con_cap2;

-- 3b. Ai đang giữ cờ duyệt cuối (rỗng = đã rút về 1 cấp, đúng như mong muốn).
select email, can_approve_leave, can_approve_trip
from public.approval_permissions
where can_approve_leave or can_approve_trip
order by email;

-- 3c. Trigger còn bật.
select tgname as trigger_name,
       case tgenabled when 'O' then 'đang bật' else tgenabled::text end as trang_thai
from pg_trigger
where tgrelid = 'public.tasks'::regclass and not tgisinternal;
