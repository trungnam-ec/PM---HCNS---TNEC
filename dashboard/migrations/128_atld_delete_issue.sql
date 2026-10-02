-- ============================================================
-- 128 — KHO BHLĐ: XOÁ PHIẾU XUẤT (Admin + người có cờ Duyệt xuất kho ATLĐ)
--
-- User yêu cầu 02/10/2026: thêm thao tác xoá phiếu xuất cho Admin và người có cờ
-- phê duyệt (can_approve_atld_issue).
--
-- Xoá được: Nháp · Chờ duyệt · Bị trả lại · Đã huỷ.
-- KHÔNG xoá phiếu ĐÃ DUYỆT: phiếu đó đã trừ kho -> phải Huỷ (sinh dòng đảo, cộng
-- lại kho) rồi mới xoá, nếu không tồn kho lệch.
-- Phiếu Đã huỷ còn dòng sổ kho (xuất + đảo) tự triệt tiêu nhau theo từng lô ->
-- hàm soát lại đúng là bằng 0 rồi mới xoá các dòng đó (FK restrict của 116 chặn
-- xoá phiếu khi còn dòng sổ). Dòng hàng xoá theo cascade.
--
-- Quyền xoá NHÁP / BỊ TRẢ LẠI của Thủ kho (policy delete 116) giữ nguyên.
-- Tệp chứng từ gốc trong kho atld-files do giao diện xoá SAU khi hàm chạy xong.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 116.
-- ============================================================

create or replace function public.atld_delete_issue(p_voucher uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.atld_vouchers%rowtype;
  lech text;
begin
  if not public.atld_is_approver() then
    raise exception 'Chỉ Admin hoặc người có cờ Duyệt xuất kho ATLĐ mới xoá được phiếu.';
  end if;
  select * into v from public.atld_vouchers where id = p_voucher for update;
  if not found then raise exception 'Không tìm thấy phiếu.'; end if;
  if v.loai <> 'xuat' then raise exception 'Đây không phải phiếu xuất.'; end if;
  if v.status = 'posted' then
    raise exception 'Phiếu % đã duyệt (đã trừ kho) — hãy Huỷ phiếu trước để cộng lại kho rồi mới xoá.', v.so_phieu;
  end if;

  -- Dòng sổ của phiếu (chỉ có khi phiếu từng được duyệt rồi huỷ) phải cân về 0
  -- theo từng lô — chắc chắn xoá xong tồn kho không đổi.
  select string_agg(distinct i.code, ', ') into lech
    from (select lot_id, item_id, sum(qty) s from public.atld_ledger
           where voucher_id = v.id group by lot_id, item_id) g
    join public.atld_items i on i.id = g.item_id
   where g.s <> 0;
  if lech is not null then
    raise exception 'Sổ kho của phiếu % chưa cân (mã %) — không xoá để tránh lệch tồn.', v.so_phieu, lech;
  end if;

  delete from public.atld_ledger where voucher_id = v.id;
  delete from public.atld_vouchers where id = v.id;
end;
$$;

revoke all on function public.atld_delete_issue(uuid) from public, anon;
grant execute on function public.atld_delete_issue(uuid) to authenticated;

-- KIỂM TRA: mong đợi 1
select count(*) as so_ham from pg_proc where proname = 'atld_delete_issue';
