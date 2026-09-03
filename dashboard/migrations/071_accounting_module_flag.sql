-- ============================================================
-- 071 — Cờ `can_view_accounting` (module Kế toán > Hồ sơ thanh toán)
--
-- Module Kế toán (/ke-toan/ho-so-thanh-toan) BẮT BUỘC CỜ: Admin luôn thấy, người
-- khác phải được cấp cờ này mới vào (requireFlag trong lib/access.ts, giống cách
-- module Báo cáo dùng can_view_reports).
--
-- Cấp/thu hồi tại: Cài đặt > Phân quyền > Cờ quyền người dùng (mục "Kế toán —
-- Hồ sơ thanh toán", ngay dưới "Hồ sơ trình ký").
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > Run. An toàn chạy lại nhiều lần.
-- Tiên quyết: đã có bảng approval_permissions.
-- ============================================================

-- ─── 1. Thêm cột cờ ───
alter table public.approval_permissions
  add column if not exists can_view_accounting boolean not null default false;

-- ─── 2. KIỂM TRA ───
select name, email, can_view_accounting
from public.approval_permissions
where can_view_accounting = true
order by name;
