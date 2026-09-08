-- 074 — GIẢI TRÌNH CÔNG: thêm trạng thái "Từ chối"
-- ---------------------------------------------------------------------------
-- Trước đây bảng attendance_justifications chỉ có 2 trạng thái hợp lệ:
--   'Chưa duyệt' (chờ duyệt) và 'Đã duyệt'.
-- Nút "Từ chối" ở trang Duyệt yêu cầu lại set status = 'Chưa duyệt' — tức là
-- ĐÚNG BẰNG trạng thái chờ duyệt, nên đơn không bao giờ rời khỏi danh sách chờ
-- (bấm Từ chối hiện thông báo OK nhưng đơn vẫn nằm nguyên). Migration này mở
-- ràng buộc để chấp nhận thêm 'Từ chối', tách bạch đơn bị từ chối khỏi đơn chờ.
--
-- An toàn: chạy lại nhiều lần không sao (DROP IF EXISTS rồi ADD lại).
-- Chạy trong Supabase -> SQL Editor.

ALTER TABLE public.attendance_justifications
  DROP CONSTRAINT IF EXISTS attendance_justifications_status_check;

ALTER TABLE public.attendance_justifications
  ADD CONSTRAINT attendance_justifications_status_check
  CHECK (status IN ('Chưa duyệt', 'Chờ duyệt', 'Đã duyệt', 'Từ chối'));
