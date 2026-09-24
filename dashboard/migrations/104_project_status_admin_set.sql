-- ============================================================
-- 104 — QUẢN TRỊ DỰ ÁN: BAN LÃNH ĐẠO / ADMIN ĐỔI THẲNG TRẠNG THÁI VÒNG ĐỜI
--
-- User chốt 25/09/2026 (hướng 2): ô "Trạng thái vòng đời" ở tab Tổng quan là
-- dropdown cho Ban lãnh đạo + Admin, chọn được BẤT KỲ giai đoạn (kể cả nhảy cóc).
-- Vẫn giữ kiểm soát:
--   • Chỉ pc_is_leadership() (Admin hoặc cờ can_view_all_projects) được gọi.
--   • Bắt buộc ghi lý do.
--   • Kiểm gate của giai đoạn đích (pc_check_gates) và lưu kết quả vào lịch sử;
--     đánh dấu forced = true khi nhảy cóc / lùi / gate chưa đạt.
-- Người khác vẫn chỉ chuyển từng bước qua tab Vòng đời (pc_change_status).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- ============================================================

create or replace function public.pc_set_status_admin(p_project uuid, p_target text, p_reason text)
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
  v_forced boolean;
begin
  if not public.pc_is_leadership() then
    raise exception 'Chỉ Ban lãnh đạo / Admin được đổi thẳng trạng thái vòng đời';
  end if;
  if p_target not in ('PREPARING','MOBILIZING','EXECUTING','SUSPENDED','COMPLETED','SETTLEMENT','WARRANTY','CLOSED') then
    raise exception 'Trạng thái không hợp lệ: %', p_target;
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Phải ghi lý do khi đổi thẳng trạng thái';
  end if;

  select status into v_from from public.pc_projects where id = p_project for update;
  if v_from is null then
    raise exception 'Không tìm thấy dự án';
  end if;
  if v_from = p_target then
    return jsonb_build_object('from', v_from, 'to', p_target, 'forced', false, 'unchanged', true);
  end if;

  v_kind := public.pc_transition_kind(v_from, p_target);
  v_gates := coalesce(public.pc_check_gates(p_project, p_target), '[]'::jsonb);
  select count(*) into v_failed from jsonb_array_elements(v_gates) g where not (g ->> 'ok')::boolean;
  -- Bình thường = đúng bước liền kề (tiến / tạm dừng) và gate đạt; còn lại ghi là bắt buộc.
  v_forced := v_kind is null or v_kind = 'BACK' or v_failed > 0;

  perform set_config('pc.system', '1', true);
  update public.pc_projects set status = p_target where id = p_project;
  insert into public.pc_lifecycle_events (project_id, from_status, to_status, reason, forced, gate_result, changed_by)
  values (p_project, v_from, p_target, trim(p_reason), v_forced, v_gates, public.caller_email());

  return jsonb_build_object('from', v_from, 'to', p_target, 'forced', v_forced, 'failed', v_failed);
end;
$$;

revoke all on function public.pc_set_status_admin(uuid, text, text) from public, anon;
grant execute on function public.pc_set_status_admin(uuid, text, text) to authenticated;

-- KIỂM TRA: hàm đã tồn tại
select proname from pg_proc where proname = 'pc_set_status_admin';
