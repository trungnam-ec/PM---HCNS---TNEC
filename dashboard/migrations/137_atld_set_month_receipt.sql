-- ============================================================
-- 137 — KHO BHLĐ: CHỈNH TAY SỐ "NHẬP SP" CỦA THÁNG
--
-- User yêu cầu 07/10/2026: số Nhập SP của tháng (VD 24) phải sửa được xuống 20,
-- vì form cũ bấm Lưu nhiều lần đã lập trùng phiếu nhập (13/14/15 PNK mã PPEN012).
-- Nhập SP trong kỳ = Σ dòng sổ kind nhap + huy_nhap có ngày trong tháng (119), nên:
--   • Tăng : lập 1 phiếu nhập đã ghi sổ (giá vốn = Giá nhập của mã) ngày p_ngay
--   • Giảm : thêm dòng huy_nhap (số âm) vào các lô nhập TRONG THÁNG, lô mới nhất
--            trước, mang ngày của lô gốc — cùng cách huỷ phiếu (116) nhưng huỷ
--            từng phần. Lô đã bị xuất bớt thì chỉ giảm được phần còn nguyên.
-- Không xoá / không sửa dòng sổ cũ. Phiếu bị giảm hết vẫn ở trạng thái "Đã ghi sổ"
-- với số dư 0 (muốn huỷ nguyên phiếu thì dùng nút Huỷ phiếu).
-- Chỉ Thủ kho ATLĐ (atld_is_keeper) gọi được.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 116 và 119.
-- ============================================================

create or replace function public.atld_set_month_receipt(
  p_item   uuid,
  p_from   date,        -- ngày đầu tháng
  p_to     date,        -- ngày cuối tháng
  p_target numeric,     -- số Nhập SP muốn có trong tháng
  p_ngay   date         -- ngày phiếu khi phải nhập thêm (trong tháng)
)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  cur       numeric;
  delta     numeric;
  cost      numeric;
  v_id      uuid;
  l_id      uuid;
  new_lot   uuid;
  lot       record;
  remaining numeric;
  take      numeric;
  v_code    text;
begin
  if not public.atld_is_keeper() then
    raise exception 'Tài khoản chưa có quyền Thủ kho ATLĐ.';
  end if;
  if p_target is null or p_target < 0 then
    raise exception 'Số Nhập SP phải là số không âm.';
  end if;

  select code, coalesce(gia_nhap, 0) into v_code, cost
    from public.atld_items where id = p_item for update;
  if not found then raise exception 'Không tìm thấy mã sản phẩm.'; end if;

  select coalesce(sum(qty), 0) into cur
    from public.atld_ledger
   where item_id = p_item and kind in ('nhap', 'huy_nhap') and ngay between p_from and p_to;
  delta := p_target - cur;
  if delta = 0 then return 0; end if;

  if delta > 0 then
    if p_ngay is null or p_ngay not between p_from and p_to then
      raise exception 'Ngày phiếu phải nằm trong tháng đang sửa.';
    end if;
    insert into public.atld_vouchers (loai, ngay, ly_do)
      values ('nhap', p_ngay, 'Điều chỉnh Nhập SP ' || to_char(p_from, 'MM/YYYY') || ': ' || cur || ' → ' || p_target)
      returning id into v_id;
    insert into public.atld_voucher_lines (voucher_id, line_no, item_id, qty, unit_price)
      values (v_id, 1, p_item, delta, cost) returning id into l_id;
    insert into public.atld_lots (item_id, voucher_id, line_id, ngay, qty_in, unit_cost)
      values (p_item, v_id, l_id, p_ngay, delta, cost) returning id into new_lot;
    insert into public.atld_ledger (item_id, lot_id, voucher_id, line_id, ngay, kind, qty, unit_cost, amount, created_by)
      values (p_item, new_lot, v_id, l_id, p_ngay, 'nhap', delta, cost, round(delta * cost, 2), public.caller_email());
    update public.atld_vouchers
       set status = 'posted', posted_by = public.caller_email(), posted_at = now()
     where id = v_id;
  else
    remaining := -delta;
    for lot in
      select l.id, l.item_id, l.voucher_id, l.line_id, l.ngay, l.unit_cost,
             coalesce(sum(g.qty), 0) as con
        from public.atld_lots l
        left join public.atld_ledger g on g.lot_id = l.id
       where l.item_id = p_item and l.ngay between p_from and p_to
       group by l.id, l.item_id, l.voucher_id, l.line_id, l.ngay, l.unit_cost, l.created_at
      having coalesce(sum(g.qty), 0) > 0
       order by l.ngay desc, l.created_at desc
    loop
      exit when remaining <= 0;
      take := least(remaining, lot.con);
      insert into public.atld_ledger (item_id, lot_id, voucher_id, line_id, ngay, kind, qty, unit_cost, amount, created_by)
        values (lot.item_id, lot.id, lot.voucher_id, lot.line_id, lot.ngay, 'huy_nhap',
                -take, lot.unit_cost, -round(take * lot.unit_cost, 2), public.caller_email());
      remaining := remaining - take;
    end loop;
    if remaining > 0 then
      raise exception 'Không giảm được Nhập SP mã %: hàng nhập trong tháng đã xuất bớt, chỉ giảm được tối đa %.',
        v_code, (-delta - remaining);
    end if;
  end if;

  return delta;
end;
$$;

revoke all on function public.atld_set_month_receipt(uuid, date, date, numeric, date) from public, anon;
grant execute on function public.atld_set_month_receipt(uuid, date, date, numeric, date) to authenticated;

-- KIỂM TRA: mong đợi 1 dòng
select proname from pg_proc where proname = 'atld_set_month_receipt';
