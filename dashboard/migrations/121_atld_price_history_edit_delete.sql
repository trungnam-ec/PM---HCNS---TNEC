-- ============================================================
-- 121 — KHO BHLĐ: SỬA TAY + XOÁ DÒNG LỊCH SỬ GIÁ (tab "Giá nhập kho")
--
-- User yêu cầu 02/10/2026:
--   • Số liệu trong bảng cho chỉnh tay  -> thêm policy UPDATE.
--     Ai sửa: Thủ kho ATLĐ, TP/PP ATLĐ (cờ duyệt xuất kho), Admin.
--   • Xoá: CHỈ TP/PP có cờ "Duyệt xuất kho ATLĐ" + Admin (116: atld_is_approver).
--     Bản 120 cho Thủ kho xoá -> siết lại.
-- Chỉ áp cho bảng atld_price_history (dòng "Excel cũ"). Dòng sinh từ PHIẾU trong
-- view atld_trade_prices không sửa/xoá ở đây — phiếu đã ghi sổ chỉ huỷ bằng dòng đảo.
-- Bảng này chỉ để tra giá, sửa/xoá KHÔNG ảnh hưởng tồn kho.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 116, 120.
-- ============================================================

alter table public.atld_price_history add column if not exists updated_by text;
alter table public.atld_price_history add column if not exists updated_at timestamptz;

-- Trigger: INSERT ghi người tạo; UPDATE ghi người sửa, KHÔNG cho đổi người tạo /
-- nguồn / mã SP (sửa nhầm mã thì xoá dòng nhập lại cho rõ vết).
create or replace function public.atld_price_history_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.doi_tac := nullif(trim(coalesce(new.doi_tac, '')), '');
  new.chung_tu := nullif(trim(coalesce(new.chung_tu, '')), '');
  if tg_op = 'INSERT' then
    new.created_by := public.caller_email();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.source := old.source;
    new.item_id := old.item_id;
    new.updated_by := public.caller_email();
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists atld_price_history_stamp on public.atld_price_history;
create trigger atld_price_history_stamp
  before insert or update on public.atld_price_history
  for each row execute function public.atld_price_history_stamp();

drop policy if exists atld_price_history_update on public.atld_price_history;
create policy atld_price_history_update on public.atld_price_history
  for update to authenticated
  using (public.atld_is_keeper() or public.atld_is_approver())
  with check (public.atld_is_keeper() or public.atld_is_approver());

drop policy if exists atld_price_history_delete on public.atld_price_history;
create policy atld_price_history_delete on public.atld_price_history
  for delete to authenticated
  using (public.atld_is_approver());

-- KIỂM TRA: mong đợi 4 policy (read, insert, update, delete) và delete chứa atld_is_approver
select policyname, cmd, qual from pg_policies
 where schemaname = 'public' and tablename = 'atld_price_history'
 order by cmd;
