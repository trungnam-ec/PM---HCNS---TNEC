-- ============================================================
-- 090 — AI ĐƯỢC LẬP PHIẾU TRÌNH KÝ: MỞ CHO MỌI NGƯỜI CÓ TRONG DANH BẠ
--
-- LÝ DO (user chốt 22/09/2026): module Hồ sơ trình ký chuyển xuống gói Basic để
-- ai cũng dùng được. Nhưng gói chỉ mở CỬA — nút "Lập phiếu" vẫn đòi cờ
-- `can_create_signing`, nên nhân viên chưa được cấp vào trang chỉ thấy danh sách
-- rỗng. Từ nay: có tên trong danh bạ nhân sự VÀ chưa nghỉ việc là lập được phiếu.
-- Cờ `can_create_signing` GIỮ LẠI làm đường cấp riêng cho tài khoản không nằm
-- trong bảng `employees` (tài khoản dùng chung, cộng tác viên…).
--
-- ⚠⚠ PHẢI CHẠY 089 TRƯỚC FILE NÀY. `can_create_signing_caller()` là một vế của
-- `signing_is_participant()`, mà policy đọc kho tệp CŨ (051) dựa vào hàm đó —
-- chạy 090 trước thì trong khoảng thời gian ở giữa, MỌI nhân viên đọc được TOÀN
-- BỘ tệp đính kèm của mọi phòng ban. 089 thay policy đó bằng luật "đọc được tệp
-- khi đọc được phiếu", nên chạy đúng thứ tự là không có cửa sổ hở nào.
--
-- KHÔNG đụng phạm vi XEM phiếu: `signing_select` (074) giữ nguyên — người lập
-- thấy phiếu của mình, Trưởng/Phó phòng thấy cả phòng mình. Lập được phiếu ≠
-- thấy phiếu người khác.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ -> Run.
-- An toàn chạy lại nhiều lần. YÊU CẦU: đã chạy 050, 051, 074, 089.
-- ============================================================

-- ─── 1. GIỮ LUẬT CŨ CHO HÀM TRA LUỸ KẾ ───
-- `luy_ke_da_thanh_toan()` (050) là SECURITY DEFINER, nó ĐỌC XUYÊN RLS để cộng
-- các đợt trước của một hợp đồng — kể cả đợt do phòng khác lập. Chốt chặn duy
-- nhất của nó là `signing_is_participant()`.
--
-- Sau mục 2 bên dưới, hàm participant đó sẽ đúng với MỌI nhân viên. Để nguyên
-- thì bất kỳ ai cũng dò ra được tổng giá trị đã thanh toán của bất kỳ hợp đồng
-- nào, chỉ cần đoán số hợp đồng — đúng cái rủi ro mà ghi chú ở 050 đã cảnh báo.
-- Vì vậy tách một hàm mang ĐÚNG ngữ nghĩa cũ (Admin / có cờ lập phiếu / giữ cờ
-- duyệt) và trỏ hàm luỹ kế vào đó.
create or replace function public.signing_has_stage_or_flag()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin_caller()
      or (public.caller_email() <> '' and exists (
            select 1 from public.approval_permissions p
            where p.can_create_signing = true
              and position(public.caller_email() in lower(coalesce(p.email, ''))) > 0))
      or coalesce(array_length(public.signing_stages_of_caller(), 1), 0) > 0;
$$;

grant execute on function public.signing_has_stage_or_flag() to authenticated;

-- ⚠ CHỮ KÝ PHẢI CHÉP Y NGUYÊN BẢN 050, KỂ CẢ `default 0`. Thiếu nó thì
-- PostgreSQL từ chối với 42P13 ("cannot remove parameter defaults from existing
-- function") — `create or replace` được đổi thân hàm nhưng KHÔNG được bỏ giá trị
-- mặc định của tham số.
create or replace function public.luy_ke_da_thanh_toan(
  p_hop_dong_so text,
  p_dot_so      integer,
  p_dot_nay     numeric default 0
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.signing_has_stage_or_flag() then null
    else coalesce((
      select sum(s.de_nghi_thanh_toan)
      from public.signing_submissions s
      where s.hop_dong_so = p_hop_dong_so
        and s.dot_so < p_dot_so
        and s.status not in ('tra_lai','nhap')
    ), 0) + coalesce(p_dot_nay, 0)
  end;
$$;

-- ─── 2. MỞ QUYỀN LẬP PHIẾU ───
-- Điều kiện "chưa nghỉ việc" chép đúng biểu thức của view `employees_directory`
-- (migration 031): dò CẢ `status` LẪN `notes`, vì rất nhiều hồ sơ cũ chỉ đánh
-- dấu nghỉ việc ở cột Ghi chú. Hàm là SECURITY DEFINER nên đọc được `notes` dù
-- view cố ý không trả cột đó ra ngoài (PII, migration 011).
create or replace function public.can_create_signing_caller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.caller_email() <> '' and (
    -- (a) Có tên trong danh bạ nhân sự và chưa nghỉ việc.
    exists (
      select 1 from public.employees e
      where position(public.caller_email() in lower(coalesce(e.email, ''))) > 0
        and not (
             lower(coalesce(e.status, '')) like '%nghỉ việc%'
          or lower(coalesce(e.status, '')) like '%nghi viec%'
          or lower(coalesce(e.notes,  '')) like '%nghỉ việc%'
          or lower(coalesce(e.notes,  '')) like '%nghi viec%'
        )
    )
    -- (b) Hoặc được cấp cờ riêng — đường vào cho tài khoản ngoài danh bạ.
    or exists (
      select 1 from public.approval_permissions p
      where p.can_create_signing = true
        and position(public.caller_email() in lower(coalesce(p.email, ''))) > 0
    )
  );
$$;

-- ─── 3. KIỂM TRA ───
-- 3a. Policy đọc kho tệp PHẢI là bản "scoped" của 089 — nếu ở đây vẫn thấy
--     "signing dossier select participant" thì DỪNG LẠI và chạy 089 ngay.
select policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'signing dossier%'
order by cmd, policyname;

-- 3b. Bao nhiêu người từ nay lập được phiếu (đếm theo danh bạ, chưa nghỉ việc).
select
  count(*) filter (where coalesce(btrim(email), '') <> '') as co_email,
  count(*) filter (
    where coalesce(btrim(email), '') <> ''
      and not (
           lower(coalesce(status, '')) like '%nghỉ việc%'
        or lower(coalesce(status, '')) like '%nghi viec%'
        or lower(coalesce(notes,  '')) like '%nghỉ việc%'
        or lower(coalesce(notes,  '')) like '%nghi viec%')
  ) as lap_duoc_phieu
from public.employees;

-- 3c. Phạm vi XEM không đổi — policy select vẫn là bản 074.
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'signing_submissions'
order by cmd, policyname;
