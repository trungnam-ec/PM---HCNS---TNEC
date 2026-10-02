-- ============================================================
-- 120 — KHO BHLĐ: TAB "GIÁ NHẬP KHO" — GIÁ NHẬP VÀO + GIÁ XUẤT BÁN RA
--
-- User yêu cầu 02/10/2026: sheet Chi Tiet có ngày, đơn giá, NCC/KH, chứng từ
-- (Báo giá/HĐ) — cần một bảng chi tiết thể hiện CẢ giá nhập vào lẫn giá xuất bán
-- ra, đặt cạnh "Tổng kho ATLĐ".
--
-- HAI NGUỒN, GỘP trong view atld_trade_prices:
--   1. atld_price_history — 441 dòng nhập/xuất CŨ của sheet Chi Tiet. CHỈ ĐỂ TRA
--      GIÁ, KHÔNG đụng sổ kho: tồn đã vào bằng phiếu "Tồn đầu kỳ" (30/09/2026),
--      cộng thêm lịch sử cũ vào sổ là tồn gấp đôi.
--      Dòng xuất cũ có thể THIẾU giá (Excel bỏ trống 33 dòng) -> unit_price NULL.
--   2. Phiếu đã ghi sổ trong hệ thống: phiếu NHẬP (giá nhập, NCC) và phiếu XUẤT
--      (giá vốn bình quân các lô FIFO hàm duyệt điền; người nhận = nhà thầu /
--      người nhận + BĐH). TRỪ phiếu tồn đầu kỳ — giá ở đó là giá gần nhất, không
--      phải một lần mua thật.
--
-- Quyền: mọi tài khoản đăng nhập XEM (user chốt: đơn giá ai cũng thấy); Thủ kho /
-- Admin ghi bảng lịch sử. View security_invoker + thu hồi anon (bẫy view GRANT).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 116, 117.
-- ============================================================

create table if not exists public.atld_price_history (
  id          uuid primary key default gen_random_uuid(),
  loai        text not null check (loai in ('nhap', 'xuat')),
  ngay        date not null,
  item_id     uuid not null references public.atld_items(id) on delete cascade,
  qty         numeric(14,2) not null check (qty > 0),
  unit_price  numeric(18,2) check (unit_price is null or unit_price >= 0),
  doi_tac     text,                         -- cột "NCC/KH" của Excel
  chung_tu    text,                         -- Báo giá / HĐ
  note        text,
  source      text not null default 'excel' check (source in ('excel', 'tay')),
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists atld_price_history_item_idx on public.atld_price_history (item_id, loai, ngay);

create or replace function public.atld_price_history_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.created_by := public.caller_email();
  new.doi_tac := nullif(trim(coalesce(new.doi_tac, '')), '');
  new.chung_tu := nullif(trim(coalesce(new.chung_tu, '')), '');
  return new;
end;
$$;

drop trigger if exists atld_price_history_stamp on public.atld_price_history;
create trigger atld_price_history_stamp
  before insert on public.atld_price_history
  for each row execute function public.atld_price_history_stamp();

alter table public.atld_price_history enable row level security;
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'atld_price_history' loop
    execute format('drop policy if exists %I on public.atld_price_history', pol.policyname);
  end loop;
end $$;
revoke all on public.atld_price_history from anon;

create policy atld_price_history_read on public.atld_price_history
  for select to authenticated using (true);
create policy atld_price_history_insert on public.atld_price_history
  for insert to authenticated with check (public.atld_is_keeper());
create policy atld_price_history_delete on public.atld_price_history
  for delete to authenticated using (public.atld_is_keeper());
-- Không có UPDATE: nhập sai thì xoá dòng và nhập lại.

-- ─── VIEW GỘP ───
drop view if exists public.atld_trade_prices;
create view public.atld_trade_prices with (security_invoker = true) as
  select h.id,
         'excel'::text          as nguon,
         h.loai,
         h.ngay,
         h.item_id,
         h.qty,
         h.unit_price,
         null::numeric          as vat_percent,
         h.doi_tac,
         h.chung_tu,
         null::text             as so_phieu
    from public.atld_price_history h
  union all
  select l.id,
         'phieu'::text,
         v.loai,
         v.ngay,
         l.item_id,
         l.qty,
         l.unit_price,
         case when v.loai = 'nhap' then v.vat_percent end,
         case when v.loai = 'nhap' then p.name
              else nullif(concat_ws(' — ', coalesce(v.contractor_name, v.nguoi_nhan), v.bdh_name), '') end,
         v.chung_tu,
         v.so_phieu
    from public.atld_voucher_lines l
    join public.atld_vouchers v on v.id = l.voucher_id
    left join public.atld_partners p on p.id = v.partner_id
   where v.status = 'posted'
     and v.ly_do is distinct from 'Tồn đầu kỳ chuyển từ Excel';

revoke all on public.atld_trade_prices from anon, public;
grant select on public.atld_trade_prices to authenticated;

-- KIỂM TRA: mong đợi bảng = 1, policy = 3
select 'bảng' as muc, count(*)::text as ket_qua from information_schema.tables
 where table_schema = 'public' and table_name = 'atld_price_history'
union all
select 'policy', count(*)::text from pg_policies
 where schemaname = 'public' and tablename = 'atld_price_history';
