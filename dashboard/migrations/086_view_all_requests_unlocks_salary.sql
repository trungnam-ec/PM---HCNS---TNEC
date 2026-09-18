-- ============================================================
-- 086 — CỜ "XEM TOÀN BỘ ĐƠN NHÂN SỰ" MỞ LUÔN LƯƠNG & HĐLĐ
--
-- LÝ DO (user chốt 18/09/2026): người HCNS giữ cờ can_view_all_requests (085)
-- phải xem & thao tác trong module Lương & Phúc lợi (C&B) ngang Admin — kể cả
-- lương, BHXH và hợp đồng lao động.
--
-- VÌ SAO PHẢI SỬA CSDL, KHÔNG CHỈ SỬA GIAO DIỆN: bảng `contracts` bị RLS khoá
-- theo đúng hàm can_view_salary_caller() (migration 018). Mở mỗi giao diện thì
-- tab Hợp đồng nhân sự hiện RỖNG — trông như hỏng, còn tệ hơn là khoá thẳng.
--
-- CÁCH VÁ: nới đúng MỘT hàm. Cả 4 policy của `contracts` (select/insert/update/
-- delete) đều gọi hàm này nên tự động theo, không phải viết lại policy nào.
--
-- ⚠ PHẠM VI: chỉ lương/HĐLĐ trong C&B. Cờ này KHÔNG mở:
--   • sửa/xoá/khoá hồ sơ nhân sự  -> cờ "Quản lý hồ sơ nhân sự"
--   • kho bảng công, phụ cấp, GPS -> cờ "Kho bảng công chấm công"
--   • duyệt chi phúc lợi          -> cờ "Duyệt chi phúc lợi"
--   • tìm kiếm AI có lương        -> cờ "Xem lương & HĐLĐ"
-- Mỗi cờ giữ đúng MỘT nghĩa. Nới thêm ở đây là tái lập đúng cái bẫy "một cờ hai
-- việc" vừa gây ra sự cố 16-18/09 (xem 084, 085).
--
-- ⚠ Giữ nguyên điều kiện "email đăng nhập KHÁC RỖNG" của 018:
-- position('' in bất_kỳ_chuỗi_nào) = 1, bỏ điều kiện này là phiên KHÔNG có danh
-- tính khớp MỌI dòng và đọc được sạch bảng lương.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ -> Run.
-- An toàn chạy lại nhiều lần. YÊU CẦU: đã chạy 018 và 085.
-- ============================================================

create or replace function public.can_view_salary_caller()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(auth.jwt() ->> 'email', '') <> ''
     and exists (
       select 1 from public.approval_permissions p
       where (p.can_view_salary = true or p.can_view_all_requests = true)
         and position(lower(auth.jwt() ->> 'email') in lower(coalesce(p.email, ''))) > 0
     );
$fn$;

-- ─── KIỂM TRA ───
-- 1. Chạy trong SQL Editor (KHÔNG có JWT) -> PHẢI ra false. Ra true là hàm hở.
select public.can_view_salary_caller() as phai_la_false;

-- 2. Ai đang mở được lương/HĐLĐ sau khi nới.
select email, can_view_salary, can_view_all_requests
from public.approval_permissions
where can_view_salary or can_view_all_requests
order by email;

-- 3. 4 policy của contracts vẫn nguyên (chúng gọi hàm trên nên tự theo).
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'contracts'
order by cmd, policyname;
