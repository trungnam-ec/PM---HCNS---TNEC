-- ============================================================
-- 068 — HỒ SƠ THANH TOÁN (module Kế toán)
--
-- Thay 2 sheet Google ("Bảng kê" + "Tồn đề nghị") bằng 1 bảng Supabase.
-- Kế toán kéo–thả PDF/ảnh "Phiếu đề nghị thanh toán", AI (route
-- /api/analyze-payment-dossier) bóc 11 trường, người dùng soát rồi LƯU vào bảng
-- này. Các cột kế toán tự nhập sau (Số tiền chuyển / Ngày chuyển / Còn lại) sửa
-- trực tiếp trong danh sách.
--
-- "Tồn đề nghị" KHÔNG phải bảng riêng — chỉ là VIEW lọc các dòng chưa chuyển
-- tiền (chưa có Ngày chuyển hoặc chưa điền Số tiền chuyển).
--
-- Đây là SỔ CHUNG của phòng Kế toán/Hành chính: mọi người đăng nhập cùng thấy
-- và cùng sửa (giống bảng Google trước đây). Không tách theo người tạo.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> Run. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. BẢNG CHÍNH ───
create table if not exists public.payment_dossiers (
  id                  bigint generated always as identity primary key,
  stt                 integer,          -- A: số thứ tự (kế toán tự đánh, tuỳ chọn)
  ngay_nhap           text,             -- B: DD/MM/YYYY (client sinh khi lưu)
  ngay_de_nghi        text,             -- C: AI
  nguoi_nhan_tien     text,             -- D: AI
  noi_dung_tt         text,             -- E: AI
  so_tien_de_nghi     text,             -- F: AI, dạng "7.900.000"
  so_tien_de_nghi_num numeric,          -- F': số thuần để tính/sort
  du_an               text,             -- G: AI
  nguoi_de_nghi_tt    text,             -- H: AI
  don_vi_cong_tac     text,             -- I: AI
  so_tai_khoan        text,             -- J: AI
  tai_ngan_hang       text,             -- K: AI
  so_tien_chuyen      text,             -- L: kế toán nhập sau
  han_thanh_toan      text,             -- M: AI / kế toán
  ngay_chuyen         text,             -- N: kế toán nhập sau
  con_lai             text,             -- O: kế toán nhập sau
  ten_file_pdf        text,             -- P: tên file gốc (client gắn)
  danh_muc_hs         text,             -- Q: AI
  validation_scores   jsonb,            -- điểm tin cậy từng trường (AI)
  created_by          text,             -- email người lưu (audit, không dùng để phân quyền)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_payment_dossiers_created on public.payment_dossiers (created_at desc);
create index if not exists idx_payment_dossiers_ngay_de_nghi on public.payment_dossiers (ngay_de_nghi);

-- ─── 2. TỰ CẬP NHẬT updated_at ───
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_payment_dossiers_updated_at on public.payment_dossiers;
create trigger trg_payment_dossiers_updated_at
  before update on public.payment_dossiers
  for each row execute function public.set_updated_at();

-- ─── 3. VIEW "Tồn đề nghị" ───
-- Dòng CHƯA chuyển tiền: chưa điền Ngày chuyển HOẶC chưa điền Số tiền chuyển.
create or replace view public.payment_dossiers_ton_de_nghi as
select *
from public.payment_dossiers
where coalesce(nullif(trim(ngay_chuyen), ''), '') = ''
   or coalesce(nullif(trim(so_tien_chuyen), ''), '') = ''
order by created_at desc;

-- ─── 4. RLS ───
-- Sổ CHUNG nội bộ: mọi tài khoản đã đăng nhập (authenticated) đọc/ghi/sửa/xoá.
-- anon (chưa đăng nhập) KHÔNG có quyền gì.
alter table public.payment_dossiers enable row level security;
revoke all on public.payment_dossiers from anon;

do $$ declare pol record; begin
  for pol in select policyname from pg_policies
             where schemaname='public' and tablename='payment_dossiers'
  loop execute format('drop policy if exists %I on public.payment_dossiers', pol.policyname); end loop;
end $$;

create policy "pd_select_auth" on public.payment_dossiers
  for select to authenticated using (true);
create policy "pd_insert_auth" on public.payment_dossiers
  for insert to authenticated with check (true);
create policy "pd_update_auth" on public.payment_dossiers
  for update to authenticated using (true) with check (true);
create policy "pd_delete_auth" on public.payment_dossiers
  for delete to authenticated using (true);

-- ─── 5. GRANT cho VIEW ───
-- RLS KHÔNG áp cho view: phải REVOKE anon/public rồi mới GRANT authenticated,
-- nếu không anon (khoá công khai) đọc lọt qua view dù bảng gốc đã khoá.
revoke all on public.payment_dossiers_ton_de_nghi from anon, public;
grant select on public.payment_dossiers_ton_de_nghi to authenticated;

-- ─── 6. KIỂM TRA ───
-- 1) anon KHÔNG có quyền gì trên bảng (mong đợi rỗng)
select grantee, privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name='payment_dossiers' and grantee='anon';
-- 2) authenticated đọc được view (mong đợi có dòng 'authenticated','SELECT')
select grantee, privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name='payment_dossiers_ton_de_nghi' and grantee='authenticated';
