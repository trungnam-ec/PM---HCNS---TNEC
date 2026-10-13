-- ============================================================
-- 156 — DANH BẠ ĐỐI TÁC: Ô "NGUỒN" (nguồn thông tin / ai giới thiệu đối tác)
-- User yêu cầu 13/10/2026: phần Nội bộ thêm ô Nguồn để điền; "Nguồn giới thiệu" trong file Excel
-- không còn bị gộp vào Ghi chú mà lưu đúng ô này.
-- Chỉ thêm cột, RLS của 150 áp cho cả cột mới. Dữ liệu đã nhập trước đây còn dòng "Nguồn: …" nằm
-- trong Ghi chú — không tự chuyển; nạp lại từ Excel (chế độ chép đè) sẽ điền đúng ô Nguồn.
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 150.
-- ============================================================

alter table public.partner_directory add column if not exists source text;

select 'cột source' as muc, count(*)::text as ket_qua from information_schema.columns
 where table_schema = 'public' and table_name = 'partner_directory' and column_name = 'source';   -- mong đợi 1
