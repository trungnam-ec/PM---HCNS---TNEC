-- ============================================================
-- 134 — PHIẾU TRÌNH KÝ: THÊM LOẠI "GIẤY ĐỀ NGHỊ TẠM ỨNG" (TCKT/BM/001)
--
-- Loại thứ bảy, đi cùng luồng với 'chuyen_tien' (Cấp 1 → [PGĐ] → Giám đốc →
-- Kế toán). KHÔNG thêm cột nào: số tiền ở de_nghi_thanh_toan, tài khoản nhận ở
-- so_tai_khoan / ngan_hang, lý do ở noi_dung_trinh, "Thời gian thanh toán" ở
-- hang_muc. Chỉ cần nới CHECK của cột `loai`.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ -> Run.
-- An toàn chạy lại nhiều lần. YÊU CẦU: đã chạy 091.
-- ============================================================

alter table public.signing_submissions
  drop constraint if exists signing_submissions_loai_check;
alter table public.signing_submissions
  add constraint signing_submissions_loai_check
  check (loai in ('ho_so', 'hop_dong', 'chuyen_tien', 'to_trinh',
                  'phieu_yeu_cau', 'don_dat_hang', 'tam_ung'));
