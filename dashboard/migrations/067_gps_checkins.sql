-- ============================================================
-- 067 — CHẤM CÔNG GPS (Ban Điều hành dự án)
--
-- Nhân sự BĐH chấm công tại công trường bằng GPS + ảnh camera trên điện thoại
-- (/cham-cong). Hệ thống đo BÁN KÍNH quanh toạ độ BĐH (bảng project_locations):
-- trong vùng thì ghi nhận, NGOÀI vùng thì TỪ CHỐI GHI (trigger RAISE EXCEPTION)
-- nên không có "bản ghi ma". Mọi dòng ghi được đều là hợp lệ (is_valid=true).
--
-- Toạ độ BĐH tái sử dụng bảng public.project_locations (module Vị trí dự án,
-- migration 016). Bảng đó khoá theo bdh_name = departments.name (type='bdh').
--
-- Chi phí = 0đ: GPS trình duyệt + Haversine tự tính, không gọi API bản đồ trả phí.
-- Quyền xem/sửa/xoá phía HR: mirror y hệt kiểm soát bảng công máy chấm công
-- (Admin trong allowed_users HOẶC cờ approval_permissions.can_view_attendance_imports).
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> Run. An toàn chạy lại nhiều lần.
-- Tiên quyết: đã có project_locations (lat/lng), allowed_users, approval_permissions.
-- ============================================================

-- ─── 1. BỔ SUNG CẤU HÌNH CHẤM CÔNG CHO project_locations ───
-- radius_m: bán kính hợp lệ (mặc định 100m). shift_in/out: ca chuẩn để tính
-- trễ/sớm/tăng ca ở card HR (mặc định 08:00–17:00).
alter table public.project_locations
  add column if not exists radius_m  integer default 100,
  add column if not exists shift_in  text    default '08:00',
  add column if not exists shift_out text    default '17:00';

-- ─── 2. HÀM KHOẢNG CÁCH HAVERSINE (mét) ───
create or replace function public.gps_distance_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

-- ─── 3. BẢNG gps_checkins ───
create table if not exists public.gps_checkins (
  id             uuid primary key default gen_random_uuid(),
  user_email     text not null,
  employee_code  text,
  employee_name  text,
  bdh_name       text not null,
  kind           text not null check (kind in ('in','out')),  -- 'in'=vào/sáng, 'out'=ra/chiều
  captured_at    timestamptz not null default now(),          -- GIỜ SERVER (trigger ghi đè)
  lat            double precision not null,
  lng            double precision not null,
  accuracy_m     double precision,
  distance_m     double precision,                            -- server tính lại
  radius_m       integer,
  is_valid       boolean not null default false,              -- server quyết (luôn true khi ghi được)
  photo_path     text,
  device         text,
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_gps_checkins_email on public.gps_checkins (user_email);
create index if not exists idx_gps_checkins_bdh   on public.gps_checkins (bdh_name);
create index if not exists idx_gps_checkins_time  on public.gps_checkins (captured_at desc);

-- Chống chấm trùng: 1 lần HỢP LỆ / buổi (vào/ra) / ngày (giờ VN).
create unique index if not exists uq_gps_checkins_valid_per_day
  on public.gps_checkins (
    user_email, kind, ((timezone('Asia/Ho_Chi_Minh', captured_at))::date)
  ) where is_valid;

-- ─── 4. TRIGGER: TỪ CHỐI GHI khi không hợp lệ ───
-- Ngoài bán kính / GPS rác (>100m sai số) / BĐH chưa định vị -> RAISE EXCEPTION,
-- không ghi bản ghi ma. Mọi dòng ghi thành công đều is_valid=true và giờ server.
create or replace function public.gps_checkins_validate()
returns trigger language plpgsql as $$
declare pl record; d double precision;
begin
  new.captured_at := now();  -- giờ chính thức = server, bỏ qua đồng hồ client
  select lat, lng, coalesce(radius_m, 100) as radius_m into pl
  from public.project_locations where bdh_name = new.bdh_name limit 1;
  if not found then
    raise exception 'BĐH "%" chưa được ghim toạ độ.', new.bdh_name using errcode='check_violation';
  end if;
  if new.accuracy_m is not null and new.accuracy_m > 100 then
    raise exception 'Tín hiệu GPS quá yếu (sai số ~% m).', round(new.accuracy_m) using errcode='check_violation';
  end if;
  d := public.gps_distance_m(new.lat, new.lng, pl.lat, pl.lng);
  if d > pl.radius_m then
    raise exception 'Ngoài bán kính: cách BĐH ~% m (bán kính % m).', round(d), pl.radius_m using errcode='check_violation';
  end if;
  new.radius_m := pl.radius_m; new.distance_m := d; new.is_valid := true;
  return new;
end;
$$;

drop trigger if exists trg_gps_checkins_validate on public.gps_checkins;
create trigger trg_gps_checkins_validate
  before insert on public.gps_checkins
  for each row execute function public.gps_checkins_validate();

-- ─── 5. RLS ───
alter table public.gps_checkins enable row level security;
revoke all on public.gps_checkins from anon;

do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='gps_checkins'
  loop execute format('drop policy if exists %I on public.gps_checkins', pol.policyname); end loop;
end $$;

-- Ghi: chỉ chính chủ (user_email = email đăng nhập). Trigger vẫn là chốt cuối.
create policy "gps_insert_self" on public.gps_checkins
  for insert to authenticated with check (user_email ilike auth.email());

-- Đọc: chính chủ HOẶC Admin HOẶC người có cờ xem bảng công (HR).
create policy "gps_select_self_or_hr" on public.gps_checkins
  for select to authenticated using (
    user_email ilike auth.email()
    or exists (select 1 from public.allowed_users au where au.role='Admin' and au.email ilike auth.email())
    or exists (select 1 from public.approval_permissions ap
               where ap.can_view_attendance_imports=true and ap.email ilike '%'||auth.email()||'%'));

-- Sửa / Xoá: chỉ HR (Admin hoặc cờ xem bảng công).
create policy "gps_update_hr" on public.gps_checkins
  for update to authenticated using (
    exists (select 1 from public.allowed_users au where au.role='Admin' and au.email ilike auth.email())
    or exists (select 1 from public.approval_permissions ap
               where ap.can_view_attendance_imports=true and ap.email ilike '%'||auth.email()||'%'));
create policy "gps_delete_hr" on public.gps_checkins
  for delete to authenticated using (
    exists (select 1 from public.allowed_users au where au.role='Admin' and au.email ilike auth.email())
    or exists (select 1 from public.approval_permissions ap
               where ap.can_view_attendance_imports=true and ap.email ilike '%'||auth.email()||'%'));

-- ─── 6. BUCKET ẢNH (private, ≤2MB) ───
do $$ begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('gps-checkins','gps-checkins', false, 2097152,   -- 2MB
          array['image/jpeg','image/png','image/webp'])
  on conflict (id) do update set
    public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
exception when insufficient_privilege or others then
  raise warning 'Tao bucket tay: Supabase > Storage > New bucket "gps-checkins", BO TICK Public.';
end $$;

do $$ begin
  execute 'drop policy if exists "gps photo insert self" on storage.objects';
  execute 'drop policy if exists "gps photo select self or hr" on storage.objects';
  execute 'drop policy if exists "gps photo delete hr" on storage.objects';
  execute $p$ create policy "gps photo insert self" on storage.objects
      for insert to authenticated with check (bucket_id='gps-checkins') $p$;
  execute $p$ create policy "gps photo select self or hr" on storage.objects
      for select to authenticated using (
        bucket_id='gps-checkins' and (
          owner = auth.uid()
          or exists (select 1 from public.allowed_users au where au.role='Admin' and au.email ilike auth.email())
          or exists (select 1 from public.approval_permissions ap
                     where ap.can_view_attendance_imports=true and ap.email ilike '%'||auth.email()||'%'))) $p$;
  execute $p$ create policy "gps photo delete hr" on storage.objects
      for delete to authenticated using (
        bucket_id='gps-checkins' and (
          exists (select 1 from public.allowed_users au where au.role='Admin' and au.email ilike auth.email())
          or exists (select 1 from public.approval_permissions ap
                     where ap.can_view_attendance_imports=true and ap.email ilike '%'||auth.email()||'%'))) $p$;
exception when insufficient_privilege or others then
  raise warning 'Tao policy storage tay trong Supabase > Storage > gps-checkins > Policies.';
end $$;

-- ─── 7. KIỂM TRA ───
-- 1) Cột cấu hình đã có trên project_locations (mong đợi 3 dòng)
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='project_locations'
  and column_name in ('radius_m','shift_in','shift_out') order by column_name;
-- 2) anon KHÔNG có quyền gì trên gps_checkins (mong đợi rỗng)
select grantee, privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name='gps_checkins' and grantee='anon';
