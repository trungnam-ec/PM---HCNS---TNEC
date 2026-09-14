-- ============================================================
-- 075 — NỐI DÒNG KẾ HOẠCH TC → PHIẾU TRÌNH KÝ
--
-- "Trình ký online" trên một dòng Kế hoạch thu chi (chỉ dòng CHI) tạo một phiếu
-- trình ký (loại hồ sơ/văn bản) đi theo luồng 074 (Trưởng bộ phận → PGĐ tùy chọn
-- → Giám đốc → Kế toán). File này chỉ thêm CỘT KHOÁ NỐI để:
--   1. Mỗi dòng chỉ trình 1 lần (unique, bỏ qua NULL).
--   2. Hiện trạng thái phiếu ngay trên dòng kế hoạch (join sang signing_submissions).
--
-- Cột NULLABLE: dòng chưa trình = NULL. Việc chèn/khoá làm ở client
-- (components/FinancePlanPanel.tsx). RLS finance_plans của 058/065 giữ nguyên
-- (chủ dòng tự sửa dòng mình) nên không cần policy mới.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> Run. An toàn chạy lại nhiều lần.
-- YÊU CẦU: đã chạy 058 (finance_plans), 074 (signing route).
-- ============================================================

alter table public.finance_plans
  add column if not exists signing_submission_id uuid;

create unique index if not exists uq_finance_plans_signing
  on public.finance_plans (signing_submission_id)
  where signing_submission_id is not null;

-- KIỂM TRA: cột đã có, đúng uuid, nullable.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='finance_plans'
  and column_name='signing_submission_id';
