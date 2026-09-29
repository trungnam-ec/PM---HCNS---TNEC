-- ============================================================
-- 111 — TAB THÀNH VIÊN THÀNH DANH SÁCH NHÂN SỰ DỰ ÁN
--
-- Thêm các cột mô tả (KHÔNG ảnh hưởng phân quyền):
--   unit_group     Nhóm đơn vị (gõ tay)
--   department     Phòng ban/Bộ phận  ┐ chụp từ danh bạ nhân sự lúc thêm
--   title          Chức danh          │
--   phone          SĐT                │
--   contact_email  Email liên hệ      ┘ (ưu tiên mail công ty)
--   project_role   Vai trò trong dự án (gõ tay)
--   duty           Nhiệm vụ (gõ tay)
--   reports_to     Quản lý/Báo cáo (gõ tay)
--   status         Trạng thái: NOT_JOINED / JOINED / CONCURRENT / COMPANY_LEVEL
--                  CHỈ ĐỂ HIỂN THỊ — "Chưa tham gia" vẫn giữ quyền (user chốt 29/09).
--
-- Cột `role` cũ giữ nguyên = "Quyền hệ thống" (GDDA/CHT/QS…); các hàm quyền
-- vẫn đọc cột này. Cột `email` giữ nguyên = email đăng nhập để khớp quyền.
-- Cờ quyền toàn công ty (approval_permissions) vẫn được ưu tiên như cũ.
-- RLS: dùng chung policy pc_members_* đã có (096) — FOR ALL nên sửa được.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- ============================================================

alter table public.pc_project_members add column if not exists unit_group text;
alter table public.pc_project_members add column if not exists department text;
alter table public.pc_project_members add column if not exists title text;
alter table public.pc_project_members add column if not exists phone text;
alter table public.pc_project_members add column if not exists contact_email text;
alter table public.pc_project_members add column if not exists project_role text;
alter table public.pc_project_members add column if not exists duty text;
alter table public.pc_project_members add column if not exists reports_to text;
alter table public.pc_project_members add column if not exists status text not null default 'JOINED';

alter table public.pc_project_members drop constraint if exists pc_project_members_status_check;
alter table public.pc_project_members
  add constraint pc_project_members_status_check
  check (status in ('NOT_JOINED', 'JOINED', 'CONCURRENT', 'COMPANY_LEVEL'));
