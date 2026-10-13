-- ============================================================
-- 153 — DANH BẠ ĐỐI TÁC: KẾT QUẢ TRA CỨU MÃ SỐ THUẾ (CỜ ĐỎ CẢNH BÁO)
-- User chốt 13/10/2026: tra MST bằng nguồn miễn phí (API công khai VietQR, dữ liệu
-- theo cơ quan thuế) và cờ đỏ khi doanh nghiệp không còn hoạt động.
-- Lưu lại KẾT QUẢ lần tra gần nhất để thẻ đối tác hiện cờ mà không phải tra lại:
--   tax_status      nguyên văn tình trạng, VD "NNT đang hoạt động"
--   tax_checked_at  thời điểm tra (dữ liệu nguồn có thể trễ vài ngày)
-- Chỉ thêm cột, RLS của 150 áp cho cả cột mới.
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 150.
-- ============================================================

alter table public.partner_directory add column if not exists tax_status text;
alter table public.partner_directory add column if not exists tax_checked_at timestamptz;

select 'cột tax_status + tax_checked_at' as muc, count(*)::text as ket_qua from information_schema.columns
 where table_schema = 'public' and table_name = 'partner_directory'
   and column_name in ('tax_status', 'tax_checked_at');   -- mong đợi 2
