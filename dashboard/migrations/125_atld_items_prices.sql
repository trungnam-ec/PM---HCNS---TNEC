-- ============================================================
-- 125 — KHO BHLĐ: GIÁ NHẬP + GIÁ BÁN CỦA TỪNG MÃ SP
--
-- User yêu cầu 02/10/2026: nút "Tạo mới SP" ở tab Giá nhập kho, nhân viên tự
-- nhập GIÁ NHẬP và GIÁ BÁN ngay khi tạo. Hiện giá bán = giá nhập, nhưng làm sẵn
-- hai cột riêng để sau này đổi chính sách giá bán không phải làm lại.
--
-- Chỉ là GIÁ THAM KHẢO của danh mục — KHÔNG đụng sổ kho: giá vốn vẫn theo lô
-- FIFO (116), giá bán trên phiếu xuất vẫn là atld_voucher_lines.sale_price (123).
-- Quyền ghi theo policy atld_items của 116 (Thủ kho / Admin), không đổi.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 116.
-- ============================================================

alter table public.atld_items
  add column if not exists gia_nhap numeric(18,2) check (gia_nhap is null or gia_nhap >= 0),
  add column if not exists gia_ban  numeric(18,2) check (gia_ban  is null or gia_ban  >= 0);

-- KIỂM TRA: mong đợi 2
select count(*) as so_cot from information_schema.columns
 where table_schema = 'public' and table_name = 'atld_items' and column_name in ('gia_nhap', 'gia_ban');
