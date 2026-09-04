-- ============================================================
-- 073 — NỐI PHIẾU TRÌNH KÝ → BẢNG KÊ HỒ SƠ THANH TOÁN
--
-- BỐI CẢNH:
-- Khi Giám đốc duyệt phiếu trình ký HỒ SƠ/VĂN BẢN (phiếu vào bước Kế toán), hệ
-- thống tự tạo sẵn MỘT dòng trong bảng kê `payment_dossiers` (module Kế toán) để
-- kế toán khỏi nhập lại: thông tin lấy từ phiếu, riêng số tài khoản + ngân hàng
-- tra từ Danh mục đối tác theo tên đơn vị. Việc chèn dòng làm ở client ngay sau
-- khi duyệt (components/SigningPanel.tsx -> lib/signingSubmissions.pushToPaymentDossier).
--
-- FILE NÀY chỉ thêm MỘT cột khoá nối, để phần code kia chạy IDEMPOTENT:
-- phiếu bị kế toán trả lại rồi Giám đốc duyệt LẠI sẽ KHÔNG tạo dòng thứ hai —
-- ràng buộc UNIQUE bắt trùng, client nuốt lỗi 23505.
--
-- Cột NULLABLE: mọi dòng bảng kê nhập tay từ trước (kéo–thả PDF, bóc AI) không có
-- khoá này nên vẫn để NULL — unique index bỏ qua NULL nên không đụng chúng.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> Run. An toàn chạy lại nhiều lần.
-- YÊU CẦU: đã chạy 068 (bảng payment_dossiers) và 050 (signing_submissions).
-- ============================================================

alter table public.payment_dossiers
  add column if not exists signing_submission_id uuid;

-- UNIQUE nhưng bỏ qua NULL: chỉ chặn trùng cho các dòng SINH TỪ phiếu trình ký,
-- không cản dòng nhập tay (signing_submission_id = NULL).
create unique index if not exists uq_payment_dossiers_signing
  on public.payment_dossiers (signing_submission_id)
  where signing_submission_id is not null;

-- ─── KIỂM TRA ───
-- Cột đã có, đúng kiểu uuid, cho phép NULL.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'payment_dossiers'
  and column_name = 'signing_submission_id';

-- Chỉ số unique-có-điều-kiện đã tạo (phải ra đúng 1 dòng).
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'payment_dossiers'
  and indexname = 'uq_payment_dossiers_signing';
