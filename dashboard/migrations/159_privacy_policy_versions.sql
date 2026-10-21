-- ============================================================
-- 159 — NỘI DUNG CHÍNH SÁCH BẢO MẬT SỬA ĐƯỢC (`privacy_policy_versions`)
--
-- MỤC ĐÍCH:
-- Admin sửa nội dung Chính sách bảo mật ngay trên giao diện (Cài đặt hệ thống >
-- Chính sách bảo mật) thay vì sửa code. Mỗi lần bấm Lưu thêm MỘT dòng mới; bản
-- hiện hành là dòng mới nhất (created_at). Bảng này là lịch sử các lần sửa.
--
-- THIẾT KẾ:
--   - body là văn bản có cú pháp rút gọn (## tiêu đề mục, - gạch đầu dòng,
--     | bảng |, **in đậm**), xem lib/privacyPolicy.ts.
--   - version là số phiên bản hiển thị. Sửa nhỏ (lỗi chính tả) giữ nguyên version
--     thì không ai phải xác nhận lại; đổi version thì mọi người phải bấm "Tôi đã
--     đọc" lại (privacy_policy_acks khoá theo version, migration 158).
--   - CHỈ GHI THÊM: không update, không delete, để giữ nguyên lịch sử.
--   - ĐỌC: mọi tài khoản đã đăng nhập. GHI: chỉ Admin (public.is_admin_caller()).
--   - Bảng TRỐNG là bình thường: giao diện dùng bản mặc định trong code.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán TOÀN BỘ > Run.
-- An toàn chạy lại nhiều lần. YÊU CẦU: đã chạy 135 (hàm is_admin_caller).
-- ============================================================

create table if not exists public.privacy_policy_versions (
  id             uuid primary key default gen_random_uuid(),
  version        text not null,
  effective_date text not null default '',
  body           text not null,
  edited_by      text not null default '',
  created_at     timestamptz not null default now(),
  constraint privacy_policy_versions_version_check check (btrim(version) <> ''),
  constraint privacy_policy_versions_body_check
    check (btrim(body) <> '' and length(body) <= 60000)
);

comment on table public.privacy_policy_versions is
  'Lịch sử nội dung Chính sách bảo mật. Dòng mới nhất là bản hiện hành. Chỉ Admin thêm, không sửa, không xoá.';

create index if not exists privacy_policy_versions_created_idx
  on public.privacy_policy_versions (created_at desc);

-- GRANT bắt buộc từ 30/10/2026
revoke all on public.privacy_policy_versions from anon;
revoke all on public.privacy_policy_versions from public;
grant select, insert on public.privacy_policy_versions to authenticated;
grant select, insert, update, delete on public.privacy_policy_versions to service_role;

alter table public.privacy_policy_versions enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'privacy_policy_versions'
  loop
    execute format('drop policy if exists %I on public.privacy_policy_versions;', pol.policyname);
  end loop;
end $$;

create policy "privacy_versions_select_all"
  on public.privacy_policy_versions for select
  to authenticated
  using (true);

create policy "privacy_versions_insert_admin"
  on public.privacy_policy_versions for insert
  to authenticated
  with check (public.is_admin_caller());

-- ─── KIỂM TRA ───
-- 1. Policy: phải đúng 2 dòng (select / insert)
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'privacy_policy_versions'
order by cmd;

-- 2. Quyền của anon: phải ra 0 dòng
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'privacy_policy_versions' and grantee = 'anon';
