-- ============================================================
-- 106 — QUẢN TRỊ DỰ ÁN: % GPMB KÉO TAY TRÊN THANH TIẾN TRÌNH
--
-- Tab A. Kế hoạch > Giải phóng mặt bằng: người có quyền hiện trường kéo thanh
-- % của từng lý trình theo nấc 10% (0 → 100%). Có giá trị kéo tay thì hiển thị
-- giá trị này thay cho % tự tính từ các đoạn bàn giao; xoá dòng = quay về tự tính.
--
-- Tách bảng riêng (không thêm cột vào pc_segments) vì pc_segments chỉ cho
-- pc_can_edit_structure ghi, còn GPMB là quyền hiện trường pc_can_edit_site (098).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- ============================================================

create table if not exists public.pc_gpmb_progress (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.pc_projects(id) on delete cascade,
  segment_id  uuid not null unique references public.pc_segments(id) on delete cascade,
  pct         numeric(4,3) not null check (pct >= 0 and pct <= 1),   -- 0..1, nấc 0.1
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_pc_gpmb_progress_project on public.pc_gpmb_progress (project_id);

-- RLS: xem theo dự án, ghi theo quyền hiện trường (giống pc_land_clearance).
do $$
declare pol record;
begin
  alter table public.pc_gpmb_progress enable row level security;
  revoke all on public.pc_gpmb_progress from anon;
  grant select, insert, update, delete on public.pc_gpmb_progress to authenticated;
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'pc_gpmb_progress' loop
    execute format('drop policy if exists %I on public.pc_gpmb_progress', pol.policyname);
  end loop;
end $$;

create policy pc_gpmb_progress_select on public.pc_gpmb_progress for select to authenticated
  using (public.pc_can_view_project(project_id));
create policy pc_gpmb_progress_write on public.pc_gpmb_progress for all to authenticated
  using (public.pc_can_edit_site(project_id)) with check (public.pc_can_edit_site(project_id));

-- Trigger: lý trình đúng dự án + updated_at + nhật ký (dùng lại hàm của 096/098).
drop trigger if exists trg_pc_gpmb_progress_segchk on public.pc_gpmb_progress;
create trigger trg_pc_gpmb_progress_segchk before insert or update on public.pc_gpmb_progress
  for each row execute function public.pc_check_segment_project();
drop trigger if exists trg_pc_gpmb_progress_touch on public.pc_gpmb_progress;
create trigger trg_pc_gpmb_progress_touch before update on public.pc_gpmb_progress
  for each row execute function public.pc_touch_updated_at();
drop trigger if exists trg_pc_gpmb_progress_audit on public.pc_gpmb_progress;
create trigger trg_pc_gpmb_progress_audit after insert or update or delete on public.pc_gpmb_progress
  for each row execute function public.pc_audit_trigger();
