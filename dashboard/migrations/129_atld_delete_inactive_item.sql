-- ============================================================
-- 129 — KHO BHLĐ: XOÁ HẲN MÃ SP "NGỪNG DÙNG" (kể cả mã đã có phiếu)
--
-- User yêu cầu 02/10/2026: mã ở trạng thái Ngừng dùng phải xoá được luôn (VD mã
-- tạo thử PPE053 / PPE054 đã có phiếu nhập -> FK restrict của 116 chặn xoá).
--
-- Hàm atld_delete_inactive_item xoá theo thứ tự FK:
--   sổ kho (atld_ledger) của mã -> lô (atld_lots) của mã -> các phiếu nhập/xuất
--   CHỈ CHỨA mã này (dòng hàng xoá theo cascade) -> mã (lịch sử giá Excel cũ
--   atld_price_history xoá theo cascade của 120).
-- Chốt an toàn:
--   • Chỉ Admin + người có cờ Duyệt xuất kho ATLĐ (cùng luật xoá phiếu, 128).
--   • Mã phải đang Ngừng dùng (active = false).
--   • Mã nằm CHUNG phiếu với mã khác (VD phiếu tồn đầu kỳ 34 mã, phiếu xuất nhiều
--     dòng) -> CHẶN, báo số phiếu: xoá một dòng trong phiếu nhiều mã là âm thầm
--     sửa chứng từ đã duyệt.
-- Trả về đường dẫn tệp chứng từ gốc của các phiếu bị xoá để giao diện dọn kho tệp
-- SAU khi CSDL đã xoá xong (bẫy thứ tự ghi Storage).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 116, 120, 124.
-- ============================================================

create or replace function public.atld_delete_inactive_item(p_item uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare
  it public.atld_items%rowtype;
  mixed text;
  paths text[];
begin
  if not public.atld_is_approver() then
    raise exception 'Chỉ Admin hoặc người có cờ Duyệt xuất kho ATLĐ mới xoá hẳn được mã SP.';
  end if;
  select * into it from public.atld_items where id = p_item for update;
  if not found then raise exception 'Không tìm thấy mã SP.'; end if;
  if it.active then
    raise exception 'Mã % đang dùng — bấm "Ngừng dùng" trước rồi mới xoá hẳn.', it.code;
  end if;

  select string_agg(distinct v.so_phieu, ', ') into mixed
    from public.atld_vouchers v
   where exists (select 1 from public.atld_voucher_lines l where l.voucher_id = v.id and l.item_id = p_item)
     and exists (select 1 from public.atld_voucher_lines l where l.voucher_id = v.id and l.item_id <> p_item);
  if mixed is not null then
    raise exception 'Mã % nằm chung phiếu với mã khác (%) — không xoá hẳn được để tránh sửa ngầm chứng từ.', it.code, mixed;
  end if;

  select coalesce(array_agg(v.goc_file_path) filter (where v.goc_file_path is not null), '{}') into paths
    from public.atld_vouchers v
   where exists (select 1 from public.atld_voucher_lines l where l.voucher_id = v.id and l.item_id = p_item);

  delete from public.atld_ledger where item_id = p_item;
  delete from public.atld_lots where item_id = p_item;
  delete from public.atld_vouchers v
   where exists (select 1 from public.atld_voucher_lines l where l.voucher_id = v.id and l.item_id = p_item);
  delete from public.atld_items where id = p_item;
  return paths;
end;
$$;

revoke all on function public.atld_delete_inactive_item(uuid) from public, anon;
grant execute on function public.atld_delete_inactive_item(uuid) to authenticated;

-- KIỂM TRA: mong đợi 1
select count(*) as so_ham from pg_proc where proname = 'atld_delete_inactive_item';
