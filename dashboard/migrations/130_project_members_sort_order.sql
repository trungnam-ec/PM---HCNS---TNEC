-- ============================================================
-- 130 — THỨ TỰ THÀNH VIÊN DỰ ÁN (kéo thả dòng)
--
-- Tab Thành viên cho kéo thả dòng lên/xuống; thứ tự lưu ở cột sort_order.
-- Dòng cũ được đánh số theo thứ tự tạo hiện tại nên giao diện không đổi.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- ============================================================

alter table public.pc_project_members add column if not exists sort_order integer not null default 0;

update public.pc_project_members m
set sort_order = r.rn
from (
  select id, row_number() over (partition by project_id order by created_at, id) as rn
  from public.pc_project_members
) r
where m.id = r.id and m.sort_order = 0;

-- KIỂM TRA: có cột sort_order
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'pc_project_members' and column_name = 'sort_order';
