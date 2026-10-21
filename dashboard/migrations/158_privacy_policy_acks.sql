-- ============================================================
-- 158 — XÁC NHẬN "TÔI ĐÃ ĐỌC" CHÍNH SÁCH BẢO MẬT (`privacy_policy_acks`)
--
-- MỤC ĐÍCH:
-- Tab "Chính sách bảo mật" trong Cài đặt hệ thống có nút "Tôi đã đọc và đã hiểu".
-- Bảng này giữ bằng chứng: ai, xác nhận phiên bản nào, lúc nào. Công ty cần nó
-- vì hệ thống có thu thập dữ liệu nhạy cảm (vị trí GPS, mẫu giọng).
--
-- THIẾT KẾ:
--   - Khoá (email, policy_version): đổi nội dung chính sách thì tăng số phiên
--     bản ở lib/privacyPolicy.ts, mọi người phải xác nhận lại bản mới. Các dòng
--     xác nhận bản cũ vẫn còn.
--   - CHỈ GHI THÊM, KHÔNG SỬA, KHÔNG XOÁ: đây là bằng chứng, không ai (kể cả
--     Admin) đổi được sau khi đã xác nhận. Vì vậy không có policy update/delete
--     và không cấp quyền update/delete.
--   - ĐỌC: mỗi người đọc dòng của chính mình; Admin đọc tất cả (để biết ai
--     chưa xác nhận).
--   - Email luôn lưu chữ thường, khớp tuyệt đối với auth.jwt() (không LIKE).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán TOÀN BỘ > Run.
-- An toàn chạy lại nhiều lần. YÊU CẦU: hàm public.is_admin_caller() đã có (135).
-- ============================================================

-- ─── 1. Bảng ───
create table if not exists public.privacy_policy_acks (
  email           text not null,
  policy_version  text not null,
  acknowledged_at timestamptz not null default now(),
  primary key (email, policy_version),
  constraint privacy_policy_acks_email_lower_check
    check (email = lower(btrim(email)) and email <> ''),
  constraint privacy_policy_acks_version_check
    check (btrim(policy_version) <> '')
);

comment on table public.privacy_policy_acks is
  'Xác nhận đã đọc Chính sách bảo mật, khoá theo (email đăng nhập, số phiên bản). Chỉ ghi thêm, không sửa, không xoá.';

-- ─── 2. GRANT (bắt buộc từ 30/10/2026: Supabase thôi tự cấp quyền bảng mới) ───
revoke all on public.privacy_policy_acks from anon;
revoke all on public.privacy_policy_acks from public;
grant select, insert on public.privacy_policy_acks to authenticated;
grant select, insert, update, delete on public.privacy_policy_acks to service_role;

-- ─── 3. RLS ───
alter table public.privacy_policy_acks enable row level security;

-- Xoá TOÀN BỘ policy cũ (quét động, không đoán tên) trước khi dựng lại.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'privacy_policy_acks'
  loop
    execute format('drop policy if exists %I on public.privacy_policy_acks;', pol.policyname);
  end loop;
end $$;

-- 3a. ĐỌC: dòng của chính mình, hoặc Admin đọc tất cả.
create policy "privacy_acks_select_self_or_admin"
  on public.privacy_policy_acks for select
  to authenticated
  using (
    (coalesce(auth.jwt() ->> 'email', '') <> '' and email = lower(auth.jwt() ->> 'email'))
    or public.is_admin_caller()
  );

-- 3b. GHI: chỉ thêm dòng mang đúng email của chính mình.
create policy "privacy_acks_insert_self"
  on public.privacy_policy_acks for insert
  to authenticated
  with check (
    coalesce(auth.jwt() ->> 'email', '') <> ''
    and email = lower(auth.jwt() ->> 'email')
  );

-- ─── 4. KIỂM TRA ───
-- 4a. Policy: phải đúng 2 dòng (select / insert)
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'privacy_policy_acks'
order by cmd;

-- 4b. Quyền của anon: phải ra 0 dòng
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'privacy_policy_acks' and grantee = 'anon';
