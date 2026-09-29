-- ============================================================
-- 110 — CHI PHÍ XÂY DỰNG CỦA LIÊN DANH
--
-- Dự phòng liên danh chuyển sang tự tính giống phần đảm nhận:
--   package_construction_cost  chi phí xây dựng toàn gói (nhập tay, chép từ HĐ)
--   package_contingency        (cột của 109) = package_total_value − package_construction_cost,
--                              client tính rồi ghi lại khi bấm Lưu.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- ============================================================

alter table public.pc_project_finance add column if not exists package_construction_cost bigint;
