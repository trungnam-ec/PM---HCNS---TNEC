-- ============================================================
-- 132 — HƯỚNG DẪN EOP (video dán link, không upload)
--
-- Mỗi dòng = một PHẦN hướng dẫn (Phần 1, 2, 3...) trỏ tới video có sẵn trên
-- YouTube / Google Drive. Hệ thống chỉ lưu link, không lưu tệp.
--
-- QUYỀN:
--   XEM   — mọi tài khoản đã đăng nhập.
--   GHI   — Admin hoặc cờ can_manage_news (dùng lại hàm caller_can_manage_news
--           của migration 023, không thêm cờ mới).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

create table if not exists public.eop_guides (
  id          uuid primary key default gen_random_uuid(),
  sort_order  integer not null default 0,
  title       text not null,
  description text,
  video_url   text not null,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists eop_guides_order_idx
  on public.eop_guides (sort_order, created_at);

alter table public.eop_guides enable row level security;

-- Xoá sạch policy cũ (không đoán tên) rồi dựng whitelist.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'eop_guides'
  loop
    execute format('drop policy if exists %I on public.eop_guides;', pol.policyname);
  end loop;
end $$;

create policy "eop_guides select authenticated"
  on public.eop_guides for select to authenticated
  using (true);

create policy "eop_guides insert editor"
  on public.eop_guides for insert to authenticated
  with check (public.caller_can_manage_news());

create policy "eop_guides update editor"
  on public.eop_guides for update to authenticated
  using (public.caller_can_manage_news())
  with check (public.caller_can_manage_news());

create policy "eop_guides delete editor"
  on public.eop_guides for delete to authenticated
  using (public.caller_can_manage_news());

-- Kiểm tra: phải ra đúng 4 dòng
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'eop_guides'
order by cmd;
