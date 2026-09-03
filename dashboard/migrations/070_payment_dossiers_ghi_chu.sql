-- ============================================================
-- 070 — HỒ SƠ THANH TOÁN: thêm cột "Ghi chú"
--
-- Thêm cột ghi_chu (text) cho payment_dossiers. Vì VIEW dùng "select *" được
-- Postgres KHAI TRIỂN THÀNH DANH SÁCH CỘT LÚC TẠO, nên thêm cột vào bảng KHÔNG
-- tự hiện trong view cũ -> phải create or replace lại view để "Tồn đề nghị" có
-- đủ cột giống Bảng kê (gồm cả ghi_chu).
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> Run. An toàn chạy lại nhiều lần.
-- Tiên quyết: migration 068 + 069 đã chạy.
-- ============================================================

alter table public.payment_dossiers
  add column if not exists ghi_chu text;

-- Dựng lại view để cuốn cả cột mới (ghi_chu) + con_lai_num.
create or replace view public.payment_dossiers_ton_de_nghi as
select *
from public.payment_dossiers
where con_lai_num > 0
order by created_at desc;

revoke all on public.payment_dossiers_ton_de_nghi from anon, public;
grant select on public.payment_dossiers_ton_de_nghi to authenticated;

-- KIỂM TRA: cột ghi_chu có trong cả bảng lẫn view (mong đợi 2 dòng)
select table_name, column_name from information_schema.columns
where table_schema='public'
  and table_name in ('payment_dossiers','payment_dossiers_ton_de_nghi')
  and column_name='ghi_chu'
order by table_name;
