-- ============================================================
-- 108 — HỒ SƠ HOÀN CÔNG CHIA 3 NHÓM LỚN
--
-- Tab Vòng đời > Hồ sơ hoàn công: bỏ checklist phẳng 7 mục, chia theo 3 nhóm
--   I   Hồ sơ chuẩn bị đầu tư xây dựng và hợp đồng
--   II  Hồ sơ khảo sát, thiết kế xây dựng công trình
--   III Hồ sơ quản lý thi công xây dựng công trình
-- Danh sách mục mẫu nằm ở client (CLOSEOUT_GROUPS trong lib/projectControl.ts).
--   group_code : 'I' | 'II' | 'III'
--   item_no    : số thứ tự hiển thị — '1'…'16', ý con dạng '10.a', '10.đ'…
--                NULL = mục tự thêm tay.
--
-- XOÁ TOÀN BỘ checklist cũ (các dòng chưa có nhóm) — user đã chốt thay bằng bộ
-- mới. Gate "Hoàn thành" (pc_check_gates) giữ nguyên: đếm mọi dòng của dự án.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- Chạy xong thì push code ngay (code cũ tạo mục mẫu không có nhóm sẽ bị chặn).
-- ============================================================

alter table public.pc_closeout_items add column if not exists group_code text;
alter table public.pc_closeout_items add column if not exists item_no text;

delete from public.pc_closeout_items where group_code is null;

alter table public.pc_closeout_items alter column group_code set not null;

alter table public.pc_closeout_items drop constraint if exists pc_closeout_items_group_code_check;
alter table public.pc_closeout_items
  add constraint pc_closeout_items_group_code_check check (group_code in ('I', 'II', 'III'));

create index if not exists idx_pc_closeout_project_group on public.pc_closeout_items (project_id, group_code, sort_order);
