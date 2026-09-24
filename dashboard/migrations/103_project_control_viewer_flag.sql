-- ============================================================
-- 103 — QUẢN TRỊ DỰ ÁN: CỜ "XEM TOÀN BỘ (CHỈ XEM)" + QUYỀN HIỆN MENU
--
-- Chốt với user 25/09/2026 (hướng 1):
--   • Nhân sự BĐH: chỉ thấy dự án BĐH của mình (không thấy tiền) — đã có từ 096.
--   • Nhân sự văn phòng: chỉ thấy dự án mình được gán trong tab Thành viên — đã có.
--   • Ban lãnh đạo thấy hết — đã có.
--   • MỚI: cờ can_view_all_projects_readonly cho HCNS / QLDA khi được cho phép:
--     XEM mọi dự án, KHÔNG thấy tiền, KHÔNG sửa gì (không nằm trong hàm quyền ghi /
--     quyền tài chính nào).
--   • MỚI: RPC pc_nav_access() cho Sidebar ẩn menu với người không có quyền:
--       has_projects  -> hiện "Thông tin quản trị dự án"
--       can_dashboard -> hiện "Dashboard dự án" (BLĐ, TC-KT, cờ xem toàn bộ, GĐDA)
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- ============================================================

alter table public.approval_permissions
  add column if not exists can_view_all_projects_readonly boolean not null default false;

create or replace function public.pc_is_viewer_all()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.approval_permissions p
    where p.can_view_all_projects_readonly = true and public.pc_email_in(p.email)
  );
$$;

-- XEM dự án: thêm người có cờ xem toàn bộ (các nhánh cũ giữ nguyên như 096).
create or replace function public.pc_can_view_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.pc_is_leadership()
      or public.pc_is_finance_staff()
      or public.pc_is_viewer_all()
      or exists (select 1 from public.pc_project_members m
                 where m.project_id = p_project and lower(trim(m.email)) = public.caller_email())
      or exists (select 1 from public.pc_projects p
                 where p.id = p_project and p.bdh_name = public.pc_caller_department());
$$;

-- Menu: người đăng nhập có thấy dự án nào / có dùng dashboard không.
create or replace function public.pc_nav_access()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'has_projects',
      public.pc_is_leadership() or public.pc_is_finance_staff() or public.pc_is_viewer_all()
      or exists (select 1 from public.pc_project_members m where lower(trim(m.email)) = public.caller_email())
      or exists (select 1 from public.pc_projects p where p.bdh_name = public.pc_caller_department()),
    'can_dashboard',
      public.pc_is_leadership() or public.pc_is_finance_staff() or public.pc_is_viewer_all()
      or exists (select 1 from public.pc_project_members m
                  where m.role = 'GDDA' and lower(trim(m.email)) = public.caller_email())
  );
$$;

do $$
declare f text;
begin
  foreach f in array array['pc_is_viewer_all()','pc_can_view_project(uuid)','pc_nav_access()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- KIỂM TRA: cột cờ mới
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'approval_permissions'
  and column_name = 'can_view_all_projects_readonly';
