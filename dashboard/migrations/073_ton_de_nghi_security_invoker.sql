-- ============================================================
-- 073 — Vá cảnh báo Supabase "Security Definer View"
--
-- Supabase linter cảnh báo CRITICAL: view public.payment_dossiers_ton_de_nghi
-- chạy theo SECURITY DEFINER (mặc định) -> truy vấn bằng quyền của NGƯỜI TẠO
-- view (postgres), bỏ qua RLS của người đang xem.
--
-- FIX: bật security_invoker = true (Postgres 15+, Supabase hỗ trợ) -> view chạy
-- ĐÚNG RLS của người truy vấn. Bảng gốc payment_dossiers đã bật RLS (authenticated
-- đọc/ghi, anon bị chặn), nên view giờ kế thừa đúng luật đó.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > Run. An toàn chạy lại nhiều lần.
-- Tiên quyết: migration 068-070 đã chạy (view + cột con_lai_num + ghi_chu).
-- ============================================================

create or replace view public.payment_dossiers_ton_de_nghi
with (security_invoker = true) as
select *
from public.payment_dossiers
where con_lai_num > 0
order by created_at desc;

-- Cấp quyền lại (RLS không áp cho view; anon vẫn phải chặn).
revoke all on public.payment_dossiers_ton_de_nghi from anon, public;
grant select on public.payment_dossiers_ton_de_nghi to authenticated;

-- KIỂM TRA: view đã bật security_invoker (mong đợi thấy 'security_invoker=true')
select c.relname, c.reloptions
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'payment_dossiers_ton_de_nghi';
