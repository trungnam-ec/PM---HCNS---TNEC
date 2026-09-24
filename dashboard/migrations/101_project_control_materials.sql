-- ============================================================
-- 101 — QUẢN TRỊ DỰ ÁN P5: E. VẬT TƯ (dự toán · cấp phát · hao hụt · trượt giá)
--
-- Nền: 096–100. Chạy SAU 100.
-- (Tab giao diện đặt tên "E. Vật tư" — user đã đổi D thành Tài chính.)
--
-- Bảng:
--   pc_materials                 danh mục vật tư dùng chung (thép, xi măng, cát, đá…)
--   pc_material_prices           giá thị trường theo ngày (công bố giá tỉnh, báo giá NCC)
--   pc_material_budgets          dự toán: lý trình × hạng mục × vật tư, định mức, KL dự toán
--   pc_material_budget_prices    đơn giá dự toán (TIỀN, tách bảng)
--   pc_material_issues           phiếu cấp phát: ngày, KL, nhà thầu nhận, NCC, số phiếu
--   pc_material_issue_prices     đơn giá thực tế của phiếu (TIỀN, tách bảng)
--
-- Vai trò mới VAT_TU (Phòng vật tư / thủ kho dự án): nhập dự toán, cấp phát, giá.
-- XEM đơn giá: quyền tài chính (BLĐ / GĐDA / TC-KT) + VAT_TU. Kỹ sư chỉ thấy KL.
--
-- Công thức (đặc tả 8.7) tính ở giao diện + trong pc_refresh_risk:
--   Cấp phát LK = Σ phiếu · Còn lại = KL dự toán − cấp phát · KL cần theo SL = KL
--   hạng mục đã duyệt × định mức · Hao hụt = cấp phát − cần theo SL · Còn cần =
--   (KL HĐ − KL đã làm) × định mức · Thiếu hụt = còn cần − còn lại · Tồn công trường
--   = cấp phát − cần theo SL · Ngày hết = hôm nay + tồn / tiêu thụ BQ 14 ngày.
--
-- Rủi ro: thêm yếu tố "Vật tư" (trọng số mặc định 10) = tỷ lệ dòng dự toán có vấn
-- đề (thiếu hụt / sắp hết / hao hụt vượt ngưỡng) trên lý trình. Cảnh báo mới:
-- MAT_RUNOUT (đỏ), MAT_SHORTAGE, MAT_OVERUSE, MAT_PRICE (vàng; giá = cảnh báo tiền).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- ============================================================

-- ─── 1. VAI TRÒ VẬT TƯ ───
alter table public.pc_project_members drop constraint if exists pc_project_members_role_check;
alter table public.pc_project_members add constraint pc_project_members_role_check
  check (role in ('GDDA','CHT','QS','QA_QC','VP_BDH','KY_SU','TC_KT','VAT_TU'));

create or replace function public.pc_can_edit_material(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pc_is_leadership() or public.pc_has_role(p_project, array['GDDA','QS','VAT_TU']);
$$;

create or replace function public.pc_can_view_material_price(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pc_can_view_finance(p_project) or public.pc_has_role(p_project, array['VAT_TU']);
$$;

create or replace function public.pc_can_edit_material_price(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pc_can_edit_finance(p_project) or public.pc_has_role(p_project, array['VAT_TU']);
$$;

-- Danh mục + giá thị trường dùng chung: BLĐ, TC-KT toàn công ty, hoặc người giữ vai
-- trò Vật tư / GĐDA ở ít nhất một dự án.
create or replace function public.pc_can_manage_material_catalog()
returns boolean language sql stable security definer set search_path = public as $$
  select public.pc_is_leadership() or public.pc_is_finance_staff()
      or exists (select 1 from public.pc_project_members m
                  where m.role in ('VAT_TU','GDDA') and lower(trim(m.email)) = public.caller_email());
$$;

-- ─── 2. BẢNG ───
create table if not exists public.pc_materials (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name         text not null,
  unit         text,
  mat_group    text,                       -- Thép, Xi măng, Cát, Đá, Nhựa đường, Cọc, Cáp DƯL…
  is_critical  boolean not null default false,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.pc_material_prices (
  id              uuid primary key default gen_random_uuid(),
  material_id     uuid not null references public.pc_materials(id) on delete cascade,
  effective_date  date not null,
  price           bigint not null,
  source          text,                    -- Công bố giá tỉnh, báo giá NCC…
  province        text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_pc_mat_price on public.pc_material_prices (material_id, effective_date desc);

create table if not exists public.pc_material_budgets (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.pc_projects(id) on delete cascade,
  segment_wbs_id  uuid not null references public.pc_segment_wbs(id) on delete cascade,
  material_id     uuid not null references public.pc_materials(id) on delete restrict,
  norm_per_unit   numeric(18,6) not null default 0,  -- định mức vật tư / 1 đơn vị KL hạng mục
  budget_qty      numeric(18,3) not null default 0,  -- KL vật tư dự toán
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (segment_wbs_id, material_id)
);
create index if not exists idx_pc_mb_project on public.pc_material_budgets (project_id);

create table if not exists public.pc_material_budget_prices (
  material_budget_id  uuid primary key references public.pc_material_budgets(id) on delete cascade,
  budget_unit_price   bigint,
  updated_at          timestamptz not null default now()
);

create table if not exists public.pc_material_issues (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.pc_projects(id) on delete cascade,
  material_budget_id  uuid not null references public.pc_material_budgets(id) on delete cascade,
  contract_id         uuid references public.pc_contracts(id) on delete set null, -- nhà thầu nhận
  issue_date          date not null,
  qty                 numeric(18,3) not null check (qty > 0),
  supplier            text,
  doc_no              text,
  note                text,
  created_by          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_pc_mi_budget on public.pc_material_issues (material_budget_id, issue_date);

create table if not exists public.pc_material_issue_prices (
  issue_id           uuid primary key references public.pc_material_issues(id) on delete cascade,
  actual_unit_price  bigint,
  updated_at         timestamptz not null default now()
);

-- ─── 3. KIỂM TRA LIÊN KẾT + TRA DỰ ÁN ───
create or replace function public.pc_material_budget_project(p_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from public.pc_material_budgets where id = p_id;
$$;
create or replace function public.pc_material_issue_project(p_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from public.pc_material_issues where id = p_id;
$$;

create or replace function public.pc_material_link_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'pc_material_budgets' then
    if public.pc_segment_wbs_project(new.segment_wbs_id) is distinct from new.project_id then
      raise exception 'Hạng mục không thuộc dự án này';
    end if;
  elsif tg_table_name = 'pc_material_issues' then
    if public.pc_material_budget_project(new.material_budget_id) is distinct from new.project_id then
      raise exception 'Dòng dự toán không thuộc dự án này';
    end if;
    if new.contract_id is not null and public.pc_contract_project(new.contract_id) is distinct from new.project_id then
      raise exception 'Hợp đồng không thuộc dự án này';
    end if;
    if tg_op = 'INSERT' then new.created_by := public.caller_email(); else new.created_by := old.created_by; end if;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['pc_material_budgets','pc_material_issues'] loop
    execute format('drop trigger if exists trg_%s_link on public.%I', t, t);
    execute format('create trigger trg_%s_link before insert or update on public.%I
                      for each row execute function public.pc_material_link_guard()', t, t);
  end loop;
  foreach t in array array['pc_material_budgets','pc_material_budget_prices','pc_material_issues','pc_material_issue_prices'] loop
    execute format('drop trigger if exists trg_%s_touch on public.%I', t, t);
    execute format('create trigger trg_%s_touch before update on public.%I
                      for each row execute function public.pc_touch_updated_at()', t, t);
  end loop;
  foreach t in array array['pc_material_budgets','pc_material_budget_prices','pc_material_issues','pc_material_issue_prices'] loop
    execute format('drop trigger if exists trg_%s_audit on public.%I', t, t);
    execute format('create trigger trg_%s_audit after insert or update or delete on public.%I
                      for each row execute function public.pc_audit_trigger()', t, t);
  end loop;
end $$;

-- Phiếu cấp phát cũng theo khoá kỳ (ngày cấp phát ≤ mốc khoá -> không sửa được).
create or replace function public.pc_material_issue_lock_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.pc_assert_unlocked(old.project_id, old.issue_date);
    return old;
  end if;
  perform public.pc_assert_unlocked(new.project_id, new.issue_date);
  if tg_op = 'UPDATE' then perform public.pc_assert_unlocked(old.project_id, old.issue_date); end if;
  return new;
end;
$$;
drop trigger if exists trg_pc_material_issues_lock on public.pc_material_issues;
create trigger trg_pc_material_issues_lock before insert or update or delete on public.pc_material_issues
  for each row execute function public.pc_material_issue_lock_guard();

-- ─── 4. RLS ───
do $$
declare t text; pol record;
begin
  foreach t in array array['pc_materials','pc_material_prices','pc_material_budgets','pc_material_budget_prices',
                           'pc_material_issues','pc_material_issue_prices'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
  end loop;
end $$;

create policy pc_mat_select on public.pc_materials for select to authenticated using (true);
create policy pc_mat_write on public.pc_materials for all to authenticated
  using (public.pc_can_manage_material_catalog()) with check (public.pc_can_manage_material_catalog());

-- Giá thị trường là số công khai (công bố giá tỉnh) -> ai đăng nhập cũng đọc.
create policy pc_matp_select on public.pc_material_prices for select to authenticated using (true);
create policy pc_matp_write on public.pc_material_prices for all to authenticated
  using (public.pc_can_manage_material_catalog()) with check (public.pc_can_manage_material_catalog());

create policy pc_mb_select on public.pc_material_budgets for select to authenticated
  using (public.pc_can_view_project(project_id));
create policy pc_mb_write on public.pc_material_budgets for all to authenticated
  using (public.pc_can_edit_material(project_id)) with check (public.pc_can_edit_material(project_id));

create policy pc_mbp_select on public.pc_material_budget_prices for select to authenticated
  using (public.pc_can_view_material_price(public.pc_material_budget_project(material_budget_id)));
create policy pc_mbp_write on public.pc_material_budget_prices for all to authenticated
  using (public.pc_can_edit_material_price(public.pc_material_budget_project(material_budget_id)))
  with check (public.pc_can_edit_material_price(public.pc_material_budget_project(material_budget_id)));

create policy pc_mi_select on public.pc_material_issues for select to authenticated
  using (public.pc_can_view_project(project_id));
create policy pc_mi_write on public.pc_material_issues for all to authenticated
  using (public.pc_can_edit_material(project_id)) with check (public.pc_can_edit_material(project_id));

create policy pc_mip_select on public.pc_material_issue_prices for select to authenticated
  using (public.pc_can_view_material_price(public.pc_material_issue_project(issue_id)));
create policy pc_mip_write on public.pc_material_issue_prices for all to authenticated
  using (public.pc_can_edit_material_price(public.pc_material_issue_project(issue_id)))
  with check (public.pc_can_edit_material_price(public.pc_material_issue_project(issue_id)));

-- ─── 5. CẤU HÌNH RỦI RO: thêm yếu tố vật tư + ngưỡng ───
alter table public.pc_risk_config
  add column if not exists w_material      numeric(5,2) not null default 10,
  add column if not exists mat_days_warn   integer not null default 7,        -- dự báo hết trong N ngày -> đỏ
  add column if not exists mat_waste_warn  numeric(5,4) not null default 0.05, -- hao hụt > 5%
  add column if not exists mat_price_warn  numeric(5,4) not null default 0.10; -- trượt giá > 10%

alter table public.pc_risk_snapshots add column if not exists r_material numeric(6,4);

-- ─── 6. VIEW CHỈ SỐ VẬT TƯ TỪNG DÒNG DỰ TOÁN (không chứa tiền) ───
-- Dùng chung cho giao diện + hàm rủi ro. security_invoker: RLS bảng gốc áp dụng.
create or replace view public.pc_v_material_status
with (security_invoker = true) as
select
  b.id                    as material_budget_id,
  b.project_id,
  w.segment_id,
  b.segment_wbs_id,
  b.material_id,
  b.norm_per_unit,
  b.budget_qty,
  coalesce(i.qty, 0)      as issued_qty,
  coalesce(q.qty, 0)      as done_qty,          -- KL hạng mục đã duyệt
  coalesce(q14.qty, 0)    as done_qty_14d,      -- KL hạng mục đã duyệt 14 ngày gần nhất
  coalesce(w.budget_qty, 0) as wbs_budget_qty,
  coalesce(q.qty, 0) * b.norm_per_unit                          as needed_by_output,
  coalesce(i.qty, 0) - coalesce(q.qty, 0) * b.norm_per_unit     as site_stock,
  b.budget_qty - coalesce(i.qty, 0)                             as remaining_budget,
  greatest(0, coalesce(w.budget_qty, 0) - coalesce(q.qty, 0)) * b.norm_per_unit as still_needed,
  coalesce(q14.qty, 0) * b.norm_per_unit / 14.0                 as daily_use
from public.pc_material_budgets b
join public.pc_segment_wbs w on w.id = b.segment_wbs_id
left join (select material_budget_id, sum(qty) qty from public.pc_material_issues group by 1) i
       on i.material_budget_id = b.id
left join (select segment_wbs_id, sum(qty) qty from public.pc_progress_logs where status = 'APPROVED' group by 1) q
       on q.segment_wbs_id = b.segment_wbs_id
left join (select segment_wbs_id, sum(qty) qty from public.pc_progress_logs
            where status = 'APPROVED'
              and log_date > (now() at time zone 'Asia/Ho_Chi_Minh')::date - 14
            group by 1) q14
       on q14.segment_wbs_id = b.segment_wbs_id;

revoke all on public.pc_v_material_status from anon, public;
grant select on public.pc_v_material_status to authenticated;

-- ─── 7. pc_my_access: thêm quyền vật tư ───
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
  );
$$;

-- ─── 8. HÀM TÍNH RỦI RO (dựng lại từ bản 100, thêm yếu tố + cảnh báo vật tư) ───
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

  -- Cảnh báo không còn vi phạm -> tự đóng.
  update public.pc_alerts
     set status = 'RESOLVED', resolved_at = now()
   where project_id = p_project and status in ('OPEN','ACK') and last_seen < v_run;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['pc_can_edit_material(uuid)','pc_can_view_material_price(uuid)','pc_can_edit_material_price(uuid)',
                           'pc_can_manage_material_catalog()','pc_material_budget_project(uuid)','pc_material_issue_project(uuid)',
                           'pc_my_access(uuid)','pc_refresh_risk(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ─── 9. KIỂM TRA ───
select tablename, rowsecurity from pg_tables
where schemaname = 'public'
  and tablename in ('pc_materials','pc_material_prices','pc_material_budgets','pc_material_budget_prices',
                    'pc_material_issues','pc_material_issue_prices')
order by tablename;
