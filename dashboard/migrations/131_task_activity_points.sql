-- ============================================================
-- 131_task_activity_points.sql — ĐIỂM THAO TÁC TRONG MODULE CÔNG VIỆC
--
-- Cho bảng "Đo lường sử dụng": mỗi NGÀY, mỗi loại thao tác trong công việc
-- được 1 điểm, tối đa 3 điểm/ngày:
--   comment : có viết bình luận (>= 10 ký tự) trong task
--   upload  : có tải tệp lên task
--   update  : có lưu chỉnh sửa task / kéo thẻ sang cột khác
-- Làm 50 lần trong ngày vẫn chỉ 1 điểm cho loại đó -> khó thổi số liệu.
--
-- NGUỒN DỮ LIỆU:
--   - Bảng mới `task_activity_events` (email, kind, occurred_at): ghi từ client
--     kể từ ngày triển khai. `tasks` không có cột người sửa nên KHÔNG hồi tố được
--     upload / update.
--   - Riêng `comment` hồi tố thêm từ `task_comments` (nếu bảng đã tồn tại).
--
-- QUYỀN: giống 034 — INSERT chỉ dòng của chính mình, SELECT chỉ Admin,
-- không UPDATE/DELETE. Hàm tổng hợp security definer, chặn nếu không phải Admin.
--
-- Cách chạy: dán TOÀN BỘ file vào Supabase SQL Editor rồi Run. Chạy lại an toàn.
-- ============================================================

create table if not exists public.task_activity_events (
  id          bigserial primary key,
  email       text        not null,
  kind        text        not null,
  occurred_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'task_activity_events_chk') then
    alter table public.task_activity_events
      add constraint task_activity_events_chk
      check (email = lower(btrim(email)) and email <> ''
             and kind in ('comment', 'upload', 'update'));
  end if;
end $$;

create index if not exists task_activity_events_occurred_idx
  on public.task_activity_events (occurred_at desc);

alter table public.task_activity_events enable row level security;

revoke all on public.task_activity_events from anon;
revoke all on sequence public.task_activity_events_id_seq from anon;
grant usage on sequence public.task_activity_events_id_seq to authenticated;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'task_activity_events'
  loop
    execute format('drop policy if exists %I on public.task_activity_events', pol.policyname);
  end loop;
end $$;

create policy "task_activity_events_insert_self" on public.task_activity_events
  for insert to authenticated
  with check (email = lower(btrim(auth.jwt() ->> 'email')));

create policy "task_activity_events_select_admin" on public.task_activity_events
  for select to authenticated
  using (
    exists (
      select 1 from public.allowed_users au
      where lower(au.email) = lower(auth.jwt() ->> 'email')
        and au.role = 'Admin'
    )
  );

-- ─── Hàm tổng hợp: mỗi người 1 dòng, số NGÀY theo từng loại ───
create or replace function public.admin_task_activity_points(
  p_from date,
  p_to   date
)
returns table (
  user_email   text,
  comment_days bigint,
  upload_days  bigint,
  update_days  bigint
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_start timestamptz := (p_from::timestamp at time zone 'Asia/Ho_Chi_Minh');
  v_end   timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh');
  v_sql   text;
begin
  if not exists (
    select 1 from public.allowed_users au
    where lower(au.email) = lower(auth.jwt() ->> 'email')
      and au.role = 'Admin'
  ) then
    raise exception 'Chỉ Admin mới được xem thống kê hoạt động.';
  end if;

  -- Nguồn 1: nhật ký mới. Nguồn 2 (chỉ comment): hồi tố từ task_comments nếu có.
  v_sql := $q$
    select e.email as em, e.kind as k,
           (e.occurred_at at time zone 'Asia/Ho_Chi_Minh')::date as d
      from public.task_activity_events e
     where e.occurred_at >= $1 and e.occurred_at < $2
  $q$;

  if to_regclass('public.task_comments') is not null then
    v_sql := v_sql || $q$
    union all
    select lower(btrim(c.author_email)), 'comment',
           (c.created_at at time zone 'Asia/Ho_Chi_Minh')::date
      from public.task_comments c
     where c.created_at >= $1 and c.created_at < $2
       and char_length(btrim(c.body)) >= 10
       and btrim(c.author_email) <> ''
    $q$;
  end if;

  return query execute
    'select s.em, '
    || 'count(distinct s.d) filter (where s.k = ''comment'')::bigint, '
    || 'count(distinct s.d) filter (where s.k = ''upload'')::bigint, '
    || 'count(distinct s.d) filter (where s.k = ''update'')::bigint '
    || 'from (' || v_sql || ') s group by s.em'
    using v_start, v_end;
end
$fn$;

revoke all on function public.admin_task_activity_points(date, date) from public;
revoke all on function public.admin_task_activity_points(date, date) from anon;
grant execute on function public.admin_task_activity_points(date, date) to authenticated;

-- KIỂM TRA (bằng tài khoản Admin):
-- select * from public.admin_task_activity_points(date_trunc('month', current_date)::date, current_date);
