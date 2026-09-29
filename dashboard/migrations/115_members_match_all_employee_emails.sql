-- ============================================================
-- 115 — THÀNH VIÊN DỰ ÁN NHẬN MỌI EMAIL TRONG HỒ SƠ NHÂN VIÊN
--
-- Sự cố 29/09/2026: hồ sơ nhân viên ghi 2 email ("tnec.mkt@trungnamgroup.com.vn,
-- phamthanhloc92vn@gmail.com"), dòng pc_project_members chỉ lưu email ĐẦU; người đó
-- đăng nhập bằng gmail -> mọi hàm quyền so m.email = caller_email() không khớp ->
-- không thấy menu Quản trị dự án dù đã có tên trong tab Thành viên.
--
-- Sửa gốc: pc_caller_emails() = email đăng nhập + MỌI email trong hồ sơ nhân viên
-- có chứa đúng email đăng nhập đó (khớp TUYỆT ĐỐI qua pc_email_in — không so chuỗi
-- con, xem sự cố email LIKE 08/09). 6 hàm dùng m.email dựng lại NGUYÊN VĂN bản mới
-- nhất, chỉ đổi  m.email = caller_email()  ->  m.email = any(pc_caller_emails()).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- ============================================================

create or replace function public.pc_caller_emails()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct x), array[]::text[])
  from (
    select public.caller_email() as x
    union
    select unnest(array_remove(regexp_split_to_array(lower(coalesce(e.email, '')), '[\s,;]+'), ''))
    from public.employees e
    where public.pc_email_in(e.email)
  ) s
  where x is not null and x <> '';
$$;

-- pc_has_role: nguyên văn bản 112, chỉ đổi 1 chỗ so email
create or replace function public.pc_has_role(p_project uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pc_project_members m
    where m.project_id = p_project
      and m.role = any (p_roles)
      and lower(trim(m.email)) = any (public.pc_caller_emails())
  )
  or ('GDDA' = any (p_roles) and public.pc_is_bdh_manager(p_project));
$$;

-- pc_can_view_project: nguyên văn bản 103, chỉ đổi 1 chỗ so email
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
                 where m.project_id = p_project and lower(trim(m.email)) = any (public.pc_caller_emails()))
      or exists (select 1 from public.pc_projects p
                 where p.id = p_project and p.bdh_name = public.pc_caller_department());
$$;

-- pc_nav_access: nguyên văn bản 112, chỉ đổi 2 chỗ so email
create or replace function public.pc_nav_access()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'has_projects',
      public.pc_is_leadership() or public.pc_is_finance_staff() or public.pc_is_viewer_all()
      or exists (select 1 from public.pc_project_members m where lower(trim(m.email)) = any (public.pc_caller_emails()))
      or exists (select 1 from public.pc_projects p where p.bdh_name = public.pc_caller_department()),
    'can_dashboard',
      public.pc_is_leadership() or public.pc_is_finance_staff() or public.pc_is_viewer_all()
      or public.pc_is_bdh_manager_any()
      or exists (select 1 from public.pc_project_members m
                  where m.role = 'GDDA' and lower(trim(m.email)) = any (public.pc_caller_emails()))
  );
$$;

-- pc_my_access: nguyên văn bản 112, chỉ đổi 1 chỗ so email
create or replace function public.pc_my_access(p_project uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'can_view',                  public.pc_can_view_project(p_project),
    'can_edit_structure',        public.pc_can_edit_structure(p_project),
    'can_edit_site',             public.pc_can_edit_site(p_project),
    'can_log',                   public.pc_can_log(p_project),
    'can_approve_log',           public.pc_can_approve_log(p_project),
    'can_view_finance',          public.pc_can_view_finance(p_project),
    'can_edit_finance',          public.pc_can_edit_finance(p_project),
    'can_manage_members',        public.pc_can_manage_members(p_project),
    'can_edit_material',         public.pc_can_edit_material(p_project),
    'can_view_material_price',   public.pc_can_view_material_price(p_project),
    'can_edit_material_price',   public.pc_can_edit_material_price(p_project),
    'can_manage_material_catalog', public.pc_can_manage_material_catalog(),
    'is_leadership',             public.pc_is_leadership(),
    'roles', coalesce((
      select jsonb_agg(m.role) from public.pc_project_members m
      where m.project_id = p_project and lower(trim(m.email)) = any (public.pc_caller_emails())
    ), '[]'::jsonb)
    || case when public.pc_is_bdh_manager(p_project) then '["BDH_MANAGER"]'::jsonb else '[]'::jsonb end
  );
$$;

-- pc_can_pick_partner: nguyên văn bản 113, chỉ đổi 1 chỗ so email
create or replace function public.pc_can_pick_partner()
returns boolean language sql stable security definer set search_path = public as $$
  select public.pc_is_leadership()
      or public.pc_is_finance_staff()
      or public.pc_is_bdh_manager_any()
      or exists (select 1 from public.pc_project_members m
                 where m.role in ('GDDA','TC_KT','EDIT') and lower(trim(m.email)) = any (public.pc_caller_emails()));
$$;

-- pc_can_manage_material_catalog: nguyên văn bản 113, chỉ đổi 1 chỗ so email
create or replace function public.pc_can_manage_material_catalog()
returns boolean language sql stable security definer set search_path = public as $$
  select public.pc_is_leadership() or public.pc_is_finance_staff()
      or public.pc_is_bdh_manager_any()
      or exists (select 1 from public.pc_project_members m
                  where m.role = 'GDDA' and lower(trim(m.email)) = any (public.pc_caller_emails()));
$$;

do $$
declare f text;
begin
  foreach f in array array['pc_caller_emails()','pc_has_role(uuid, text[])','pc_can_view_project(uuid)','pc_nav_access()','pc_my_access(uuid)','pc_can_pick_partner()','pc_can_manage_material_catalog()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- KIỂM TRA (chạy khi đang đăng nhập web thì mới có caller_email; trong SQL Editor
-- câu dưới chỉ để chắc hàm tồn tại):
select proname from pg_proc where proname in ('pc_caller_emails','pc_has_role','pc_can_view_project','pc_nav_access','pc_my_access','pc_can_pick_partner','pc_can_manage_material_catalog') order by proname;
