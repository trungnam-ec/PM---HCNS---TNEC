-- ============================================================
-- 150 — DANH BẠ ĐỐI TÁC (Nhà thầu phụ / Nhà cung cấp / Tổ đội thi công)
--
-- Sếp yêu cầu 13/10/2026: module danh bạ đối tác, gói cao nhất (Enterprise) cho Ban
-- lãnh đạo, có cờ quyền cấp từng người: cờ XEM và cờ SỬA.
-- Bảng RIÊNG, không gộp vào finance_partners (048): danh bạ chỉ chứa thông tin
-- liên hệ + năng lực, KHÔNG có số tài khoản ngân hàng nên mở cho người được cấp cờ.
-- Liên kết tuỳ chọn sang finance_partners qua finance_partner_id (nối theo MST ở
-- giai đoạn sau) — chưa ràng buộc gì ở giai đoạn 1.
--
-- Ai được XEM : Admin · cờ can_view_partner_dir · cờ can_manage_partner_dir.
-- Ai được SỬA : Admin · cờ can_manage_partner_dir (thêm, sửa, ngừng dùng).
-- Ai được XOÁ : CHỈ Admin (tiền lệ xoá nhà cung cấp, migration 030).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 116 (dùng lại caller_email / is_admin_caller / atld_email_in)
--          và 048 (bảng finance_partners cho khoá ngoại tuỳ chọn).
-- SAU KHI CHẠY: Cài đặt > Phân quyền > Cờ quyền người dùng > nhóm "Danh bạ đối tác"
--   — tích cờ cho người cần vào (Admin luôn vào được). KHÔNG tự bật cờ cho ai.
-- ============================================================

-- ─── 1. CỜ QUYỀN ───
alter table public.approval_permissions
  add column if not exists can_view_partner_dir boolean not null default false;
alter table public.approval_permissions
  add column if not exists can_manage_partner_dir boolean not null default false;

-- ─── 2. HÀM QUYẾT ĐỊNH QUYỀN ───
create or replace function public.partner_dir_can_manage()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_caller() or exists (
    select 1 from public.approval_permissions p
    where p.can_manage_partner_dir = true and public.atld_email_in(p.email)
  );
$$;

create or replace function public.partner_dir_can_view()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_caller() or exists (
    select 1 from public.approval_permissions p
    where (p.can_view_partner_dir = true or p.can_manage_partner_dir = true)
      and public.atld_email_in(p.email)
  );
$$;

revoke all on function public.partner_dir_can_manage() from public, anon;
revoke all on function public.partner_dir_can_view() from public, anon;
grant execute on function public.partner_dir_can_manage() to authenticated;
grant execute on function public.partner_dir_can_view() to authenticated;

-- Giao diện hỏi quyền 1 lần (admin = true để hiện nút Xoá).
create or replace function public.partner_dir_my_access()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'viewer',  public.partner_dir_can_view(),
    'manager', public.partner_dir_can_manage(),
    'admin',   public.is_admin_caller()
  );
$$;
revoke all on function public.partner_dir_my_access() from public, anon;
grant execute on function public.partner_dir_my_access() to authenticated;

-- ─── 3. BẢNG ───
create table if not exists public.partner_directory (
  id                  uuid primary key default gen_random_uuid(),
  -- 3 danh mục: nhà thầu phụ / nhà cung cấp / tổ đội thi công
  kind                text not null check (kind in ('nha_thau_phu', 'nha_cung_cap', 'to_doi')),
  name                text not null,                 -- tên doanh nghiệp / tên tổ đội
  short_name          text,
  tax_code            text,                          -- MST (chỉ chữ số, có thể kèm -001)
  address             text,
  website             text,
  -- Người đại diện pháp luật (khác người liên hệ)
  legal_rep_name      text,
  legal_rep_title     text,
  -- Người liên hệ
  contact_name        text,
  contact_title       text,
  phone               text,
  phone2              text,
  email               text,
  zalo                text,
  -- Khu vực: miền (Bắc/Trung/Nam/Toàn quốc) + các tỉnh/thành hoạt động
  regions             text[] not null default '{}',
  provinces           text[] not null default '{}',
  -- Năng lực
  fields              text[] not null default '{}',  -- nhóm ngành / lĩnh vực
  capability          text,                          -- mô tả năng lực, mặt hàng/dịch vụ chính
  -- Nội bộ
  rating              numeric(2,1) check (rating is null or (rating >= 0 and rating <= 5)),
  rating_note         text,
  status              text not null default 'active' check (status in ('active', 'paused', 'blacklist')),
  note                text,
  -- Liên kết tuỳ chọn sang danh mục tài chính (giai đoạn sau)
  finance_partner_id  uuid references public.finance_partners(id) on delete set null,
  created_by          text,
  updated_by          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint partner_directory_regions_chk check (regions <@ array['bac', 'trung', 'nam', 'toan_quoc']::text[])
);

-- MST là khoá nhận diện: không cho 2 dòng cùng MST (bỏ qua dòng không có MST).
create unique index if not exists partner_directory_tax_unique
  on public.partner_directory (lower(trim(tax_code)))
  where tax_code is not null and trim(tax_code) <> '';
create index if not exists partner_directory_kind_idx on public.partner_directory (kind);
create index if not exists partner_directory_status_idx on public.partner_directory (status);

-- Tự cập nhật mốc sửa.
create or replace function public.partner_directory_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists partner_directory_touch_trg on public.partner_directory;
create trigger partner_directory_touch_trg before update on public.partner_directory
  for each row execute function public.partner_directory_touch();

-- ─── 4. RLS: xoá TOÀN BỘ policy cũ (nếu có) rồi đặt whitelist mới ───
alter table public.partner_directory enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
              where schemaname = 'public' and tablename = 'partner_directory' loop
    execute format('drop policy if exists %I on public.partner_directory', pol.policyname);
  end loop;
end $$;

create policy partner_directory_read on public.partner_directory
  for select to authenticated using (public.partner_dir_can_view());
create policy partner_directory_insert on public.partner_directory
  for insert to authenticated with check (public.partner_dir_can_manage());
create policy partner_directory_update on public.partner_directory
  for update to authenticated using (public.partner_dir_can_manage()) with check (public.partner_dir_can_manage());
create policy partner_directory_delete on public.partner_directory
  for delete to authenticated using (public.is_admin_caller());

revoke all on public.partner_directory from anon, public;
grant select, insert, update, delete on public.partner_directory to authenticated;

-- ─── 5. KIỂM TRA ───
select 'cột cờ xem + sửa' as muc, count(*)::text as ket_qua from information_schema.columns
 where table_schema = 'public' and table_name = 'approval_permissions'
   and column_name in ('can_view_partner_dir', 'can_manage_partner_dir')                  -- mong đợi 2
union all
select 'policy partner_directory', count(*)::text from pg_policies
 where schemaname = 'public' and tablename = 'partner_directory'                          -- mong đợi 4
union all
select 'policy mở (true)', count(*)::text from pg_policies
 where schemaname = 'public' and tablename = 'partner_directory' and qual = 'true'        -- mong đợi 0
union all
select 'anon còn quyền bảng', count(*)::text from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'partner_directory' and grantee = 'anon'; -- mong đợi 0
