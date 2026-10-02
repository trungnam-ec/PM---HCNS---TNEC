-- ============================================================
-- 123 — KHO BHLĐ: "TẠO PHIẾU XUẤT KHO" NGAY TRONG TAB GIÁ NHẬP KHO
--
-- User yêu cầu 02/10/2026: nút "Tạo phiếu xuất kho" — tạo xong phiếu phải nằm
-- ngay trong danh sách Giá nhập kho, đủ trường dữ liệu.
--
-- 1. GIÁ BÁN: atld_voucher_lines.sale_price — đơn giá XUẤT BÁN RA người dùng gõ.
--    Cột unit_price của dòng xuất vẫn là GIÁ VỐN do hàm duyệt (116) điền theo
--    FIFO -> giá trị tồn kho không bị giá bán làm lệch.
-- 2. KHÁCH HÀNG gõ tay: chọn từ Danh mục đối tác chung thì lưu contractor_id
--    (trigger chụp tên như 117); khách ngoài danh mục thì contractor_id NULL và
--    GIỮ tên đã gõ ở contractor_name (bản 117 xoá trắng tên trong trường hợp này).
-- 3. atld_shared_partner_list (122) trả thêm id để form gắn đúng contractor_id.
--    Đổi kiểu trả về -> phải DROP rồi tạo lại.
-- 4. VIEW atld_trade_prices: phiếu xuất hiện NGAY TỪ LÚC TẠO (nháp / chờ duyệt /
--    bị trả lại / đã duyệt / đã huỷ) kèm cột trạng thái + id phiếu để thao tác;
--    đơn giá dòng xuất = giá bán (thiếu thì giá vốn). Phiếu nhập vẫn chỉ hiện khi
--    đã ghi sổ / đã huỷ. Vẫn loại phiếu tồn đầu kỳ. KHÔNG đổi gì ở sổ kho: tồn chỉ
--    trừ khi TP/PP duyệt (hàm atld_approve_issue của 116).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 116, 117, 120, 122.
-- ============================================================

-- ─── 1. Giá bán ───
alter table public.atld_voucher_lines
  add column if not exists sale_price numeric(18,2) check (sale_price is null or sale_price >= 0);

-- ─── 2. Khách hàng gõ tay ───
create or replace function public.atld_vouchers_contractor_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.contractor_id is null then
    new.contractor_name := nullif(trim(coalesce(new.contractor_name, '')), '');
  elsif tg_op = 'INSERT' or new.contractor_id is distinct from old.contractor_id then
    select f.name into new.contractor_name from public.finance_partners f where f.id = new.contractor_id;
  else
    new.contractor_name := old.contractor_name;
  end if;
  return new;
end;
$$;

-- Gửi duyệt: nguyên văn bản 117, chỉ nới điều kiện "phải ghi người nhận" để nhận
-- cả khách hàng GÕ TAY (contractor_name khi contractor_id rỗng).
create or replace function public.atld_submit_issue(p_voucher uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.atld_vouchers%rowtype;
  short text;
begin
  if not public.atld_is_keeper() then
    raise exception 'Tài khoản chưa có quyền Thủ kho ATLĐ.';
  end if;
  select * into v from public.atld_vouchers where id = p_voucher for update;
  if not found then raise exception 'Không tìm thấy phiếu.'; end if;
  if v.loai <> 'xuat' then raise exception 'Đây không phải phiếu xuất.'; end if;
  if v.status not in ('draft', 'returned') then
    raise exception 'Phiếu % đã ở trạng thái %, không gửi duyệt lại được.', v.so_phieu, public.atld_status_label(v.status);
  end if;
  if not exists (select 1 from public.atld_voucher_lines where voucher_id = v.id) then
    raise exception 'Phiếu chưa có dòng hàng nào.';
  end if;
  if coalesce(trim(v.bdh_name), '') = '' and v.contractor_id is null
     and coalesce(trim(v.contractor_name), '') = '' and coalesce(trim(v.nguoi_nhan), '') = '' then
    raise exception 'Phiếu xuất phải ghi Khách hàng, BĐH hoặc người nhận.';
  end if;

  select string_agg(format('%s (cần %s, tồn %s)', i.code, need.q, coalesce(s.ton, 0)), '; ')
    into short
    from (select item_id, sum(qty) q from public.atld_voucher_lines where voucher_id = v.id group by item_id) need
    join public.atld_items i on i.id = need.item_id
    left join (select item_id, sum(qty) ton from public.atld_ledger group by item_id) s on s.item_id = need.item_id
   where need.q > coalesce(s.ton, 0);
  if short is not null then
    raise exception 'Không đủ hàng: %', short;
  end if;

  update public.atld_vouchers
     set status = 'pending', submitted_by = public.caller_email(), submitted_at = now()
   where id = v.id;
end;
$$;
revoke all on function public.atld_submit_issue(uuid) from public, anon;
grant execute on function public.atld_submit_issue(uuid) to authenticated;

-- ─── 3. Danh sách đối tác chung kèm id ───
drop function if exists public.atld_shared_partner_list();
create function public.atld_shared_partner_list()
returns table (id uuid, name text, short_name text, party_type text)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.name, f.short_name, f.party_type
  from public.finance_partners f
  where public.caller_email() <> '' and f.active
  order by f.name;
$$;
revoke all on function public.atld_shared_partner_list() from public, anon;
grant execute on function public.atld_shared_partner_list() to authenticated;

-- ─── 4. View danh sách giá nhập – xuất ───
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
         null::text             as so_phieu,
         null::text             as status,
         null::uuid             as voucher_id,
         null::text             as created_by,
         null::text             as created_by_name,
         null::text             as nguoi_nhan,
         null::text             as bdh_name,
         null::text             as ly_do,
         null::text             as ly_do_tra_huy
    from public.atld_price_history h
  union all
  select l.id,
         'phieu'::text,
         v.loai,
         v.ngay,
         l.item_id,
         l.qty,
         case when v.loai = 'xuat' then coalesce(l.sale_price, l.unit_price) else l.unit_price end,
         v.vat_percent,
         case when v.loai = 'nhap' then p.name else v.contractor_name end,
         v.chung_tu,
         v.so_phieu,
         v.status,
         v.id,
         v.created_by,
         v.created_by_name,
         v.nguoi_nhan,
         v.bdh_name,
         v.ly_do,
         case v.status when 'returned' then v.return_reason when 'cancelled' then v.cancel_reason end
    from public.atld_voucher_lines l
    join public.atld_vouchers v on v.id = l.voucher_id
    left join public.atld_partners p on p.id = v.partner_id
   where v.ly_do is distinct from 'Tồn đầu kỳ chuyển từ Excel'
     and (v.loai = 'xuat' or v.status in ('posted', 'cancelled'));

revoke all on public.atld_trade_prices from anon, public;
grant select on public.atld_trade_prices to authenticated;

-- KIỂM TRA: mong đợi 1 dòng sale_price
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'atld_voucher_lines' and column_name = 'sale_price';
