-- ============================================================
-- 109 — GIÁ TRỊ HĐ A-B: TÁCH THEO CÁCH GHI TRONG HỢP ĐỒNG
--
-- Tab Tổng quan > "Giá trị hợp đồng A-B (cấp dự án)" nhập đúng như Điều 9 HĐ:
--   contract_kind        loại HĐ (trọn gói / đơn giá cố định / đơn giá điều chỉnh /
--                        theo thời gian / hỗn hợp)
--   package_total_value  giá HĐ toàn gói (liên danh) — được để trống
--   package_contingency  chi phí dự phòng của liên danh (chép từ HĐ) — được để trống
--   contract_value       giá trị theo khối lượng đảm nhận, ĐÃ GỒM VAT (ô chính)
--   construction_cost    chi phí xây dựng (chép từ HĐ, đã gồm VAT)
--
-- Tính bằng công thức ở client rồi GHI LẠI vào 2 cột cũ để Dashboard dự án,
-- tab Tài chính… đọc như trước, không phải sửa:
--   contract_value_pre_vat = round(contract_value / (1 + vat_rate))
--   contingency_value      = contract_value − construction_cost
-- (Dự phòng KHÔNG tính từ %: HĐ làm tròn từng số đến nghìn, tính lại sẽ lệch.)
--
-- Dữ liệu cũ: contract_value = contract_value_pre_vat × (1 + vat_rate).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- RLS: cột mới nằm trong bảng pc_project_finance, dùng chung policy đã có (096).
-- ============================================================

alter table public.pc_project_finance add column if not exists contract_kind text;
alter table public.pc_project_finance add column if not exists package_total_value bigint;
alter table public.pc_project_finance add column if not exists package_contingency bigint;
alter table public.pc_project_finance add column if not exists contract_value bigint;
alter table public.pc_project_finance add column if not exists construction_cost bigint;

alter table public.pc_project_finance drop constraint if exists pc_project_finance_contract_kind_check;
alter table public.pc_project_finance
  add constraint pc_project_finance_contract_kind_check
  check (contract_kind is null or contract_kind in ('LUMP_SUM', 'FIXED_UNIT_PRICE', 'ADJUSTABLE_UNIT_PRICE', 'TIME_BASED', 'MIXED'));

update public.pc_project_finance
   set contract_value = round(contract_value_pre_vat * (1 + vat_rate))::bigint
 where contract_value is null and contract_value_pre_vat is not null;
