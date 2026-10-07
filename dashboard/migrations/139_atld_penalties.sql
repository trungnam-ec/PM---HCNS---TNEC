-- ============================================================
-- 139 — P. AN TOÀN LAO ĐỘNG: TAB "KHẤU TRỪ XỬ PHẠT"
--
-- User yêu cầu 07/10/2026: thay bảng Excel "BẢNG THEO DÕI HỒ SƠ KHẤU TRỪ - XỬ PHẠT
-- VI PHẠM AN TOÀN (ATLĐ & KHĐT)". Hai phòng cùng thao tác trên MỘT dòng hồ sơ:
--   • P.ATLĐ nhập THÔNG TIN ĐẦU VÀO: loại hồ sơ, số QĐ (+ tệp/link), ngày ban hành,
--     dự án, nhà thầu phụ, nội dung, giá trị phải khấu trừ, người lập, ngày gửi KHĐT.
--   • P.KHĐT nhập THÔNG TIN ĐẦU RA: ngày tiếp nhận, đợt thanh toán, giá trị đã khấu
--     trừ, ngày khấu trừ, số chứng từ, người nhập, ghi chú.
--   • Tự tính (không sửa tay): Giá trị còn lại = phải trừ − đã trừ (cột sinh sẵn);
--     trạng thái / số ngày theo dõi / cảnh báo tính ở giao diện theo ngày hôm nay.
--
-- QUYỀN (user chốt 2 cờ tách phòng):
--   can_input_atld_penalty   — P.ATLĐ: tạo / sửa cột đầu vào / xoá hồ sơ chưa trừ đồng nào
--   can_process_atld_penalty — P.KHĐT: sửa cột đầu ra
--   Admin làm được tất cả. Ai có 1 trong 2 cờ tự vào được module An toàn lao động
--   nhưng CHỈ thấy tab này (kho BHLĐ vẫn theo cờ cũ / atld_can_view).
--   XEM tab: Admin · 2 cờ trên · người xem được kho (atld_can_view).
-- Chặn từng CỘT bằng trigger: người không có cờ đầu vào sửa cột đầu vào thì giá trị
-- cũ được giữ nguyên (và ngược lại) — giao diện đã khoá ô, trigger là chốt cuối.
--
-- Mã hồ sơ tự sinh "HS.XP-2026-001" theo năm tạo, khoá advisory chống trùng số.
-- Tệp QĐ: bucket riêng atld-penalty (KHĐT không có quyền đọc atld-files của kho).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 116 và 126.
-- SAU KHI CHẠY: Cài đặt > Phân quyền > Cờ quyền người dùng > nhóm Kho BHLĐ —
-- tích 2 cờ mới cho nhân sự P.ATLĐ và P.KHĐT.
-- ============================================================

-- ─── 1. Cờ quyền ───
alter table public.approval_permissions
  add column if not exists can_input_atld_penalty   boolean not null default false,
  add column if not exists can_process_atld_penalty boolean not null default false;

create or replace function public.atld_penalty_is_input()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_caller() or exists (
    select 1 from public.approval_permissions p
    where p.can_input_atld_penalty = true and public.atld_email_in(p.email)
  );
$$;

create or replace function public.atld_penalty_is_process()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_caller() or exists (
    select 1 from public.approval_permissions p
    where p.can_process_atld_penalty = true and public.atld_email_in(p.email)
  );
$$;

create or replace function public.atld_penalty_can_view()
returns boolean language sql stable security definer set search_path = public as $$
  select public.atld_can_view() or public.atld_penalty_is_input() or public.atld_penalty_is_process();
$$;

create or replace function public.atld_penalty_my_access()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'view',    public.atld_penalty_can_view(),
    'input',   public.atld_penalty_is_input(),
    'process', public.atld_penalty_is_process(),
    'stock',   public.atld_can_view()
  );
$$;

revoke all on function public.atld_penalty_is_input()   from public, anon;
revoke all on function public.atld_penalty_is_process() from public, anon;
revoke all on function public.atld_penalty_can_view()   from public, anon;
revoke all on function public.atld_penalty_my_access()  from public, anon;
grant execute on function public.atld_penalty_is_input()   to authenticated;
grant execute on function public.atld_penalty_is_process() to authenticated;
grant execute on function public.atld_penalty_can_view()   to authenticated;
grant execute on function public.atld_penalty_my_access()  to authenticated;

-- ─── 2. Bảng hồ sơ ───
create table if not exists public.atld_penalties (
  id               uuid primary key default gen_random_uuid(),
  nam              int  not null,
  seq              int  not null,
  ma_ho_so         text not null,                 -- "HS.XP-2026-001"
  -- P.ATLĐ — đầu vào
  loai_ho_so       text not null default 'Xử phạt vi phạm an toàn',
  so_quyet_dinh    text,
  qd_file_path     text,                          -- tệp trong bucket atld-penalty
  qd_file_name     text,
  qd_link          text,
  ngay_ban_hanh    date,
  project_code     text,                          -- chụp từ danh mục dự án (037), không FK
  project_name     text,
  contractor_id    uuid references public.finance_partners(id) on delete set null,
  contractor_name  text not null,                 -- chụp tên lúc lập (gõ tay vẫn được)
  noi_dung         text,
  gia_tri_phai_tru numeric(18,0) not null default 0 check (gia_tri_phai_tru >= 0),
  nguoi_lap        text,
  ngay_gui_khdt    date,
  -- P.KHĐT — đầu ra
  ngay_tiep_nhan   date,
  dot_thanh_toan   text,
  gia_tri_da_tru   numeric(18,0) not null default 0 check (gia_tri_da_tru >= 0),
  ngay_khau_tru    date,
  so_chung_tu      text,
  nguoi_nhap       text,
  ghi_chu          text,
  -- Tự tính
  gia_tri_con_lai  numeric(18,0) generated always as (gia_tri_phai_tru - gia_tri_da_tru) stored,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_by       text,
  updated_at       timestamptz not null default now(),
  unique (nam, seq),
  constraint atld_penalties_da_tru_le_phai_tru check (gia_tri_da_tru <= gia_tri_phai_tru)
);
create index if not exists atld_penalties_contractor_idx on public.atld_penalties (contractor_name);
create index if not exists atld_penalties_project_idx on public.atld_penalties (project_code);

-- ─── 3. Trigger: sinh mã + khoá cột theo phòng ───
create or replace function public.atld_penalties_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  can_in  boolean := public.atld_penalty_is_input();
  can_out boolean := public.atld_penalty_is_process();
begin
  if tg_op = 'INSERT' then
    new.nam := extract(year from (now() at time zone 'Asia/Ho_Chi_Minh'))::int;
    perform pg_advisory_xact_lock(hashtext('atld_penalty_' || new.nam));
    select coalesce(max(seq), 0) + 1 into new.seq from public.atld_penalties where nam = new.nam;
    new.ma_ho_so   := 'HS.XP-' || new.nam || '-' || lpad(new.seq::text, 3, '0');
    new.created_by := public.caller_email();
    new.created_at := now();
    if not can_out then
      new.ngay_tiep_nhan := null; new.dot_thanh_toan := null; new.gia_tri_da_tru := 0;
      new.ngay_khau_tru := null;  new.so_chung_tu := null;    new.nguoi_nhap := null;
      new.ghi_chu := null;
    end if;
  else
    new.nam := old.nam; new.seq := old.seq; new.ma_ho_so := old.ma_ho_so;
    new.created_by := old.created_by; new.created_at := old.created_at;
    if not can_in then
      new.loai_ho_so := old.loai_ho_so;       new.so_quyet_dinh := old.so_quyet_dinh;
      new.qd_file_path := old.qd_file_path;   new.qd_file_name := old.qd_file_name;
      new.qd_link := old.qd_link;             new.ngay_ban_hanh := old.ngay_ban_hanh;
      new.project_code := old.project_code;   new.project_name := old.project_name;
      new.contractor_id := old.contractor_id; new.contractor_name := old.contractor_name;
      new.noi_dung := old.noi_dung;           new.gia_tri_phai_tru := old.gia_tri_phai_tru;
      new.nguoi_lap := old.nguoi_lap;         new.ngay_gui_khdt := old.ngay_gui_khdt;
    end if;
    if not can_out then
      new.ngay_tiep_nhan := old.ngay_tiep_nhan; new.dot_thanh_toan := old.dot_thanh_toan;
      new.gia_tri_da_tru := old.gia_tri_da_tru; new.ngay_khau_tru := old.ngay_khau_tru;
      new.so_chung_tu := old.so_chung_tu;       new.nguoi_nhap := old.nguoi_nhap;
      new.ghi_chu := old.ghi_chu;
    end if;
  end if;
  if new.qd_link is not null and trim(new.qd_link) = '' then new.qd_link := null; end if;
  if new.qd_link is not null and new.qd_link !~* '^https?://' then
    raise exception 'Link quyết định phải bắt đầu bằng http:// hoặc https://';
  end if;
  new.updated_by := public.caller_email();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists atld_penalties_before_write on public.atld_penalties;
create trigger atld_penalties_before_write
  before insert or update on public.atld_penalties
  for each row execute function public.atld_penalties_before_write();

-- ─── 4. RLS ───
alter table public.atld_penalties enable row level security;
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'atld_penalties' loop
    execute format('drop policy if exists %I on public.atld_penalties', pol.policyname);
  end loop;
end $$;

create policy atld_penalties_select on public.atld_penalties for select to authenticated
  using (public.atld_penalty_can_view());
create policy atld_penalties_insert on public.atld_penalties for insert to authenticated
  with check (public.atld_penalty_is_input());
create policy atld_penalties_update on public.atld_penalties for update to authenticated
  using (public.atld_penalty_is_input() or public.atld_penalty_is_process())
  with check (public.atld_penalty_is_input() or public.atld_penalty_is_process());
-- Xoá: chỉ P.ATLĐ / Admin, và chỉ khi KHĐT chưa ghi khấu trừ đồng nào.
create policy atld_penalties_delete on public.atld_penalties for delete to authenticated
  using (public.atld_penalty_is_input() and gia_tri_da_tru = 0);

revoke all on public.atld_penalties from anon;

-- ─── 5. Kho tệp quyết định (riêng tư, 2MB, ảnh + PDF) ───
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('atld-penalty', 'atld-penalty', false, 2097152,
          array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'])
  on conflict (id) do update set
    public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
exception
  when insufficient_privilege or others then
    raise warning 'KHÔNG tạo được bucket (%). Vào Supabase > Storage > New bucket, tên "atld-penalty", BỎ TICK Public, giới hạn 2MB.', sqlerrm;
end $$;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
              where schemaname = 'storage' and tablename = 'objects' and policyname like 'atld penalty%' loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
  execute $p$
    create policy "atld penalty select" on storage.objects for select to authenticated
      using (bucket_id = 'atld-penalty' and public.atld_penalty_can_view())
  $p$;
  execute $p$
    create policy "atld penalty insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'atld-penalty' and public.atld_penalty_is_input())
  $p$;
  execute $p$
    create policy "atld penalty delete" on storage.objects for delete to authenticated
      using (bucket_id = 'atld-penalty' and public.atld_penalty_is_input())
  $p$;
exception
  when insufficient_privilege or others then
    raise warning 'KHÔNG đặt được policy storage (%). Tạo tay trong Supabase > Storage > atld-penalty > Policies.', sqlerrm;
end $$;

-- ─── 6. KIỂM TRA ───
select 'cột cờ mới' as muc, count(*)::text as ket_qua from information_schema.columns
 where table_schema = 'public' and table_name = 'approval_permissions'
   and column_name in ('can_input_atld_penalty', 'can_process_atld_penalty')                -- mong đợi 2
union all
select 'policy atld_penalties', count(*)::text from pg_policies
 where schemaname = 'public' and tablename = 'atld_penalties'                               -- mong đợi 4
union all
select 'bucket atld-penalty', count(*)::text from storage.buckets where id = 'atld-penalty' and public = false  -- mong đợi 1
union all
select 'policy storage atld penalty', count(*)::text from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and policyname like 'atld penalty%'; -- mong đợi 3
