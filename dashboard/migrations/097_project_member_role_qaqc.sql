-- ============================================================
-- 097 — Quản trị dự án: thêm vai trò QA/QC vào thành viên dự án
--
-- QA_QC = cán bộ quản lý chất lượng của BĐH. Quyền như Kỹ sư hiện trường:
-- XEM khung dự án, KHÔNG thấy tiền, không sửa lý trình/hợp đồng (các hàm quyền
-- của 096 không liệt kê QA_QC nên không cần sửa hàm nào).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- ============================================================

alter table public.pc_project_members
  drop constraint if exists pc_project_members_role_check;

alter table public.pc_project_members
  add constraint pc_project_members_role_check
  check (role in ('GDDA','CHT','QS','QA_QC','VP_BDH','KY_SU','TC_KT'));

-- KIỂM TRA: phải thấy QA_QC trong định nghĩa ràng buộc
select pg_get_constraintdef(oid) as rang_buoc
from pg_constraint
where conname = 'pc_project_members_role_check';
