-- 075: Tách bảng chi phí quản lý hành chính theo NĂM
-- Trước đây bảng admin_monthly_reports chỉ có m1..m12 (ngầm hiểu là năm 2026),
-- không có cột năm nên không thể lưu dữ liệu cho các năm khác.
-- Migration này thêm cột `year` và gán toàn bộ dữ liệu hiện có về năm 2026.
--
-- Chạy trong: Supabase -> SQL Editor -> New Query -> dán toàn bộ -> Run.

-- 1. Thêm cột năm, mặc định 2026 để các dòng đang có tự động thuộc năm 2026
ALTER TABLE public.admin_monthly_reports
  ADD COLUMN IF NOT EXISTS year INTEGER NOT NULL DEFAULT 2026;

-- 2. Đảm bảo mọi dòng cũ (nếu có dòng nào NULL do dữ liệu lệch) đều là 2026
UPDATE public.admin_monthly_reports
  SET year = 2026
  WHERE year IS NULL;

-- 3. Chỉ mục để lọc nhanh theo năm
CREATE INDEX IF NOT EXISTS idx_admin_monthly_reports_year
  ON public.admin_monthly_reports (year);
