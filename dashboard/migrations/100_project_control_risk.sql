-- ============================================================
-- 100 — QUẢN TRỊ DỰ ÁN P4: CHẤM ĐIỂM RỦI RO · CẢNH BÁO · KHOÁ KỲ
--
-- Nền: 096–099. Chạy SAU 099.
--
-- 1. pc_risk_config    — ngưỡng + trọng số theo dự án (KHÔNG gõ cứng trong code).
-- 2. pc_risk_snapshots — điểm rủi ro từng lý trình theo NGÀY (vẽ xu hướng, xem bình
--                        đồ "tại ngày X"). Chỉ hàm pc_refresh_risk ghi.
-- 3. pc_alerts         — cảnh báo tự sinh / tự đóng; người dùng chỉ đổi trạng thái
--                        xử lý + ghi chú. Cảnh báo tiền (is_finance) chỉ người có
--                        quyền tài chính thấy.
-- 4. pc_period_locks   — khoá kỳ: nhật ký / nghiệm thu / thanh toán có ngày ≤ mốc khoá
--                        thì không thêm / sửa / xoá được. GĐDA hoặc BLĐ khoá/mở.
--
-- ĐIỂM RỦI RO lý trình (0 = an toàn, 100 = rủi ro cao nhất) = trung bình có trọng số
-- của các yếu tố CÓ dữ liệu (yếu tố thiếu dữ liệu bị bỏ, không tính là 0):
--   Tiến độ  : min(1, max(0, −ΔP / dp_full))   ΔP = %TT − %KH (theo tiền, cần KH);
--              chưa có KH thì dùng %HT tỷ trọng − % thời gian đã trôi của lý trình.
--   GPMB     : 1 − %GPMB (+0.2 nếu có đoạn vướng mắc)
--   Pháp lý  : 1 − % sẵn sàng pháp lý (mục của lý trình + mục cấp dự án)
--   Huy động : 1 − % sẵn sàng huy động
--   Tiền     : min(1, SL chưa TT B-B' lớn nhất của nhà thầu trên lý trình / ngưỡng)
-- TRẠNG THÁI: chưa có nhật ký & chưa tới ngày bắt đầu KH -> NOT_STARTED;
--   ΔP < −dp_warn -> DELAYED; còn lại theo điểm: < band_good GOOD, < band_control
--   CONTROLLED, < band_risk AT_RISK, còn lại DELAYED.
--
-- Tính khi nào: giao diện gọi pc_refresh_risk (mở hồ sơ dự án / dashboard). Không
-- cần cron. Mỗi lý trình 1 snapshot / ngày (ghi đè trong ngày).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- ============================================================

-- ─── 1. BẢNG ───
create table if not exists public.pc_risk_config (
  project_id      uuid primary key references public.pc_projects(id) on delete cascade,
  w_progress      numeric(5,2) not null default 35,
  w_gpmb          numeric(5,2) not null default 20,
  w_legal         numeric(5,2) not null default 15,
  w_mobilization  numeric(5,2) not null default 15,
  w_payment       numeric(5,2) not null default 15,
  dp_warn         numeric(5,4) not null default 0.05,   -- ΔP < −5% -> Chậm tiến độ
  dp_full         numeric(5,4) not null default 0.15,   -- ΔP = −15% -> rủi ro tiến độ tối đa
  band_good       integer not null default 20,
  band_control    integer not null default 40,
  band_risk       integer not null default 60,
  log_gap_days    integer not null default 2,           -- bao nhiêu ngày không có nhật ký thì cảnh báo
  updated_at      timestamptz not null default now()
);

create table if not exists public.pc_risk_snapshots (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.pc_projects(id) on delete cascade,
  segment_id    uuid not null references public.pc_segments(id) on delete cascade,
  snap_date     date not null,
  completion    numeric(6,4),     -- %HT theo tỷ trọng
  gpmb          numeric(6,4),
  legal         numeric(6,4),
  mobilization  numeric(6,4),
  dp            numeric(8,4),     -- ΔP (hoặc ΔP thay thế theo thời gian)
  dp_source     text,             -- 'VALUE' | 'TIME' | null
  r_progress    numeric(6,4),
  r_gpmb        numeric(6,4),
  r_legal       numeric(6,4),
  r_mobilization numeric(6,4),
  r_payment     numeric(6,4),
  score         numeric(6,2),
  status        text not null check (status in ('NOT_STARTED','GOOD','CONTROLLED','AT_RISK','DELAYED')),
  computed_at   timestamptz not null default now(),
  unique (segment_id, snap_date)
);
create index if not exists idx_pc_snap_project_date on public.pc_risk_snapshots (project_id, snap_date);

create table if not exists public.pc_alerts (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.pc_projects(id) on delete cascade,
  segment_id   uuid references public.pc_segments(id) on delete cascade,
  alert_key    text not null,               -- khoá chống trùng: loại + đối tượng
  alert_type   text not null,
  severity     text not null check (severity in ('HIGH','MEDIUM','LOW')),
  message      text not null,
  is_finance   boolean not null default false,
  status       text not null default 'OPEN' check (status in ('OPEN','ACK','RESOLVED')),
  note         text,
  handled_by   text,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  resolved_at  timestamptz,
  unique (project_id, alert_key)
);
create index if not exists idx_pc_alerts_project on public.pc_alerts (project_id, status);

create table if not exists public.pc_period_locks (
  project_id    uuid primary key references public.pc_projects(id) on delete cascade,
  locked_until  date not null,
  locked_by     text,
  locked_at     timestamptz not null default now()
);

-- ─── 2. KHOÁ KỲ ───
create or replace function public.pc_assert_unlocked(p_project uuid, p_date date)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_lock date;
begin
  if p_date is null then return; end if;
  select locked_until into v_lock from public.pc_period_locks where project_id = p_project;
  if v_lock is not null and p_date <= v_lock then
    raise exception 'Kỳ đến ngày % đã khoá — nhờ GĐDA / Ban lãnh đạo mở khoá trước khi sửa.', to_char(v_lock, 'DD/MM/YYYY');
  end if;
end;
$$;

create or replace function public.pc_period_lock_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_new date;
  v_old date;
begin
  if tg_table_name = 'pc_progress_logs' then
    if tg_op <> 'DELETE' then v_new := new.log_date; end if;
    if tg_op <> 'INSERT' then v_old := old.log_date; end if;
  elsif tg_table_name = 'pc_acceptances' then
    if tg_op <> 'DELETE' then v_new := coalesce(new.period_to, new.period_from); end if;
    if tg_op <> 'INSERT' then v_old := coalesce(old.period_to, old.period_from); end if;
  elsif tg_table_name = 'pc_payments' then
    if tg_op <> 'DELETE' then v_new := coalesce(new.paid_date, new.request_date); end if;
    if tg_op <> 'INSERT' then v_old := coalesce(old.paid_date, old.request_date); end if;
  end if;
  if tg_op = 'DELETE' then
    perform public.pc_assert_unlocked(old.project_id, v_old);
    return old;
  end if;
  perform public.pc_assert_unlocked(new.project_id, v_new);
  if tg_op = 'UPDATE' then
    perform public.pc_assert_unlocked(old.project_id, v_old);
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['pc_progress_logs','pc_acceptances','pc_payments'] loop
    execute format('drop trigger if exists trg_%s_lock on public.%I', t, t);
    execute format('create trigger trg_%s_lock before insert or update or delete on public.%I
                      for each row execute function public.pc_period_lock_guard()', t, t);
  end loop;
end $$;

-- ─── 3. CẢNH BÁO: người dùng chỉ được đổi status / note ───
create or replace function public.pc_alert_guard()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('pc.system', true), '') = '1' then
    return new;  -- hàm pc_refresh_risk đang ghi
  end if;
  if new.status not in ('OPEN','ACK') then
    raise exception 'Chỉ được chuyển cảnh báo sang "Đang xử lý" hoặc mở lại';
  end if;
  new.project_id  := old.project_id;
  new.segment_id  := old.segment_id;
  new.alert_key   := old.alert_key;
  new.alert_type  := old.alert_type;
  new.severity    := old.severity;
  new.message     := old.message;
  new.is_finance  := old.is_finance;
  new.first_seen  := old.first_seen;
  new.last_seen   := old.last_seen;
  new.resolved_at := old.resolved_at;
  new.handled_by  := public.caller_email();
  return new;
end;
$$;

drop trigger if exists trg_pc_alerts_guard on public.pc_alerts;
create trigger trg_pc_alerts_guard before update on public.pc_alerts
  for each row execute function public.pc_alert_guard();

-- ─── 4. HÀM TÍNH RỦI RO + SINH CẢNH BÁO ───
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

    v_wsum := 0; v_acc := 0;
    if v_rp   is not null then v_wsum := v_wsum + cfg.w_progress;     v_acc := v_acc + cfg.w_progress * v_rp;   end if;
    if v_rg   is not null then v_wsum := v_wsum + cfg.w_gpmb;         v_acc := v_acc + cfg.w_gpmb * v_rg;       end if;
    if v_rl   is not null then v_wsum := v_wsum + cfg.w_legal;        v_acc := v_acc + cfg.w_legal * v_rl;      end if;
    if v_rm   is not null then v_wsum := v_wsum + cfg.w_mobilization; v_acc := v_acc + cfg.w_mobilization * v_rm; end if;
    if v_rpay is not null then v_wsum := v_wsum + cfg.w_payment;      v_acc := v_acc + cfg.w_payment * v_rpay;  end if;
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
       r_progress, r_gpmb, r_legal, r_mobilization, r_payment, score, status, computed_at)
    values
      (p_project, seg.id, v_today, v_comp, v_gpmb, v_legal, v_mob, v_dp, v_dp_src,
       v_rp, v_rg, v_rl, v_rm, v_rpay, v_score, v_status, now())
    on conflict (segment_id, snap_date) do update set
      completion = excluded.completion, gpmb = excluded.gpmb, legal = excluded.legal,
      mobilization = excluded.mobilization, dp = excluded.dp, dp_source = excluded.dp_source,
      r_progress = excluded.r_progress, r_gpmb = excluded.r_gpmb, r_legal = excluded.r_legal,
      r_mobilization = excluded.r_mobilization, r_payment = excluded.r_payment,
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

  -- Cảnh báo không còn vi phạm -> tự đóng.
  update public.pc_alerts
     set status = 'RESOLVED', resolved_at = now()
   where project_id = p_project and status in ('OPEN','ACK') and last_seen < v_run;
end;
$$;

-- Ghi / làm mới 1 cảnh báo (mở lại nếu đã đóng).
create or replace function public.pc_raise_alert(
  p_project uuid, p_segment uuid, p_key text, p_type text, p_sev text, p_msg text, p_fin boolean, p_run timestamptz
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.pc_alerts (project_id, segment_id, alert_key, alert_type, severity, message, is_finance, status, first_seen, last_seen)
  values (p_project, p_segment, p_key, p_type, p_sev, p_msg, p_fin, 'OPEN', now(), p_run)
  on conflict (project_id, alert_key) do update set
    severity = excluded.severity,
    message = excluded.message,
    is_finance = excluded.is_finance,
    last_seen = p_run,
    status = case when public.pc_alerts.status = 'RESOLVED' then 'OPEN' else public.pc_alerts.status end,
    resolved_at = case when public.pc_alerts.status = 'RESOLVED' then null else public.pc_alerts.resolved_at end,
    first_seen = case when public.pc_alerts.status = 'RESOLVED' then now() else public.pc_alerts.first_seen end;
end;
$$;

-- Làm mới mọi dự án người gọi xem được (dashboard).
create or replace function public.pc_refresh_all()
returns integer language plpgsql security definer set search_path = public as $$
declare p record; n integer := 0;
begin
  for p in select id from public.pc_projects loop
    if public.pc_can_view_project(p.id) then
      perform public.pc_refresh_risk(p.id);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- ─── 5. RLS ───
do $$
declare t text; pol record;
begin
  foreach t in array array['pc_risk_config','pc_risk_snapshots','pc_alerts','pc_period_locks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
  end loop;
end $$;

grant insert, update, delete on public.pc_risk_config to authenticated;
grant insert, update, delete on public.pc_period_locks to authenticated;
grant update on public.pc_alerts to authenticated;          -- chỉ đổi trạng thái / ghi chú (trigger chặn phần còn lại)
revoke insert, update, delete on public.pc_risk_snapshots from authenticated;

create policy pc_cfg_select on public.pc_risk_config for select to authenticated
  using (public.pc_can_view_project(project_id));
create policy pc_cfg_write on public.pc_risk_config for all to authenticated
  using (public.pc_can_manage_members(project_id)) with check (public.pc_can_manage_members(project_id));

create policy pc_snap_select on public.pc_risk_snapshots for select to authenticated
  using (public.pc_can_view_project(project_id));

create policy pc_alerts_select on public.pc_alerts for select to authenticated
  using (public.pc_can_view_project(project_id) and (not is_finance or public.pc_can_view_finance(project_id)));
create policy pc_alerts_update on public.pc_alerts for update to authenticated
  using ((public.pc_can_edit_site(project_id) or public.pc_can_view_finance(project_id))
         and (not is_finance or public.pc_can_view_finance(project_id)))
  with check ((public.pc_can_edit_site(project_id) or public.pc_can_view_finance(project_id))
         and (not is_finance or public.pc_can_view_finance(project_id)));

create policy pc_lock_select on public.pc_period_locks for select to authenticated
  using (public.pc_can_view_project(project_id));
create policy pc_lock_write on public.pc_period_locks for all to authenticated
  using (public.pc_can_manage_members(project_id)) with check (public.pc_can_manage_members(project_id));

-- Nhật ký thay đổi cho cấu hình + khoá kỳ.
do $$
declare t text;
begin
  foreach t in array array['pc_risk_config','pc_period_locks'] loop
    execute format('drop trigger if exists trg_%s_audit on public.%I', t, t);
    execute format('create trigger trg_%s_audit after insert or update or delete on public.%I
                      for each row execute function public.pc_audit_trigger()', t, t);
  end loop;
  execute 'drop trigger if exists trg_pc_risk_config_touch on public.pc_risk_config';
  execute 'create trigger trg_pc_risk_config_touch before update on public.pc_risk_config
             for each row execute function public.pc_touch_updated_at()';
end $$;

do $$
declare f text;
begin
  foreach f in array array['pc_refresh_risk(uuid)','pc_refresh_all()','pc_assert_unlocked(uuid, date)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- Hàm nội bộ: không cho gọi thẳng từ trình duyệt.
  execute 'revoke all on function public.pc_raise_alert(uuid, uuid, text, text, text, text, boolean, timestamptz) from public, anon, authenticated';
end $$;

-- ─── 6. VIEW SẢN LƯỢNG LŨY KẾ THEO DỰ ÁN (dashboard) ───
-- Cộng sẵn trong CSDL: đọc thô view pc_v_progress_value sẽ vướng giới hạn 1.000
-- dòng / lần của Supabase. security_invoker -> người không có quyền tiền nhận NULL.
create or replace view public.pc_v_project_actual
with (security_invoker = true) as
select project_id, sum(value_a)::bigint as value_a, sum(value_b)::bigint as value_b, count(*) as approved_logs
from public.pc_v_progress_value
group by project_id;

revoke all on public.pc_v_project_actual from anon, public;
grant select on public.pc_v_project_actual to authenticated;

-- ─── 7. KIỂM TRA ───
select tablename, rowsecurity from pg_tables
where schemaname = 'public'
  and tablename in ('pc_risk_config','pc_risk_snapshots','pc_alerts','pc_period_locks')
order by tablename;
