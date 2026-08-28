-- ============================================================
-- 066 — CHO ADMIN / HCNS CHỈNH TAY CỘT "ĐÃ NGHỈ"
--
-- HIỆN TRẠNG:
-- Cột "Đã nghỉ" ở C&B > Chấm công > Nghỉ phép là số ĐẾM RA từ các đơn phép năm
-- ĐÃ DUYỆT trong năm nay (mỗi đơn là một dòng trong bảng `tasks`). Nhân sự đã
-- nghỉ phép TRƯỚC khi có phần mềm thì không có đơn nào -> hiện "0 ngày", không
-- cách nào nhập số đã nghỉ thực tế.
--
-- CÁCH SỬA:
-- Thêm MỘT cột ghi đè, song song với annual_leave_override (migration 054).
-- NULL = để hệ thống tự đếm như cũ; có số = CHỐT CỨNG dùng số đó (bỏ qua đếm
-- tự động cho tới khi xoá trống). "Còn lại" và giới hạn đăng ký phép ở trang
-- Lịch đều tính lại theo số này (dùng chung lib/annualLeave.ts).
--
-- QUYỀN GHI: KHÔNG cần policy mới. Migration 007 đã khoá UPDATE trên `employees`
-- sau hàm can_manage_employees_caller() (Admin trong allowed_users HOẶC cờ
-- can_manage_employees) — đúng phạm vi người dùng yêu cầu.
--
-- VÌ SAO DỰNG LẠI VIEW `employees_directory`:
-- Trang Lịch đọc view này (không đọc bảng gốc) để chặn đăng ký vượt hạn mức.
-- Cột mới phải có trong view thì Lịch mới thấy số nhập tay. Y hệt migration 056
-- đã làm cho annual_leave_override. `used_leave_override` KHÔNG phải PII nên chỉ
-- cần dựng lại view là tự có mặt. Phải DROP rồi tạo lại (không `create or
-- replace`) vì cột mới chen vào trước hai cột tính sẵn is_resigned /
-- is_excluded_from_benefits.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

alter table public.employees
  add column if not exists used_leave_override numeric;

comment on column public.employees.used_leave_override is
  'Số ngày phép năm ĐÃ NGHỈ do Admin/HCNS nhập tay. NULL = tự đếm từ đơn đã duyệt.';

-- ─── Dựng lại view `employees_directory` để có cột mới (giữ nguyên logic 056) ───
drop view if exists public.employees_directory;

do $$
declare
  cols text;
  has_notes boolean;
  resigned_expr text;
  excluded_expr text;
begin
  -- Bộ cột "không PII" — giữ nguyên đúng danh sách của migration 011.
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
  into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'employees'
    and column_name not in (
      'cccd', 'cccd_date', 'cccd_place',
      'permanent_address', 'temporary_address',
      'emergency_contact_name', 'emergency_contact_relationship',
      'emergency_contact_phone',
      'notes'
    );

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'notes'
  ) into has_notes;

  -- ── is_resigned: giữ nguyên y hệt migration 031 ──
  resigned_expr :=
    '(lower(coalesce(status, '''')) like ''%nghỉ việc%'' or lower(coalesce(status, '''')) like ''%nghi viec%'')';
  if has_notes then
    resigned_expr := resigned_expr ||
      ' or (lower(coalesce(notes, '''')) like ''%nghỉ việc%'' or lower(coalesce(notes, '''')) like ''%nghi viec%'')';
  end if;

  -- ── is_excluded_from_benefits: giữ nguyên y hệt migration 032 ──
  excluded_expr := format(
    'lower(concat_ws('' '', %s, coalesce(status, ''''))) ~ ''(kiêm nhiệm|kiem nhiem|nghỉ việc|nghi viec)''',
    case when has_notes then 'coalesce(notes, '''')' else '''''' end
  );

  execute format(
    'create view public.employees_directory as
       select %s,
              (%s) as is_resigned,
              (%s) as is_excluded_from_benefits
       from public.employees',
    cols, resigned_expr, excluded_expr
  );

  raise notice 'employees_directory dựng lại, cột = %', cols;
end $$;

-- Thu hồi TRƯỚC, cấp SAU — bẫy GRANT của view (xem 011/056): view KHÔNG chịu
-- RLS, ai được GRANT là đọc sạch, mà Supabase cấp sẵn quyền cho anon/PUBLIC trên
-- object mới trong schema public. View vừa DROP rồi tạo mới nên bước này BẮT BUỘC.
revoke all on public.employees_directory from public;
revoke all on public.employees_directory from anon;
grant select on public.employees_directory to authenticated;

-- ─── KIỂM TRA ───
-- 1) Cột mới có trong bảng employees (mong đợi: numeric, nullable YES)
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'employees'
  and column_name = 'used_leave_override';

-- 2) Cột mới đã vào view chưa (mong đợi: 1 dòng)
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'employees_directory'
  and column_name = 'used_leave_override';

-- 3) anon KHÔNG đọc được, authenticated ĐƯỢC (mong đợi đúng 1 dòng: authenticated)
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'employees_directory'
order by grantee;
