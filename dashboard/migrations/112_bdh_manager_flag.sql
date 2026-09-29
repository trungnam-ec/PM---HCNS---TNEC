-- ============================================================
-- 112 — CỜ "GĐDA/CHỈ HUY TRƯỞNG" (CHỈ BĐH CỦA MÌNH) + KHOÁ TAB THÀNH VIÊN
--
-- Chốt với user 29/09/2026:
--   • Cờ mới approval_permissions.can_manage_bdh_project, tick ở Cài đặt > phân
--     quyền cho CHT / Chỉ huy phó (GĐDA và CHT luôn kiêm nhiệm).
--   • Người có cờ = GĐDA trên dự án có bdh_name TRÙNG phòng ban của họ
--     (pc_caller_department). Dự án BĐH khác: KHÔNG có gì.
--   • KHÁC HẲN Ban lãnh đạo: cờ này KHÔNG đi vào pc_is_leadership() — không thấy
--     cấp công ty, không lập dự án mới, không đổi thẳng trạng thái. Không suy từ
--     chức danh — chỉ từ cờ.
--   • Vai trò GDDA gán tay trong tab Thành viên vẫn giữ nguyên (không ai mất quyền).
--   • Tab Thành viên: chỉ người GÁN được thành viên mới ĐỌC được bảng
--     pc_project_members (BLĐ / Admin / GĐDA / người có cờ). Các hàm quyền là
--     security definer nên vẫn đọc được bảng.
--
-- Cách làm: sửa hàm chung pc_has_role — danh sách vai trò có 'GDDA' thì người có
-- cờ đúng BĐH tính là có. ~10 hàm quyền đi qua đây tự đúng theo. Sửa tay 4 chỗ
-- viết thẳng role = 'GDDA': pc_can_pick_partner, pc_can_manage_material_catalog,
-- pc_nav_access (Dashboard dự án), pc_check_gates (gate "đã gán GĐDA + CHT").
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- ============================================================

alter table public.approval_permissions
  add column if not exists can_manage_bdh_project boolean not null default false;

-- ─── 1. HÀM NHẬN DIỆN ───
-- Người đăng nhập có cờ VÀ phòng ban trùng BĐH của dự án.
create or replace function public.pc_is_bdh_manager(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from public.approval_permissions ap
           where ap.can_manage_bdh_project = true and public.pc_email_in(ap.email)
         )
     and exists (
           select 1 from public.pc_projects p
           where p.id = p_project and p.bdh_name = public.pc_caller_department()
         );
$$;

-- Có cờ và phòng ban là BĐH của ÍT NHẤT một dự án (danh mục dùng chung, menu).
create or replace function public.pc_is_bdh_manager_any()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from public.approval_permissions ap
           where ap.can_manage_bdh_project = true and public.pc_email_in(ap.email)
         )
     and exists (
           select 1 from public.pc_projects p where p.bdh_name = public.pc_caller_department()
         );
$$;

-- Dự án có ai (phòng ban = BĐH) mang cờ không — cho gate "đã gán GĐDA + CHT".
-- Khớp email TUYỆT ĐỐI giữa 2 ô nhiều email (bỏ phần rỗng do dấu phân cách thừa).
create or replace function public.pc_bdh_has_manager(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.pc_projects p
    join public.employees e on e.department = p.bdh_name
    join public.approval_permissions ap on ap.can_manage_bdh_project = true
    where p.id = p_project
      and array_remove(regexp_split_to_array(lower(coalesce(ap.email, '')), '[\s,;]+'), '')
       && array_remove(regexp_split_to_array(lower(coalesce(e.email, '')), '[\s,;]+'), '')
  );
$$;

-- ─── 2. HÀM CHUNG: cờ đúng BĐH tính như vai trò GDDA ───
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
      and lower(trim(m.email)) = public.caller_email()
  )
  or ('GDDA' = any (p_roles) and public.pc_is_bdh_manager(p_project));
$$;

-- ─── 3. BỐN CHỖ VIẾT THẲNG role = 'GDDA' ───
create or replace function public.pc_can_pick_partner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.pc_is_leadership()
      or public.pc_is_finance_staff()
      or public.pc_is_bdh_manager_any()
      or exists (select 1 from public.pc_project_members m
                 where m.role in ('GDDA','TC_KT') and lower(trim(m.email)) = public.caller_email());
$$;

create or replace function public.pc_can_manage_material_catalog()
returns boolean language sql stable security definer set search_path = public as $$
  select public.pc_is_leadership() or public.pc_is_finance_staff()
      or public.pc_is_bdh_manager_any()
      or exists (select 1 from public.pc_project_members m
                  where m.role in ('VAT_TU','GDDA') and lower(trim(m.email)) = public.caller_email());
$$;

create or replace function public.pc_nav_access()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'has_projects',
      public.pc_is_leadership() or public.pc_is_finance_staff() or public.pc_is_viewer_all()
      or exists (select 1 from public.pc_project_members m where lower(trim(m.email)) = public.caller_email())
      or exists (select 1 from public.pc_projects p where p.bdh_name = public.pc_caller_department()),
    'can_dashboard',
      public.pc_is_leadership() or public.pc_is_finance_staff() or public.pc_is_viewer_all()
      or public.pc_is_bdh_manager_any()
      or exists (select 1 from public.pc_project_members m
                  where m.role = 'GDDA' and lower(trim(m.email)) = public.caller_email())
  );
$$;

-- Dựng lại NGUYÊN VĂN từ 102, chỉ đổi gate TEAM: có người mang cờ trong BĐH là đạt.
create or replace function public.pc_check_gates(p_project uuid, p_target text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today  date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_p      public.pc_projects%rowtype;
  v_out    jsonb := '[]'::jsonb;
  v_ok     boolean;
  v_num    numeric;
  v_cnt    integer;
  v_txt    text;
  v_date   date;
begin
  if not public.pc_can_view_project(p_project) then
    raise exception 'Không có quyền xem dự án này';
  end if;
  select * into v_p from public.pc_projects where id = p_project;

  if p_target = 'MOBILIZING' then
    v_ok := v_p.owner_name is not null and v_p.start_date is not null and v_p.finish_date is not null;
    v_out := v_out || jsonb_build_object('key','INFO','label','Thông tin dự án đủ (CĐT, ngày khởi công, ngày hoàn thành)','ok',v_ok,
      'detail', case when v_ok then 'Đủ' else 'Thiếu ở tab Tổng quan' end);

    select count(*) into v_cnt from public.pc_contracts where project_id = p_project and contract_type = 'A_B' and status = 'SIGNED';
    v_out := v_out || jsonb_build_object('key','AB_SIGNED','label','HĐ A-B đã ký','ok',v_cnt > 0,
      'detail', case when v_cnt > 0 then v_cnt || ' HĐ đã ký' else 'Chưa có HĐ A-B trạng thái Đã ký' end);

    select count(*) into v_cnt from public.pc_segments where project_id = p_project;
    v_out := v_out || jsonb_build_object('key','SEGMENTS','label','Có danh sách lý trình','ok',v_cnt > 0, 'detail', v_cnt || ' lý trình');

    select string_agg(s.code, ', ' order by s.km_start_m) into v_txt
      from public.pc_segments s
     where s.project_id = p_project
       and coalesce((select sum(w.weight_pct) from public.pc_segment_wbs w where w.segment_id = s.id and w.applicable), 0) not between 99.99 and 100.01;
    v_out := v_out || jsonb_build_object('key','WBS_100','label','Mọi lý trình có hạng mục, tổng tỷ trọng = 100%',
      'ok', v_txt is null and v_cnt > 0, 'detail', coalesce('Chưa đạt: ' || v_txt, 'Đạt'));

  elsif p_target = 'EXECUTING' then
    select count(*) into v_cnt from public.pc_contracts where project_id = p_project and contract_type = 'B_B1' and status = 'SIGNED';
    v_out := v_out || jsonb_build_object('key','BB_SIGNED','label','Có HĐ B-B'' đã ký','ok',v_cnt > 0,
      'detail', case when v_cnt > 0 then v_cnt || ' HĐ đã ký' else 'Chưa có HĐ B-B'' Đã ký' end);

    select avg((internal_status + supervisor_status) / 2) into v_num
      from public.pc_legal_items where project_id = p_project and item_group = 'SITE_OFFICE_STAFF';
    v_out := v_out || jsonb_build_object('key','LEGAL_STAFF','label','Pháp lý nhân sự BĐH ≥ 80%','ok',coalesce(v_num, 0) >= 0.8,
      'detail', coalesce(round(v_num * 100, 1) || '%', 'Chưa có checklist nhân sự'));

    select count(*) into v_cnt from public.pc_land_clearance where project_id = p_project and status = 'HANDED_OVER';
    v_out := v_out || jsonb_build_object('key','GPMB','label','Đã có đoạn GPMB bàn giao','ok',v_cnt > 0, 'detail', v_cnt || ' đoạn đã bàn giao');

    select string_agg(r, ', ') into v_txt from (
      select 'GĐDA' r where not exists (select 1 from public.pc_project_members where project_id = p_project and role = 'GDDA')
                        and not public.pc_bdh_has_manager(p_project)
      union all
      select 'CHT' where not exists (select 1 from public.pc_project_members where project_id = p_project and role = 'CHT')
                     and not public.pc_bdh_has_manager(p_project)
    ) x;
    v_out := v_out || jsonb_build_object('key','TEAM','label','Đã gán Giám đốc dự án + Chỉ huy trưởng','ok',v_txt is null,
      'detail', coalesce('Thiếu: ' || v_txt, 'Đủ'));

    select count(*) into v_cnt from public.pc_mobilization where project_id = p_project;
    v_out := v_out || jsonb_build_object('key','MOB_PLAN','label','Có kế hoạch huy động','ok',v_cnt > 0, 'detail', v_cnt || ' mục huy động');

  elsif p_target = 'COMPLETED' then
    select string_agg(s.code, ', ' order by s.km_start_m) into v_txt
      from public.pc_segments s
     where s.project_id = p_project
       and coalesce((
         select sum(w.weight_pct * case when coalesce(w.budget_qty, 0) > 0
                                        then least(1, coalesce(q.qty, 0) / w.budget_qty) else 0 end) / nullif(sum(w.weight_pct), 0)
           from public.pc_segment_wbs w
           left join (select segment_wbs_id, sum(qty) qty from public.pc_progress_logs
                       where status = 'APPROVED' group by segment_wbs_id) q on q.segment_wbs_id = w.id
          where w.segment_id = s.id and w.applicable and w.weight_pct > 0), 0) < 0.999;
    v_out := v_out || jsonb_build_object('key','OUTPUT_100','label','Mọi lý trình hoàn thành 100% khối lượng','ok',v_txt is null,
      'detail', coalesce('Chưa xong: ' || v_txt, 'Đạt'));

    select count(*) into v_cnt from public.pc_progress_logs where project_id = p_project and status in ('DRAFT','SUBMITTED');
    v_out := v_out || jsonb_build_object('key','NO_PENDING','label','Không còn nhật ký nháp / chờ duyệt','ok',v_cnt = 0, 'detail', v_cnt || ' nhật ký chưa duyệt');

    select count(*), count(*) filter (where internal_status = 1 and supervisor_status = 1) into v_cnt, v_num
      from public.pc_closeout_items where project_id = p_project;
    v_out := v_out || jsonb_build_object('key','CLOSEOUT','label','Hồ sơ hoàn công đủ (nội bộ + TVGS/CĐT đã duyệt)',
      'ok', v_cnt > 0 and v_num = v_cnt, 'detail', case when v_cnt = 0 then 'Chưa lập checklist hoàn công' else v_num || '/' || v_cnt || ' mục đạt' end);

  elsif p_target = 'SETTLEMENT' then
    select max(log_date) into v_date from public.pc_progress_logs where project_id = p_project;
    select count(*) into v_cnt from public.pc_period_locks
     where project_id = p_project and (v_date is null or locked_until >= v_date);
    v_out := v_out || jsonb_build_object('key','LOCKED','label','Đã khoá kỳ tới ngày nhật ký cuối cùng','ok',v_cnt > 0,
      'detail', case when v_date is null then 'Chưa có nhật ký' else 'Nhật ký cuối ' || to_char(v_date, 'DD/MM/YYYY') end);

    select count(*) into v_cnt from public.pc_acceptances a join public.pc_contracts c on c.id = a.contract_id
     where a.project_id = p_project and c.contract_type = 'A_B' and a.status = 'APPROVED';
    v_out := v_out || jsonb_build_object('key','AB_ACCEPTED','label','Có nghiệm thu A-B đã duyệt','ok',v_cnt > 0, 'detail', v_cnt || ' đợt đã duyệt');

  elsif p_target = 'WARRANTY' then
    select count(*) into v_cnt from public.pc_settlements s join public.pc_contracts c on c.id = s.contract_id
     where s.project_id = p_project and c.contract_type = 'A_B' and s.status = 'APPROVED';
    v_out := v_out || jsonb_build_object('key','AB_SETTLED','label','Quyết toán A-B đã được duyệt','ok',v_cnt > 0,
      'detail', case when v_cnt > 0 then 'Đã duyệt' else 'Chưa có quyết toán A-B Đã duyệt' end);

    v_date := public.pc_warranty_end(p_project);
    v_out := v_out || jsonb_build_object('key','WARRANTY_SET','label','Đã nhập ngày bắt đầu + thời hạn bảo hành','ok',v_date is not null,
      'detail', case when v_date is null then 'Chưa nhập ở mục Bảo hành' else 'Hết hạn ' || to_char(v_date, 'DD/MM/YYYY') end);

  elsif p_target = 'CLOSED' then
    v_date := public.pc_warranty_end(p_project);
    v_out := v_out || jsonb_build_object('key','WARRANTY_END','label','Đã hết thời hạn bảo hành','ok',v_date is not null and v_date <= v_today,
      'detail', case when v_date is null then 'Chưa nhập thời hạn bảo hành' else 'Hết hạn ' || to_char(v_date, 'DD/MM/YYYY') end);

    select count(*) into v_cnt from public.pc_warranty_issues where project_id = p_project and status <> 'DONE';
    v_out := v_out || jsonb_build_object('key','NO_ISSUES','label','Không còn sự cố bảo hành chưa xử lý','ok',v_cnt = 0, 'detail', v_cnt || ' sự cố mở');

    select count(*) into v_cnt from public.pc_warranty where project_id = p_project and (guarantee_no is null or guarantee_released);
    v_out := v_out || jsonb_build_object('key','GUARANTEE','label','Bảo lãnh bảo hành đã giải toả (hoặc không có)','ok',v_cnt > 0,
      'detail', case when v_cnt > 0 then 'Đạt' else 'Chưa đánh dấu giải toả' end);
  end if;

  return v_out;
end;
$$;

-- ─── 4. pc_my_access: thêm nhãn 'BDH_MANAGER' vào roles (hiện badge đầu trang) ───
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
      where m.project_id = p_project and lower(trim(m.email)) = public.caller_email()
    ), '[]'::jsonb)
    || case when public.pc_is_bdh_manager(p_project) then '["BDH_MANAGER"]'::jsonb else '[]'::jsonb end
  );
$$;

-- ─── 5. TAB THÀNH VIÊN: chỉ người gán được thành viên mới đọc được ───
-- Xoá TOÀN BỘ policy cũ trước khi siết (đừng đoán tên).
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'pc_project_members' loop
    execute format('drop policy if exists %I on public.pc_project_members', pol.policyname);
  end loop;
end $$;

create policy pc_members_select on public.pc_project_members for select to authenticated
  using (public.pc_can_manage_members(project_id));
create policy pc_members_write on public.pc_project_members for all to authenticated
  using (public.pc_can_manage_members(project_id)) with check (public.pc_can_manage_members(project_id));

-- ─── 6. QUYỀN GỌI HÀM ───
do $$
declare f text;
begin
  foreach f in array array['pc_is_bdh_manager(uuid)','pc_is_bdh_manager_any()','pc_bdh_has_manager(uuid)',
                           'pc_has_role(uuid, text[])','pc_can_pick_partner()','pc_can_manage_material_catalog()',
                           'pc_nav_access()','pc_check_gates(uuid, text)','pc_my_access(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- KIỂM TRA: cột cờ mới + policy của bảng thành viên
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'approval_permissions' and column_name = 'can_manage_bdh_project';
select policyname, cmd, qual from pg_policies where schemaname = 'public' and tablename = 'pc_project_members';
