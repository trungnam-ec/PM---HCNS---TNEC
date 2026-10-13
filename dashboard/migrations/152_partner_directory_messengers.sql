-- ============================================================
-- 152 — DANH BẠ ĐỐI TÁC: THÊM VIBER / WHATSAPP / TELEGRAM
-- User yêu cầu 13/10/2026: khối "Thông tin liên hệ" thêm 3 kênh nhắn tin.
-- Chỉ thêm cột, không đụng RLS (policy của 150 áp cho cả cột mới).
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 150.
-- ============================================================

alter table public.partner_directory add column if not exists viber text;
alter table public.partner_directory add column if not exists whatsapp text;
alter table public.partner_directory add column if not exists telegram text;

select 'cột viber/whatsapp/telegram' as muc, count(*)::text as ket_qua from information_schema.columns
 where table_schema = 'public' and table_name = 'partner_directory'
   and column_name in ('viber', 'whatsapp', 'telegram');   -- mong đợi 3
