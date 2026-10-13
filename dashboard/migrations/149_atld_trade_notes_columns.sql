-- ============================================================
-- 149 — KHO BHLĐ: CỘT GHI CHÚ + CỘT TỰ THÊM (tab "Danh sách Quản lý Xuất-Nhập kho")
--
-- User yêu cầu 13/10/2026: thêm cột Ghi chú sau cột Trạng thái cho chỉnh tay, và nút
-- chèn cột tự do để tự điền thêm dữ liệu.
-- Danh sách này gộp dòng "Excel cũ" + dòng từ PHIẾU (view atld_trade_prices), nên ghi chú
-- KHÔNG thêm vào bảng nguồn mà lưu riêng, khoá theo "nguon-id" của dòng (VD excel-<uuid>).
--   • atld_trade_columns : danh sách cột tự thêm (tên, thứ tự) — dùng chung mọi người
--   • atld_trade_notes   : mỗi dòng 1 bản ghi: note (cột Ghi chú) + extra (jsonb {id_cột: giá trị})
-- Ai sửa / thêm cột: Thủ kho ATLĐ, TP/PP ATLĐ, Admin. Xoá cột: CHỈ TP/PP (cờ duyệt xuất) + Admin.
-- Chỉ là dữ liệu ghi chú — KHÔNG ảnh hưởng tồn kho / giá.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 116, 120, 121.
-- ============================================================

create table if not exists public.atld_trade_columns (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  sort_order  int  not null default 0,
  created_by  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.atld_trade_notes (
  row_key     text primary key,                 -- "excel-<id>" | "phieu-<id>"
  note        text,
  extra       jsonb not null default '{}'::jsonb,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

create or replace function public.atld_trade_cols_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.title := left(trim(coalesce(new.title, '')), 80);
  if new.title = '' then raise exception 'Tên cột không được để trống'; end if;
  if tg_op = 'INSERT' then new.created_by := public.caller_email(); end if;
  return new;
end;
$$;
drop trigger if exists atld_trade_cols_stamp on public.atld_trade_columns;
create trigger atld_trade_cols_stamp before insert or update on public.atld_trade_columns
  for each row execute function public.atld_trade_cols_stamp();

create or replace function public.atld_trade_notes_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_by := public.caller_email();
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists atld_trade_notes_stamp on public.atld_trade_notes;
create trigger atld_trade_notes_stamp before insert or update on public.atld_trade_notes
  for each row execute function public.atld_trade_notes_stamp();

alter table public.atld_trade_columns enable row level security;
alter table public.atld_trade_notes   enable row level security;

-- Xoá TOÀN BỘ policy cũ (nếu chạy lại) rồi dựng whitelist mới.
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
            where schemaname = 'public' and tablename in ('atld_trade_columns', 'atld_trade_notes')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy atld_trade_columns_read   on public.atld_trade_columns for select to authenticated using (true);
create policy atld_trade_columns_insert on public.atld_trade_columns for insert to authenticated
  with check (public.atld_is_keeper() or public.atld_is_approver());
create policy atld_trade_columns_update on public.atld_trade_columns for update to authenticated
  using (public.atld_is_keeper() or public.atld_is_approver())
  with check (public.atld_is_keeper() or public.atld_is_approver());
create policy atld_trade_columns_delete on public.atld_trade_columns for delete to authenticated
  using (public.atld_is_approver());

create policy atld_trade_notes_read   on public.atld_trade_notes for select to authenticated using (true);
create policy atld_trade_notes_insert on public.atld_trade_notes for insert to authenticated
  with check (public.atld_is_keeper() or public.atld_is_approver());
create policy atld_trade_notes_update on public.atld_trade_notes for update to authenticated
  using (public.atld_is_keeper() or public.atld_is_approver())
  with check (public.atld_is_keeper() or public.atld_is_approver());

revoke all on public.atld_trade_columns, public.atld_trade_notes from anon, public;
grant select, insert, update, delete on public.atld_trade_columns to authenticated;
grant select, insert, update on public.atld_trade_notes to authenticated;

-- KIỂM TRA: mong đợi 4 policy cho atld_trade_columns, 3 cho atld_trade_notes
select tablename, policyname, cmd from pg_policies
 where schemaname = 'public' and tablename in ('atld_trade_columns', 'atld_trade_notes')
 order by tablename, cmd;
