-- ============================================================
-- 102 — QUẢN TRỊ DỰ ÁN P6: VÒNG ĐỜI · GATE · HOÀN CÔNG · QUYẾT TOÁN · BẢO HÀNH
--
-- Nền: 096–101. Chạy SAU 101.
--
-- Vòng đời (đặc tả mục 4):
--   PREPARING → MOBILIZING → EXECUTING ⇄ SUSPENDED → COMPLETED → SETTLEMENT → WARRANTY → CLOSED
--   (lùi: MOBILIZING→PREPARING, COMPLETED→EXECUTING — phải ghi lý do, không kiểm gate)
--
-- Trạng thái dự án CHỈ đổi qua RPC pc_change_status (kiểm quyền + gate + ghi lịch sử).
-- Trigger chặn mọi UPDATE thẳng cột pc_projects.status.
--   • GĐDA / Ban lãnh đạo chuyển khi mọi gate đạt.
--   • Gate chưa đạt: chỉ Ban lãnh đạo "chuyển bắt buộc", bắt buộc ghi lý do.
--
-- GATE (pc_check_gates trả danh sách {key,label,ok,detail}):
--   → MOBILIZING : thông tin DA đủ · HĐ A-B đã ký · có lý trình · mọi lý trình có hạng mục, tỷ trọng = 100%
--   → EXECUTING  : có HĐ B-B' đã ký · pháp lý nhân sự BĐH ≥ 80% · có đoạn GPMB đã bàn giao ·
--                  có GĐDA + CHT · có kế hoạch huy động
--   → COMPLETED  : mọi lý trình %HT = 100% · không còn nhật ký chờ duyệt / nháp · hồ sơ hoàn công đủ
--   → SETTLEMENT : đã khoá kỳ tới ngày nhật ký cuối · có nghiệm thu A-B đã duyệt
--   → WARRANTY   : quyết toán A-B đã duyệt · đã nhập ngày bắt đầu + thời hạn bảo hành
--   → CLOSED     : hết hạn bảo hành · không còn sự cố BH mở · bảo lãnh BH đã giải toả
--
-- Bảng mới: pc_lifecycle_events, pc_closeout_items (hồ sơ hoàn công), pc_settlements
-- (quyết toán, TIỀN), pc_warranty, pc_warranty_issues. Giá trị bảo lãnh BH là tiền ->
-- cột mới pc_project_finance.warranty_guarantee_value.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- ============================================================

-- ─── 1. BẢNG ───
create table if not exists public.pc_lifecycle_events (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.pc_projects(id) on delete cascade,
  from_status  text,
  to_status    text not null,
  reason       text,
  forced       boolean not null default false,
  gate_result  jsonb,
  changed_by   text,
  changed_at   timestamptz not null default now()
);
create index if not exists idx_pc_life_project on public.pc_lifecycle_events (project_id, changed_at desc);

create table if not exists public.pc_closeout_items (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.pc_projects(id) on delete cascade,
  item_name          text not null,
  internal_status    numeric(2,1) not null default 0 check (internal_status in (0, 0.5, 1)),
  supervisor_status  numeric(2,1) not null default 0 check (supervisor_status in (0, 0.5, 1)),
  person_name        text,
  due_date           date,
  note               text,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_pc_closeout_project on public.pc_closeout_items (project_id);

create table if not exists public.pc_settlements (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.pc_projects(id) on delete cascade,
  contract_id       uuid not null references public.pc_contracts(id) on delete cascade,
  settlement_value  bigint,
  doc_no            text,
  submitted_date    date,
  approved_date     date,
  status            text not null default 'DRAFT' check (status in ('DRAFT','SUBMITTED','APPROVED')),
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_pc_settle_project on public.pc_settlements (project_id);

create table if not exists public.pc_warranty (
  project_id          uuid primary key references public.pc_projects(id) on delete cascade,
  warranty_start      date,
  warranty_months     integer check (warranty_months is null or warranty_months > 0),
  guarantee_no        text,
  guarantee_bank      text,
  guarantee_expiry    date,
  guarantee_released  boolean not null default false,
  note                text,
  updated_at          timestamptz not null default now()
);

create table if not exists public.pc_warranty_issues (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.pc_projects(id) on delete cascade,
  segment_id     uuid references public.pc_segments(id) on delete set null,
  reported_date  date not null,
  description    text not null,
  severity       text not null default 'MEDIUM' check (severity in ('HIGH','MEDIUM','LOW')),
  status         text not null default 'OPEN' check (status in ('OPEN','FIXING','DONE')),
  due_date       date,
  fixed_date     date,
  contract_id    uuid references public.pc_contracts(id) on delete set null, -- nhà thầu chịu trách nhiệm
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_pc_wi_project on public.pc_warranty_issues (project_id, status);

alter table public.pc_project_finance
  add column if not exists warranty_guarantee_value bigint;

-- Ngày hết hạn bảo hành (dùng chung cho gate + cảnh báo + giao diện).
create or replace function public.pc_warranty_end(p_project uuid)
returns date language sql stable security definer set search_path = public as $$
  select (warranty_start + make_interval(months => warranty_months))::date
    from public.pc_warranty where project_id = p_project and warranty_start is not null and warranty_months is not null;
$$;

-- ─── 2. TRIGGER: kiểm liên kết, updated_at, nhật ký thay đổi ───
create or replace function public.pc_p6_link_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name in ('pc_settlements') or (tg_table_name = 'pc_warranty_issues' and new.contract_id is not null) then
    if public.pc_contract_project(new.contract_id) is distinct from new.project_id then
      raise exception 'Hợp đồng không thuộc dự án này';
    end if;
  end if;
  if tg_table_name = 'pc_warranty_issues' and new.segment_id is not null
     and public.pc_segment_project(new.segment_id) is distinct from new.project_id then
    raise exception 'Lý trình không thuộc dự án này';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['pc_settlements','pc_warranty_issues'] loop
    execute format('drop trigger if exists trg_%s_link on public.%I', t, t);
    execute format('create trigger trg_%s_link before insert or update on public.%I
                      for each row execute function public.pc_p6_link_guard()', t, t);
  end loop;
  foreach t in array array['pc_closeout_items','pc_settlements','pc_warranty','pc_warranty_issues'] loop
    execute format('drop trigger if exists trg_%s_touch on public.%I', t, t);
    execute format('create trigger trg_%s_touch before update on public.%I
                      for each row execute function public.pc_touch_updated_at()', t, t);
    execute format('drop trigger if exists trg_%s_audit on public.%I', t, t);
    execute format('create trigger trg_%s_audit after insert or update or delete on public.%I
                      for each row execute function public.pc_audit_trigger()', t, t);
  end loop;
end $$;

-- Trạng thái dự án chỉ đổi qua pc_change_status (cờ pc.system).
create or replace function public.pc_project_status_guard()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status and coalesce(current_setting('pc.system', true), '') <> '1' then
    raise exception 'Trạng thái vòng đời chỉ đổi được ở tab Vòng đời (có kiểm tra gate).';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_pc_projects_status_guard on public.pc_projects;
create trigger trg_pc_projects_status_guard before update on public.pc_projects
  for each row execute function public.pc_project_status_guard();

-- ─── 3. RLS ───
do $$
declare t text; pol record;
begin
  foreach t in array array['pc_lifecycle_events','pc_closeout_items','pc_settlements','pc_warranty','pc_warranty_issues'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
  end loop;
end $$;

-- Lịch sử vòng đời: chỉ đọc (RPC ghi).
revoke insert, update, delete on public.pc_lifecycle_events from authenticated;
create policy pc_life_select on public.pc_lifecycle_events for select to authenticated
  using (public.pc_can_view_project(project_id));

create policy pc_close_select on public.pc_closeout_items for select to authenticated
  using (public.pc_can_view_project(project_id));
create policy pc_close_write on public.pc_closeout_items for all to authenticated
  using (public.pc_can_edit_site(project_id)) with check (public.pc_can_edit_site(project_id));

create policy pc_settle_select on public.pc_settlements for select to authenticated
  using (public.pc_can_view_finance(project_id));
create policy pc_settle_write on public.pc_settlements for all to authenticated
  using (public.pc_can_edit_finance(project_id)) with check (public.pc_can_edit_finance(project_id));

create policy pc_warr_select on public.pc_warranty for select to authenticated
  using (public.pc_can_view_project(project_id));
create policy pc_warr_write on public.pc_warranty for all to authenticated
  using (public.pc_can_manage_members(project_id) or public.pc_can_edit_finance(project_id))
  with check (public.pc_can_manage_members(project_id) or public.pc_can_edit_finance(project_id));

create policy pc_wi_select on public.pc_warranty_issues for select to authenticated
  using (public.pc_can_view_project(project_id));
create policy pc_wi_write on public.pc_warranty_issues for all to authenticated
  using (public.pc_can_edit_site(project_id)) with check (public.pc_can_edit_site(project_id));

-- ─── 4. GATE ───
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
      union all
      select 'CHT' where not exists (select 1 from public.pc_project_members where project_id = p_project and role = 'CHT')
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

-- Cặp chuyển hợp lệ. 'BACK' = lùi (không kiểm gate, bắt buộc lý do).
create or replace function public.pc_transition_kind(p_from text, p_to text)
returns text language sql immutable as $$
  select case
    when (p_from, p_to) in (('PREPARING','MOBILIZING'),('MOBILIZING','EXECUTING'),('EXECUTING','COMPLETED'),
                            ('COMPLETED','SETTLEMENT'),('SETTLEMENT','WARRANTY'),('WARRANTY','CLOSED')) then 'FORWARD'
    when (p_from, p_to) in (('EXECUTING','SUSPENDED'),('SUSPENDED','EXECUTING')) then 'SUSPEND'
    when (p_from, p_to) in (('MOBILIZING','PREPARING'),('COMPLETED','EXECUTING')) then 'BACK'
    else null end;
$$;

create or replace function public.pc_change_status(p_project uuid, p_target text, p_reason text, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from   text;
  v_kind   text;
  v_gates  jsonb := '[]'::jsonb;
  v_failed integer := 0;
begin
  if not public.pc_can_manage_members(p_project) then
    raise exception 'Chỉ Giám đốc dự án hoặc Ban lãnh đạo được chuyển giai đoạn';
  end if;
  select status into v_from from public.pc_projects where id = p_project for update;
  v_kind := public.pc_transition_kind(v_from, p_target);
  if v_kind is null then
    raise exception 'Không chuyển được từ % sang %', v_from, p_target;
  end if;
  if v_kind in ('BACK','SUSPEND') and coalesce(trim(p_reason), '') = '' then
    raise exception 'Phải ghi lý do khi lùi giai đoạn / tạm dừng / tiếp tục';
  end if;

  if v_kind = 'FORWARD' then
    v_gates := public.pc_check_gates(p_project, p_target);
    select count(*) into v_failed from jsonb_array_elements(v_gates) g where not (g ->> 'ok')::boolean;
    if v_failed > 0 then
      if not p_force then
        raise exception 'Còn % điều kiện (gate) chưa đạt', v_failed;
      end if;
      if not public.pc_is_leadership() then
        raise exception 'Chỉ Ban lãnh đạo được chuyển bắt buộc khi gate chưa đạt';
      end if;
      if coalesce(trim(p_reason), '') = '' then
        raise exception 'Chuyển bắt buộc phải ghi lý do';
      end if;
    end if;
  end if;

  perform set_config('pc.system', '1', true);
  update public.pc_projects set status = p_target where id = p_project;
  insert into public.pc_lifecycle_events (project_id, from_status, to_status, reason, forced, gate_result, changed_by)
  values (p_project, v_from, p_target, nullif(trim(coalesce(p_reason, '')), ''), v_failed > 0, v_gates, public.caller_email());

  return jsonb_build_object('from', v_from, 'to', p_target, 'forced', v_failed > 0);
end;
$$;

-- ─── 5. CẢNH BÁO VÒNG ĐỜI (gọi từ pc_refresh_risk) ───
create or replace function public.pc_lifecycle_alerts(p_project uuid, p_run timestamptz, p_today date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_end date;
  w     public.pc_warranty%rowtype;
  r     record;
begin
  v_end := public.pc_warranty_end(p_project);
  select * into w from public.pc_warranty where project_id = p_project;
  if v_end is not null and v_end >= p_today and v_end <= p_today + 30 then
    perform public.pc_raise_alert(p_project, null, 'WARRANTY_ENDING', 'WARRANTY_ENDING', 'LOW',
      format('Bảo hành hết hạn ngày %s — chuẩn bị thủ tục đóng dự án', to_char(v_end, 'DD/MM/YYYY')), false, p_run);
  end if;
  if w.guarantee_no is not null and not w.guarantee_released and w.guarantee_expiry is not null
     and w.guarantee_expiry <= p_today + 30 then
    perform public.pc_raise_alert(p_project, null, 'GUARANTEE_EXPIRING', 'GUARANTEE_EXPIRING', 'MEDIUM',
      format('Bảo lãnh bảo hành số %s hết hiệu lực ngày %s', w.guarantee_no, to_char(w.guarantee_expiry, 'DD/MM/YYYY')), false, p_run);
  end if;
  for r in select id, description, due_date from public.pc_warranty_issues
            where project_id = p_project and status <> 'DONE' and due_date < p_today loop
    perform public.pc_raise_alert(p_project, null, 'WARRANTY_ISSUE_OVERDUE:' || r.id, 'WARRANTY_ISSUE_OVERDUE', 'MEDIUM',
      format('Sự cố bảo hành "%s" quá hạn xử lý %s', left(r.description, 60), to_char(r.due_date, 'DD/MM/YYYY')), false, p_run);
  end loop;
end;
$$;

-- ─── 6. HÀM TÍNH RỦI RO (dựng lại từ bản 101, thêm cảnh báo vòng đời) ───
create or replace function public.pc_refresh_risk(p_project uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today     date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_run       timestamptz := clock_timestamp();
  cfg         public.pc_risk_config%rowtype;
  v_proj      public.pc_projects%rowtype;
  v_threshold bigint;
  seg         record;
  r           record;
  v_total     numeric; v_done numeric; v_gpmb numeric; v_obs boolean;
  v_legal     numeric; v_mob numeric; v_comp numeric;
  v_gt        numeric; v_actual numeric; v_kh numeric; v_has_plan boolean;
  v_dp        numeric; v_dp_src text; v_timefrac numeric;
  v_pay       numeric; v_has_bb boolean;
  v_rp numeric; v_rg numeric; v_rl numeric; v_rm numeric; v_rpay numeric;
  v_wsum      numeric; v_acc numeric; v_score numeric; v_status text;
  v_has_log   boolean;
  v_dim       integer;
  v_rmat      numeric;
  m           record;
begin
  if not public.pc_can_view_project(p_project) then
    raise exception 'Không có quyền xem dự án này';
  end if;
  perform set_config('pc.system', '1', true);

  select * into v_proj from public.pc_projects where id = p_project;
  select * into cfg from public.pc_risk_config where project_id = p_project;
  if not found then
    insert into public.pc_risk_config (project_id) values (p_project) returning * into cfg;
  end if;
  select coalesce(payment_threshold, 4000000000) into v_threshold from public.pc_project_finance where project_id = p_project;
  v_threshold := coalesce(v_threshold, 4000000000);
  v_dim := extract(day from (date_trunc('month', v_today) + interval '1 month - 1 day'))::int;

  for seg in select * from public.pc_segments where project_id = p_project loop
    -- GPMB
    v_total := (seg.km_end_m - seg.km_start_m) * seg.sides;
    select coalesce(sum((to_m - from_m) * case when side = 'BOTH' then least(2, seg.sides) else 1 end), 0)
      into v_done
      from public.pc_land_clearance
     where segment_id = seg.id and status = 'HANDED_OVER' and (handover_date is null or handover_date <= v_today);
    v_gpmb := case when v_total > 0 then least(1, v_done / v_total) end;
    select exists(select 1 from public.pc_land_clearance where segment_id = seg.id and status = 'OBSTRUCTED') into v_obs;
    if not exists(select 1 from public.pc_land_clearance where segment_id = seg.id) then v_gpmb := null; end if;

    -- Pháp lý / huy động (mục của lý trình + mục cấp dự án)
    select avg((internal_status + supervisor_status) / 2) into v_legal
      from public.pc_legal_items where project_id = p_project and (segment_id = seg.id or segment_id is null);
    select avg(status) into v_mob
      from public.pc_mobilization where project_id = p_project and (segment_id = seg.id or segment_id is null);

    -- %HT theo tỷ trọng (KL đã duyệt)
    select case when sum(w.weight_pct) > 0 then
             sum(w.weight_pct * case when coalesce(w.budget_qty, 0) > 0
                                     then least(1, coalesce(q.qty, 0) / w.budget_qty) else 0 end) / sum(w.weight_pct)
           end
      into v_comp
      from public.pc_segment_wbs w
      left join (select segment_wbs_id, sum(qty) qty from public.pc_progress_logs
                  where status = 'APPROVED' and log_date <= v_today group by segment_wbs_id) q on q.segment_wbs_id = w.id
     where w.segment_id = seg.id and w.applicable and w.weight_pct > 0;

    -- Theo tiền: GT HĐ lý trình, SL thực tế, KH lũy kế (bản hiện hành, nội suy trong tháng)
    select coalesce(sum(f.budget_value), 0) into v_gt
      from public.pc_segment_wbs w join public.pc_segment_wbs_finance f on f.segment_wbs_id = w.id
     where w.segment_id = seg.id and w.applicable;
    select coalesce(sum(l.qty * f.unit_price), 0) into v_actual
      from public.pc_progress_logs l
      join public.pc_segment_wbs w on w.id = l.segment_wbs_id
      join public.pc_segment_wbs_finance f on f.segment_wbs_id = l.segment_wbs_id
     where w.segment_id = seg.id and l.status = 'APPROVED' and l.log_date <= v_today;
    with cur as (
      select distinct on (period_month) period_month, planned_value
        from public.pc_plan_entries
       where project_id = p_project and segment_id = seg.id
       order by period_month, version desc
    )
    select count(*) > 0,
           coalesce(sum(case when period_month < date_trunc('month', v_today)::date then coalesce(planned_value, 0)
                             when period_month = date_trunc('month', v_today)::date
                               then coalesce(planned_value, 0) * extract(day from v_today) / v_dim
                             else 0 end), 0)
      into v_has_plan, v_kh
      from cur;

    v_dp := null; v_dp_src := null;
    if v_gt > 0 and v_has_plan then
      v_dp := v_actual / v_gt - v_kh / v_gt;
      v_dp_src := 'VALUE';
    elsif v_comp is not null and seg.planned_start is not null and seg.planned_finish is not null
          and seg.planned_finish > seg.planned_start then
      v_timefrac := greatest(0, least(1, (v_today - seg.planned_start)::numeric / (seg.planned_finish - seg.planned_start)));
      v_dp := v_comp - v_timefrac;
      v_dp_src := 'TIME';
    end if;

    -- Tiền B-B': SL chưa thanh toán lớn nhất của các nhà thầu có phạm vi trên lý trình
    select count(*) > 0, max(x.unpaid) into v_has_bb, v_pay from (
      select c.id,
             coalesce((select sum(l.qty * b.unit_price) from public.pc_progress_logs l
                        join public.pc_bb_unit_prices b on b.contract_id = l.contract_id and b.segment_wbs_id = l.segment_wbs_id
                       where l.contract_id = c.id and l.status = 'APPROVED' and l.log_date <= v_today), 0)
           - coalesce((select sum(case when p.payment_type = 'ADVANCE_RECOVERY' then -1 else 1 end * coalesce(p.paid_value, 0))
                         from public.pc_payments p
                        where p.contract_id = c.id and p.direction = 'OUT' and p.status = 'PAID'
                          and coalesce(p.paid_date, v_today) <= v_today), 0) as unpaid
        from public.pc_contracts c
       where c.project_id = p_project and c.contract_type = 'B_B1'
         and exists (select 1 from public.pc_contract_scopes s where s.contract_id = c.id and s.segment_id = seg.id)
    ) x;

    -- Rủi ro từng yếu tố (null = không có dữ liệu -> bỏ khỏi trung bình)
    v_rp   := case when v_dp is not null then least(1, greatest(0, -v_dp / nullif(cfg.dp_full, 0))) end;
    v_rg   := case when v_gpmb is not null then least(1, (1 - v_gpmb) + case when v_obs then 0.2 else 0 end) end;
    v_rl   := case when v_legal is not null then 1 - v_legal end;
    v_rm   := case when v_mob is not null then 1 - v_mob end;
    v_rpay := case when v_has_bb then least(1, greatest(0, coalesce(v_pay, 0)) / nullif(v_threshold, 0)) end;

    -- Vật tư: tỷ lệ dòng dự toán có vấn đề (thiếu hụt dự kiến / sắp hết / hao hụt vượt ngưỡng).
    select case when count(*) = 0 then null
                else avg(case when
                        (x.still_needed > x.remaining_budget)
                     or (x.daily_use > 0 and x.still_needed > greatest(x.site_stock, 0)
                         and greatest(x.site_stock, 0) / x.daily_use < cfg.mat_days_warn)
                     or (x.needed_by_output > 0 and (x.issued_qty - x.needed_by_output) / x.needed_by_output > cfg.mat_waste_warn)
                   then 1 else 0 end) end
      into v_rmat
      from public.pc_v_material_status x
     where x.segment_id = seg.id;

    v_wsum := 0; v_acc := 0;
    if v_rp   is not null then v_wsum := v_wsum + cfg.w_progress;     v_acc := v_acc + cfg.w_progress * v_rp;   end if;
    if v_rg   is not null then v_wsum := v_wsum + cfg.w_gpmb;         v_acc := v_acc + cfg.w_gpmb * v_rg;       end if;
    if v_rl   is not null then v_wsum := v_wsum + cfg.w_legal;        v_acc := v_acc + cfg.w_legal * v_rl;      end if;
    if v_rm   is not null then v_wsum := v_wsum + cfg.w_mobilization; v_acc := v_acc + cfg.w_mobilization * v_rm; end if;
    if v_rpay is not null then v_wsum := v_wsum + cfg.w_payment;      v_acc := v_acc + cfg.w_payment * v_rpay;  end if;
    if v_rmat is not null then v_wsum := v_wsum + cfg.w_material;     v_acc := v_acc + cfg.w_material * v_rmat; end if;
    v_score := case when v_wsum > 0 then round(100 * v_acc / v_wsum, 2) end;

    select exists(select 1 from public.pc_progress_logs l join public.pc_segment_wbs w on w.id = l.segment_wbs_id
                   where w.segment_id = seg.id and l.status = 'APPROVED') into v_has_log;

    if not v_has_log and (seg.planned_start is null or seg.planned_start > v_today) then
      v_status := 'NOT_STARTED';
    elsif v_dp is not null and v_dp < -cfg.dp_warn then
      v_status := 'DELAYED';
    elsif v_score is null or v_score < cfg.band_good then
      v_status := 'GOOD';
    elsif v_score < cfg.band_control then
      v_status := 'CONTROLLED';
    elsif v_score < cfg.band_risk then
      v_status := 'AT_RISK';
    else
      v_status := 'DELAYED';
    end if;

    insert into public.pc_risk_snapshots as s
      (project_id, segment_id, snap_date, completion, gpmb, legal, mobilization, dp, dp_source,
       r_progress, r_gpmb, r_legal, r_mobilization, r_payment, r_material, score, status, computed_at)
    values
      (p_project, seg.id, v_today, v_comp, v_gpmb, v_legal, v_mob, v_dp, v_dp_src,
       v_rp, v_rg, v_rl, v_rm, v_rpay, v_rmat, v_score, v_status, now())
    on conflict (segment_id, snap_date) do update set
      completion = excluded.completion, gpmb = excluded.gpmb, legal = excluded.legal,
      mobilization = excluded.mobilization, dp = excluded.dp, dp_source = excluded.dp_source,
      r_progress = excluded.r_progress, r_gpmb = excluded.r_gpmb, r_legal = excluded.r_legal,
      r_mobilization = excluded.r_mobilization, r_payment = excluded.r_payment, r_material = excluded.r_material,
      score = excluded.score, status = excluded.status, computed_at = now();

    -- ─── Cảnh báo cấp lý trình ───
    if v_dp is not null and v_dp < -cfg.dp_warn then
      perform public.pc_raise_alert(p_project, seg.id, 'DELAY:' || seg.id, 'DELAY', 'HIGH',
        format('%s chậm tiến độ %s%%', seg.code, round(abs(v_dp) * 100, 1)), false, v_run);
    elsif v_dp is not null and v_dp < 0 then
      perform public.pc_raise_alert(p_project, seg.id, 'DELAY_WARN:' || seg.id, 'DELAY_WARN', 'MEDIUM',
        format('%s lưu ý trễ %s%%', seg.code, round(abs(v_dp) * 100, 1)), false, v_run);
    end if;
    if v_obs then
      perform public.pc_raise_alert(p_project, seg.id, 'GPMB_OBSTRUCTED:' || seg.id, 'GPMB_OBSTRUCTED', 'MEDIUM',
        format('%s có đoạn GPMB đang vướng mắc', seg.code), false, v_run);
    end if;
    if v_has_bb and coalesce(v_pay, 0) >= v_threshold then
      perform public.pc_raise_alert(p_project, seg.id, 'PAYMENT_NOT_OK:' || seg.id, 'PAYMENT_NOT_OK', 'HIGH',
        format('%s: có nhà thầu B-B'' với sản lượng chưa thanh toán vượt ngưỡng (NOT OK)', seg.code), true, v_run);
    end if;
    if not exists (select 1 from public.pc_contract_scopes s join public.pc_contracts c on c.id = s.contract_id
                    where s.segment_id = seg.id and c.contract_type = 'B_B1') then
      perform public.pc_raise_alert(p_project, seg.id, 'NO_CONTRACTOR:' || seg.id, 'NO_CONTRACTOR', 'LOW',
        format('%s chưa có thông tin nhà thầu (HĐ B-B'')', seg.code), false, v_run);
    end if;
  end loop;

  -- ─── Cảnh báo cấp dự án: quá hạn ───
  for r in select id, item_name, due_date from public.pc_legal_items
            where project_id = p_project and due_date < v_today and (internal_status + supervisor_status) < 2 loop
    perform public.pc_raise_alert(p_project, null, 'LEGAL_OVERDUE:' || r.id, 'LEGAL_OVERDUE', 'MEDIUM',
      format('Pháp lý "%s" quá hạn %s', r.item_name, to_char(r.due_date, 'DD/MM/YYYY')), false, v_run);
  end loop;
  for r in select id, item_name, planned_date from public.pc_mobilization
            where project_id = p_project and planned_date < v_today and status < 1 loop
    perform public.pc_raise_alert(p_project, null, 'MOB_OVERDUE:' || r.id, 'MOB_OVERDUE', 'MEDIUM',
      format('Huy động "%s" trễ so với ngày KH %s', r.item_name, to_char(r.planned_date, 'DD/MM/YYYY')), false, v_run);
  end loop;
  for r in select id, name, due_date from public.pc_design_changes
            where project_id = p_project and due_date < v_today and owner_status < 1 loop
    perform public.pc_raise_alert(p_project, null, 'DC_OVERDUE:' || r.id, 'DC_OVERDUE', 'MEDIUM',
      format('Phát sinh "%s" quá hạn %s, CĐT chưa duyệt', r.name, to_char(r.due_date, 'DD/MM/YYYY')), false, v_run);
  end loop;
  if v_proj.status in ('EXECUTING','MOBILIZING')
     and not exists (select 1 from public.pc_progress_logs
                      where project_id = p_project and status <> 'REJECTED'
                        and log_date > v_today - cfg.log_gap_days) then
    perform public.pc_raise_alert(p_project, null, 'LOG_MISSING', 'LOG_MISSING', 'LOW',
      format('Chưa có nhật ký sản lượng trong %s ngày gần nhất', cfg.log_gap_days), false, v_run);
  end if;

  -- ─── Cảnh báo vật tư (từng dòng dự toán) ───
  for m in
    select x.*, s.code as seg_code, mt.name as mat_name, mt.unit as mat_unit,
           bp.budget_unit_price,
           (select p.price from public.pc_material_prices p
             where p.material_id = x.material_id and p.effective_date <= v_today
             order by p.effective_date desc limit 1) as market_price
      from public.pc_v_material_status x
      join public.pc_segments s on s.id = x.segment_id
      join public.pc_materials mt on mt.id = x.material_id
      left join public.pc_material_budget_prices bp on bp.material_budget_id = x.material_budget_id
     where x.project_id = p_project
  loop
    if m.daily_use > 0 and m.still_needed > greatest(m.site_stock, 0)
       and greatest(m.site_stock, 0) / m.daily_use < cfg.mat_days_warn then
      perform public.pc_raise_alert(p_project, m.segment_id, 'MAT_RUNOUT:' || m.material_budget_id, 'MAT_RUNOUT', 'HIGH',
        format('%s: %s dự báo hết sau %s ngày (tồn %s %s)', m.seg_code, m.mat_name,
               floor(greatest(m.site_stock, 0) / m.daily_use), round(greatest(m.site_stock, 0), 1), coalesce(m.mat_unit, '')),
        false, v_run);
    end if;
    if m.still_needed > m.remaining_budget then
      perform public.pc_raise_alert(p_project, m.segment_id, 'MAT_SHORTAGE:' || m.material_budget_id, 'MAT_SHORTAGE', 'MEDIUM',
        format('%s: %s dự kiến thiếu %s %s so với dự toán', m.seg_code, m.mat_name,
               round(m.still_needed - m.remaining_budget, 1), coalesce(m.mat_unit, '')),
        false, v_run);
    end if;
    if m.needed_by_output > 0 and (m.issued_qty - m.needed_by_output) / m.needed_by_output > cfg.mat_waste_warn then
      perform public.pc_raise_alert(p_project, m.segment_id, 'MAT_OVERUSE:' || m.material_budget_id, 'MAT_OVERUSE', 'MEDIUM',
        format('%s: %s hao hụt %s%% so với định mức', m.seg_code, m.mat_name,
               round((m.issued_qty - m.needed_by_output) / m.needed_by_output * 100, 1)),
        false, v_run);
    end if;
    if m.market_price is not null and coalesce(m.budget_unit_price, 0) > 0
       and (m.market_price - m.budget_unit_price)::numeric / m.budget_unit_price > cfg.mat_price_warn then
      perform public.pc_raise_alert(p_project, m.segment_id, 'MAT_PRICE:' || m.material_budget_id, 'MAT_PRICE', 'MEDIUM',
        format('%s: giá %s tăng %s%% so với đơn giá dự toán', m.seg_code, m.mat_name,
               round((m.market_price - m.budget_unit_price)::numeric / m.budget_unit_price * 100, 1)),
        true, v_run);
    end if;
  end loop;

  -- Cảnh báo vòng đời: bảo hành / bảo lãnh sắp hết, sự cố BH quá hạn (P6).
  perform public.pc_lifecycle_alerts(p_project, v_run, v_today);

  -- Cảnh báo không còn vi phạm -> tự đóng.
  update public.pc_alerts
     set status = 'RESOLVED', resolved_at = now()
   where project_id = p_project and status in ('OPEN','ACK') and last_seen < v_run;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['pc_check_gates(uuid, text)','pc_change_status(uuid, text, text, boolean)',
                           'pc_warranty_end(uuid)','pc_refresh_risk(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  execute 'revoke all on function public.pc_lifecycle_alerts(uuid, timestamptz, date) from public, anon, authenticated';
end $$;

-- ─── 7. KIỂM TRA ───
select tablename, rowsecurity from pg_tables
where schemaname = 'public'
  and tablename in ('pc_lifecycle_events','pc_closeout_items','pc_settlements','pc_warranty','pc_warranty_issues')
order by tablename;
