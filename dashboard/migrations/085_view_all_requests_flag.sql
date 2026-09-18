-- ============================================================
-- 085 — CỜ XEM TOÀN BỘ ĐƠN NHÂN SỰ (công tác · nghỉ phép · giải trình)
--
-- LÝ DO (user chốt 18/09/2026):
-- Ba cờ can_approve_trip / can_approve_leave / can_approve_justification vừa là
-- QUYỀN DUYỆT CUỐI, vừa là CÔNG TẮC bật cấp 2 (chốt 16/09). Hệ quả ngoài ý muốn:
-- Admin bỏ tick để rút luồng xuống 1 cấp thì người HCNS mất luôn TẦM NHÌN — họ
-- tụt xuống ngang nhân viên thường, không còn thấy đơn của công ty để làm bảng
-- công. Muốn cho họ xem thì buộc phải tick cờ, mà tick cờ là luồng lập tức quay
-- lại 2 cấp cho TẤT CẢ mọi người.
--
-- Chính ghi chú trong lib/approvers.ts đã lường trước chuyện này:
--   "Cần cho xem mà không bật cấp 2 thì phải làm cờ khác."
-- Đây chính là cờ đó — TÁCH HẲN việc XEM khỏi việc DUYỆT.
--
-- MỘT cờ cho CẢ BA luồng (user chốt): người làm nhân sự cần cả ba để lên bảng
-- công, không có tình huống chỉ cần một loại. Tách ba cờ chỉ tạo thêm ba chỗ để
-- quên tick.
--
-- ⚠ Cờ này CHỈ CHO XEM. Nó KHÔNG hiện nút Duyệt / Từ chối và KHÔNG bật lại cấp
-- 2. Ai cần duyệt cuối thì vẫn phải tick cờ ở nhóm "Quyền phê duyệt".
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ -> Run.
-- An toàn chạy lại nhiều lần.
-- ============================================================

alter table public.approval_permissions
  add column if not exists can_view_all_requests boolean not null default false;

comment on column public.approval_permissions.can_view_all_requests is
  'CHI XEM toan bo don cong tac + nghi phep + giai trinh cua cong ty. Khong phai quyen duyet, khong bat cap 2 (085).';

-- ─── KIỂM TRA ───
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'approval_permissions'
  and column_name = 'can_view_all_requests';

-- Đối chiếu: ai giữ cờ DUYỆT cuối (rỗng = luồng 1 cấp) và ai giữ cờ XEM.
select email, can_approve_trip, can_approve_leave, can_approve_justification,
       can_view_all_requests
from public.approval_permissions
order by email;
