-- ============================================================
-- 069 — HỒ SƠ THANH TOÁN: cột "Còn lại" tính sẵn + đổi luật "Tồn đề nghị"
--
-- "Còn lại" = "Số tiền đề nghị" - "Số tiền chuyển" (số thuần).
-- Thêm cột TÍNH SẴN (generated) con_lai_num làm nguồn sự thật, khỏi lệ thuộc
-- chuỗi con_lai người dùng gõ tay -> luôn đúng kể cả dòng cũ.
--
-- VIEW "Tồn đề nghị" đổi luật: chỉ giữ dòng CÒN LẠI > 0 (dương từ 1 trở lên).
-- Còn lại trống (chưa có Số tiền đề nghị) hoặc = 0 (đã chuyển đủ) -> KHÔNG tồn,
-- chỉ nằm ở Bảng kê. Cột hiển thị của view giữ nguyên như Bảng kê (select *).
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> Run. An toàn chạy lại nhiều lần.
-- Tiên quyết: migration 068 đã chạy.
-- ============================================================

-- ─── 1. CỘT TÍNH SẴN con_lai_num ───
-- so_tien_chuyen là TEXT ("7.900.000") -> bóc chữ số rồi ép numeric.
-- coalesce(...,0): thiếu số tiền / thiếu số tiền chuyển đều coi như 0.
alter table public.payment_dossiers
  add column if not exists con_lai_num numeric
  generated always as (
    coalesce(so_tien_de_nghi_num, 0)
    - coalesce(nullif(regexp_replace(coalesce(so_tien_chuyen, ''), '[^0-9]', '', 'g'), '')::numeric, 0)
  ) stored;

-- ─── 2. VIEW "Tồn đề nghị" — chỉ dòng Còn lại > 0 ───
create or replace view public.payment_dossiers_ton_de_nghi as
select *
from public.payment_dossiers
where con_lai_num > 0
order by created_at desc;

-- View dựng lại -> cấp quyền lại (RLS không áp cho view).
revoke all on public.payment_dossiers_ton_de_nghi from anon, public;
grant select on public.payment_dossiers_ton_de_nghi to authenticated;

-- ─── 3. KIỂM TRA ───
-- Cột con_lai_num đã có (mong đợi 1 dòng)
select column_name, data_type, is_generated from information_schema.columns
where table_schema='public' and table_name='payment_dossiers' and column_name='con_lai_num';
-- Vài dòng để soi công thức
select id, so_tien_de_nghi_num, so_tien_chuyen, con_lai_num
from public.payment_dossiers order by created_at desc limit 5;
