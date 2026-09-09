-- ============================================================
-- 074 — HỒ SƠ THANH TOÁN: chuyển tiền theo 3 đợt
--
-- "Số tiền chuyển" (so_tien_chuyen) nay là ĐỢT 1. Thêm đợt 2 (so_tien_chuyen_2)
-- và đợt 3 (so_tien_chuyen_3). "Còn lại" = Số tiền đề nghị - (đợt1 + đợt2 + đợt3).
--
-- con_lai_num là cột TÍNH SẴN (generated) nên phải DROP rồi ADD lại với công
-- thức mới. Cột này bị VIEW payment_dossiers_ton_de_nghi (select *) phụ thuộc,
-- nên trình tự bắt buộc: drop view -> drop cột -> add cột -> dựng lại view.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > Run. An toàn chạy lại nhiều lần.
-- Tiên quyết: migration 068-073 đã chạy.
-- ============================================================

-- ─── 1. Thêm cột đợt 2, đợt 3 ───
alter table public.payment_dossiers
  add column if not exists so_tien_chuyen_2 text,   -- Chuyển tiền đợt 2
  add column if not exists so_tien_chuyen_3 text;   -- Chuyển tiền đợt 3

-- ─── 2. Tính lại con_lai_num = Số tiền - tổng 3 đợt ───
drop view if exists public.payment_dossiers_ton_de_nghi;
alter table public.payment_dossiers drop column if exists con_lai_num;
alter table public.payment_dossiers
  add column con_lai_num numeric generated always as (
    coalesce(so_tien_de_nghi_num, 0)
    - coalesce(nullif(regexp_replace(coalesce(so_tien_chuyen,   ''), '[^0-9]', '', 'g'), '')::numeric, 0)
    - coalesce(nullif(regexp_replace(coalesce(so_tien_chuyen_2, ''), '[^0-9]', '', 'g'), '')::numeric, 0)
    - coalesce(nullif(regexp_replace(coalesce(so_tien_chuyen_3, ''), '[^0-9]', '', 'g'), '')::numeric, 0)
  ) stored;

-- ─── 3. Dựng lại VIEW "Tồn đề nghị" (security_invoker, lọc còn lại > 0) ───
create or replace view public.payment_dossiers_ton_de_nghi
with (security_invoker = true) as
select *
from public.payment_dossiers
where con_lai_num > 0
order by created_at desc;

revoke all on public.payment_dossiers_ton_de_nghi from anon, public;
grant select on public.payment_dossiers_ton_de_nghi to authenticated;

-- ─── 4. KIỂM TRA ───
select id, so_tien_de_nghi_num, so_tien_chuyen, so_tien_chuyen_2, so_tien_chuyen_3, con_lai_num
from public.payment_dossiers order by created_at desc limit 5;
