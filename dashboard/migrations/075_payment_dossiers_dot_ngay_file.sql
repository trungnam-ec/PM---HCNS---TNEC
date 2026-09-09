-- ============================================================
-- 075 — HỒ SƠ THANH TOÁN: ngày cho từng đợt chuyển + file gốc đính kèm
--
-- 1) Mỗi đợt chuyển tiền lưu thêm NGÀY chuyển: ngay_chuyen_1/2/3 (text, dạng
--    YYYY-MM-DD từ ô chọn ngày, hiển thị DD/MM/YYYY).
-- 2) file_goc_path: đường dẫn file gốc (ảnh/PDF) trong bucket payment-dossiers,
--    lưu vĩnh viễn dưới thư mục files/ (khác thư mục tmp/ bị route xoá). Người
--    dùng bấm nút mũi tên tải lên, sau đó xem bằng popup giữa màn hình.
--
-- VIEW "Tồn đề nghị" (select *) khai triển cột lúc tạo -> phải dựng lại để có
-- các cột mới.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > Run. An toàn chạy lại nhiều lần.
-- Tiên quyết: migration 068-074 đã chạy.
-- ============================================================

alter table public.payment_dossiers
  add column if not exists ngay_chuyen_1 text,
  add column if not exists ngay_chuyen_2 text,
  add column if not exists ngay_chuyen_3 text,
  add column if not exists file_goc_path text;

-- Dựng lại view để cuốn các cột mới.
create or replace view public.payment_dossiers_ton_de_nghi
with (security_invoker = true) as
select *
from public.payment_dossiers
where con_lai_num > 0
order by created_at desc;

revoke all on public.payment_dossiers_ton_de_nghi from anon, public;
grant select on public.payment_dossiers_ton_de_nghi to authenticated;

-- KIỂM TRA: các cột mới có trong cả bảng lẫn view (mong đợi 8 dòng)
select table_name, column_name from information_schema.columns
where table_schema='public'
  and table_name in ('payment_dossiers','payment_dossiers_ton_de_nghi')
  and column_name in ('ngay_chuyen_1','ngay_chuyen_2','ngay_chuyen_3','file_goc_path')
order by table_name, column_name;
