-- ============================================================
-- 136 — KHO BHLĐ: CHỈNH TAY SỐ TỒN ĐẦU KỲ
--
-- User yêu cầu 07/10/2026: trong form "Sửa danh mục" phải sửa được Tồn đầu kỳ.
-- Tồn đầu kỳ KHÔNG phải cột lưu sẵn mà là Σ sổ kho (atld_ledger) có ngày < đầu
-- tháng (119), nên "sửa" = ghi 1 phiếu ĐIỀU CHỈNH dated NGÀY CUỐI THÁNG TRƯỚC cho
-- phần chênh lệch, đúng đường sổ FIFO như phiếu thường:
--   • Tăng : phiếu nhập đã ghi sổ + 1 lô mới, giá vốn = Giá nhập của mã (0 nếu trống)
--   • Giảm : phiếu xuất đã ghi sổ, trừ các lô cũ nhất còn hàng tại ngày đó (FIFO)
-- Không xoá / không sửa dòng sổ cũ -> còn nguyên dấu vết, huỷ được bằng nút huỷ
-- phiếu như mọi phiếu khác. Phiếu mang lý do "Điều chỉnh tồn đầu kỳ ...".
-- Chỉ Thủ kho ATLĐ (atld_is_keeper) gọi được.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 116 và 119.
-- ============================================================

create or replace function public.atld_set_opening(
  p_item   uuid,
  p_from   date,        -- ngày đầu tháng đang xem
  p_target numeric,     -- số tồn đầu kỳ muốn có
  p_note   text default null
)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  cur       numeric;
  delta     numeric;
  cut       date := p_from - 1;
  cost      numeric;
  v_id      uuid;
  l_id      uuid;
  new_lot   uuid;
  lot       record;
  remaining numeric;
  take      numeric;
  amt       numeric;
  amt_line  numeric := 0;
  v_code    text;
  reason    text;
begin
  if not public.atld_is_keeper() then
    raise exception 'Tài khoản chưa có quyền Thủ kho ATLĐ.';
  end if;
  if p_target is null or p_target < 0 then
    raise exception 'Tồn đầu kỳ phải là số không âm.';
  end if;

  select code, coalesce(gia_nhap, 0) into v_code, cost
    from public.atld_items where id = p_item for update;
  if not found then raise exception 'Không tìm thấy mã sản phẩm.'; end if;

  select coalesce(sum(qty), 0) into cur
    from public.atld_ledger where item_id = p_item and ngay < p_from;
  delta := p_target - cur;
  if delta = 0 then return 0; end if;

  reason := 'Điều chỉnh tồn đầu kỳ ' || to_char(p_from, 'MM/YYYY')
         || ': ' || cur || ' → ' || p_target
         || coalesce(' — ' || nullif(trim(p_note), ''), '');

  if delta > 0 then
    insert into public.atld_vouchers (loai, ngay, ly_do) values ('nhap', cut, reason) returning id into v_id;
    insert into public.atld_voucher_lines (voucher_id, line_no, item_id, qty, unit_price)
      values (v_id, 1, p_item, delta, cost) returning id into l_id;
    insert into public.atld_lots (item_id, voucher_id, line_id, ngay, qty_in, unit_cost)
      values (p_item, v_id, l_id, cut, delta, cost) returning id into new_lot;
    insert into public.atld_ledger (item_id, lot_id, voucher_id, line_id, ngay, kind, qty, unit_cost, amount, created_by)
      values (p_item, new_lot, v_id, l_id, cut, 'nhap', delta, cost, round(delta * cost, 2), public.caller_email());
  else
    remaining := -delta;
    insert into public.atld_vouchers (loai, ngay, ly_do) values ('xuat', cut, reason) returning id into v_id;
    insert into public.atld_voucher_lines (voucher_id, line_no, item_id, qty)
      values (v_id, 1, p_item, -delta) returning id into l_id;

    for lot in
      select l.id, l.unit_cost, coalesce(sum(g.qty), 0) as con
        from public.atld_lots l
        left join public.atld_ledger g on g.lot_id = l.id and g.ngay <= cut
       where l.item_id = p_item and l.ngay <= cut
       group by l.id, l.unit_cost, l.ngay, l.created_at
      having coalesce(sum(g.qty), 0) > 0
       order by l.ngay, l.created_at
    loop
      exit when remaining <= 0;
      take := least(remaining, lot.con);
      amt := round(take * lot.unit_cost, 2);
      insert into public.atld_ledger (item_id, lot_id, voucher_id, line_id, ngay, kind, qty, unit_cost, amount, created_by)
        values (p_item, lot.id, v_id, l_id, cut, 'xuat', -take, lot.unit_cost, -amt, public.caller_email());
      remaining := remaining - take;
      amt_line := amt_line + amt;
    end loop;

    if remaining > 0 then
      raise exception 'Không giảm được tồn đầu kỳ mã %: các lô còn hàng đến ngày % chỉ có %.',
        v_code, to_char(cut, 'DD/MM/YYYY'), (-delta - remaining);
    end if;
    update public.atld_voucher_lines set unit_price = round(amt_line / (-delta), 2) where id = l_id;
  end if;

  update public.atld_vouchers
     set status = 'posted', posted_by = public.caller_email(), posted_at = now(),
         created_by = coalesce(created_by, public.caller_email())
   where id = v_id;

  return delta;
end;
$$;

revoke all on function public.atld_set_opening(uuid, date, numeric, text) from public, anon;
grant execute on function public.atld_set_opening(uuid, date, numeric, text) to authenticated;

-- KIỂM TRA: mong đợi 1 dòng
select proname from pg_proc where proname = 'atld_set_opening';
