-- ============================================================
-- 098 — QUẢN TRỊ DỰ ÁN P2: KHỐI A (GPMB, Huy động, Phát sinh thiết kế)
--                          + KHỐI B (Checklist pháp lý)
--
-- Nền: migration 096 (bảng pc_*, hàm quyền pc_*). Chạy SAU 096 + 097.
--
-- THANG TRẠNG THÁI giữ nguyên như file Excel (đặc tả 2.2):
--   Hồ sơ nội bộ : 0 Chưa làm   · 0.5 Đang làm       · 1 Sẵn sàng
--   TVGS / CĐT   : 0 Chưa nộp   · 0.5 Đã nộp         · 1 Đã duyệt
--   Huy động     : 0 Chưa huy động · 0.5 Một phần    · 1 Huy động đủ
--   Đầu vào NCC  : 0 Chưa có HS · 1 Đã có HS
--
-- QUYỀN GHI hiện trường (hàm mới pc_can_edit_site): Ban lãnh đạo + GĐDA + CHT +
-- QS + Văn phòng BĐH. Giá trị phát sinh (tiền) tách bảng pc_design_change_finance,
-- đọc/ghi theo quyền tài chính như 096.
--
-- Mọi bảng mang project_id (RLS gọn, không phải tra ngược). segment_id nếu có
-- phải thuộc ĐÚNG dự án đó — trigger pc_check_segment_project chặn gắn nhầm.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- ============================================================

-- ─── 1. HÀM QUYỀN HIỆN TRƯỜNG ───
create or replace function public.pc_can_edit_site(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.pc_is_leadership()
      or public.pc_has_role(p_project, array['GDDA','CHT','QS','VP_BDH']);
$$;

-- segment_id (nếu có) phải thuộc đúng project_id của dòng.
create or replace function public.pc_check_segment_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.segment_id is not null
     and public.pc_segment_project(new.segment_id) is distinct from new.project_id then
    raise exception 'Lý trình không thuộc dự án này';
  end if;
  return new;
end;
$$;

-- ─── 2. KHỐI A — GPMB ───
create table if not exists public.pc_land_clearance (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.pc_projects(id) on delete cascade,
  segment_id        uuid not null references public.pc_segments(id) on delete cascade,
  from_m            numeric(12,2) not null,          -- lý trình từ (mét)
  to_m              numeric(12,2) not null,          -- lý trình đến (mét)
  side              text not null default 'BOTH' check (side in ('LEFT','RIGHT','BOTH')),
  handover_date     date,
  status            text not null default 'PENDING'
                    check (status in ('PENDING','HANDED_OVER','OBSTRUCTED')),
  obstruction_note  text,                            -- vướng: hộ dân, điện, nước, cáp…
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint pc_land_clearance_order check (to_m > from_m)
);
create index if not exists idx_pc_gpmb_segment on public.pc_land_clearance (segment_id);
create index if not exists idx_pc_gpmb_project on public.pc_land_clearance (project_id);

-- ─── 3. KHỐI A — HUY ĐỘNG ───
create table if not exists public.pc_mobilization (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.pc_projects(id) on delete cascade,
  segment_id    uuid references public.pc_segments(id) on delete cascade, -- null = cả dự án
  contract_id   uuid references public.pc_contracts(id) on delete set null,
  category      text not null check (category in
                ('EQUIPMENT','MATERIAL','LABOR','UTILITIES','CAMP','ACCESS_ROAD','SPECIAL')),
  item_name     text not null,
  planned_date  date,
  planned_qty   numeric(14,2),
  actual_qty    numeric(14,2),
  unit          text,
  status        numeric(2,1) not null default 0 check (status in (0, 0.5, 1)),
  note          text,
  updated_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_pc_mob_project on public.pc_mobilization (project_id);

-- ─── 4. KHỐI A — PHÁT SINH THIẾT KẾ ───
create table if not exists public.pc_design_changes (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.pc_projects(id) on delete cascade,
  segment_id         uuid references public.pc_segments(id) on delete cascade,
  wbs_item_id        uuid references public.pc_wbs_items(id) on delete set null,
  name               text not null,
  internal_status    numeric(2,1) not null default 0 check (internal_status in (0, 0.5, 1)),
  supervisor_status  numeric(2,1) not null default 0 check (supervisor_status in (0, 0.5, 1)),
  owner_status       numeric(2,1) not null default 0 check (owner_status in (0, 0.5, 1)),
  impact_days        integer,
  submitted_date     date,
  approved_date      date,
  due_date           date,
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_pc_dc_project on public.pc_design_changes (project_id);

create table if not exists public.pc_design_change_finance (
  design_change_id  uuid primary key references public.pc_design_changes(id) on delete cascade,
  est_value         bigint,     -- giá trị dự kiến
  approved_value    bigint,     -- giá trị được duyệt
  updated_at        timestamptz not null default now()
);

create or replace function public.pc_design_change_project(p_dc uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from public.pc_design_changes where id = p_dc;
$$;

-- ─── 5. KHỐI B — CHECKLIST PHÁP LÝ ───
create table if not exists public.pc_legal_items (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.pc_projects(id) on delete cascade,
  segment_id           uuid references public.pc_segments(id) on delete cascade, -- null = cấp dự án
  item_group           text not null check (item_group in
                       ('SITE_OFFICE_STAFF','LAB','MATERIAL_SOURCE','METHOD_STATEMENT','CONTRACT','OTHER')),
  item_name            text not null,          -- GĐDA, CHT, QA/QC, P.TN, BPTC…
  person_name          text,
  vendor_input_status  numeric(2,1) not null default 0 check (vendor_input_status in (0, 1)),
  internal_status      numeric(2,1) not null default 0 check (internal_status in (0, 0.5, 1)),
  supervisor_status    numeric(2,1) not null default 0 check (supervisor_status in (0, 0.5, 1)),
  on_site              boolean,                -- hiện diện công trường (nhân sự); null = không áp dụng
  due_date             date,
  note                 text,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists idx_pc_legal_project on public.pc_legal_items (project_id);

-- ─── 6. TRIGGER: kiểm lý trình + updated_at + nhật ký ───
-- Bổ sung nhánh design_change_id vào hàm nhật ký của 096.
create or replace function public.pc_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r        jsonb;
  v_proj   uuid;
  v_rowid  text;
begin
  r := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if tg_table_name = 'pc_projects' then
    v_proj := (r ->> 'id')::uuid;
  elsif r ? 'project_id' then
    v_proj := (r ->> 'project_id')::uuid;
  elsif r ? 'segment_wbs_id' then
    v_proj := public.pc_segment_wbs_project((r ->> 'segment_wbs_id')::uuid);
  elsif r ? 'scope_id' then
    v_proj := public.pc_scope_project((r ->> 'scope_id')::uuid);
  elsif r ? 'design_change_id' then
    v_proj := public.pc_design_change_project((r ->> 'design_change_id')::uuid);
  elsif r ? 'contract_id' then
    v_proj := public.pc_contract_project((r ->> 'contract_id')::uuid);
  elsif r ? 'segment_id' then
    v_proj := public.pc_segment_project((r ->> 'segment_id')::uuid);
  end if;

  v_rowid := coalesce(r ->> 'id', r ->> 'project_id', r ->> 'segment_wbs_id',
                      r ->> 'contract_id', r ->> 'scope_id', r ->> 'design_change_id');

  insert into public.pc_audit_log (project_id, table_name, row_id, action, old_data, new_data, changed_by)
  values (
    v_proj, tg_table_name, v_rowid, tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
    public.caller_email()
  );
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['pc_land_clearance','pc_mobilization','pc_design_changes','pc_legal_items'] loop
    execute format('drop trigger if exists trg_%s_segchk on public.%I', t, t);
    execute format(
      'create trigger trg_%s_segchk before insert or update on public.%I
         for each row execute function public.pc_check_segment_project()', t, t);
  end loop;

  foreach t in array array['pc_land_clearance','pc_mobilization','pc_design_changes',
                           'pc_design_change_finance','pc_legal_items'] loop
    execute format('drop trigger if exists trg_%s_touch on public.%I', t, t);
    execute format(
      'create trigger trg_%s_touch before update on public.%I
         for each row execute function public.pc_touch_updated_at()', t, t);
    execute format('drop trigger if exists trg_%s_audit on public.%I', t, t);
    execute format(
      'create trigger trg_%s_audit after insert or update or delete on public.%I
         for each row execute function public.pc_audit_trigger()', t, t);
  end loop;
end $$;

-- ─── 7. RLS ───
do $$
declare
  t   text;
  pol record;
begin
  foreach t in array array['pc_land_clearance','pc_mobilization','pc_design_changes',
                           'pc_design_change_finance','pc_legal_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
  end loop;
end $$;

create policy pc_gpmb_select on public.pc_land_clearance for select to authenticated
  using (public.pc_can_view_project(project_id));
create policy pc_gpmb_write on public.pc_land_clearance for all to authenticated
  using (public.pc_can_edit_site(project_id)) with check (public.pc_can_edit_site(project_id));

create policy pc_mob_select on public.pc_mobilization for select to authenticated
  using (public.pc_can_view_project(project_id));
create policy pc_mob_write on public.pc_mobilization for all to authenticated
  using (public.pc_can_edit_site(project_id)) with check (public.pc_can_edit_site(project_id));

create policy pc_dc_select on public.pc_design_changes for select to authenticated
  using (public.pc_can_view_project(project_id));
create policy pc_dc_write on public.pc_design_changes for all to authenticated
  using (public.pc_can_edit_site(project_id)) with check (public.pc_can_edit_site(project_id));

create policy pc_dc_fin_select on public.pc_design_change_finance for select to authenticated
  using (public.pc_can_view_finance(public.pc_design_change_project(design_change_id)));
create policy pc_dc_fin_write on public.pc_design_change_finance for all to authenticated
  using (public.pc_can_edit_finance(public.pc_design_change_project(design_change_id)))
  with check (public.pc_can_edit_finance(public.pc_design_change_project(design_change_id)));

create policy pc_legal_select on public.pc_legal_items for select to authenticated
  using (public.pc_can_view_project(project_id));
create policy pc_legal_write on public.pc_legal_items for all to authenticated
  using (public.pc_can_edit_site(project_id)) with check (public.pc_can_edit_site(project_id));

-- ─── 8. pc_my_access trả thêm can_edit_site ───
create or replace function public.pc_my_access(p_project uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'can_view',            public.pc_can_view_project(p_project),
    'can_edit_structure',  public.pc_can_edit_structure(p_project),
    'can_edit_site',       public.pc_can_edit_site(p_project),
    'can_view_finance',    public.pc_can_view_finance(p_project),
    'can_edit_finance',    public.pc_can_edit_finance(p_project),
    'can_manage_members',  public.pc_can_manage_members(p_project),
    'is_leadership',       public.pc_is_leadership(),
    'roles', coalesce((
      select jsonb_agg(m.role) from public.pc_project_members m
      where m.project_id = p_project and lower(trim(m.email)) = public.caller_email()
    ), '[]'::jsonb)
  );
$$;

do $$
declare f text;
begin
  foreach f in array array['pc_can_edit_site(uuid)','pc_design_change_project(uuid)','pc_my_access(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ─── 9. KIỂM TRA ───
select tablename, rowsecurity from pg_tables
where schemaname = 'public'
  and tablename in ('pc_land_clearance','pc_mobilization','pc_design_changes',
                    'pc_design_change_finance','pc_legal_items')
order by tablename;
