-- Lệnh SQL bổ sung cột Ghi chú (notes) cho bảng candidates trên Supabase
-- Vui lòng truy cập trang Supabase -> SQL Editor -> Tạo truy vấn mới, dán đoạn code này và nhấn Run.

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS notes TEXT;
