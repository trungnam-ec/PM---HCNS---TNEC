-- ============================================================
-- 127 — KHO BHLĐ: Ô "NCC/PVT" CỦA MÃ SP
--
-- User yêu cầu 02/10/2026: form Tạo danh mục sản phẩm thiếu thông tin NCC/PVT
-- (nhà cung cấp / Phòng Vật tư), cho gõ tay.
--
-- atld_items.ncc = nguồn cung gõ tay của mã (lưu cả khi không nhập số lượng).
-- Khi form có số lượng nhập, phiếu nhập lập kèm sẽ gắn partner_id = NCC cùng tên
-- trong atld_partners (chưa có thì giao diện tự tạo — Thủ kho có quyền ghi bảng
-- này từ 116) -> dòng Nhập ở tab Danh sách Quản lý Xuất-Nhập kho hiện tên NCC.
-- Quyền ghi/đọc theo policy atld_items sẵn có, không đổi.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- ============================================================

alter table public.atld_items
  add column if not exists ncc text;

-- KIỂM TRA: mong đợi 1
select count(*) as so_cot from information_schema.columns
 where table_schema = 'public' and table_name = 'atld_items' and column_name = 'ncc';
