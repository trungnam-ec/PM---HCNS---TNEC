-- ============================================================
-- 145 — PHIẾU XUẤT KHO: TP/PP DUYỆT + ADMIN SỬA NỘI DUNG GHI NHẦM
--
-- User yêu cầu 08/10/2026: phiếu xuất (kể cả ĐÃ DUYỆT) lỡ ghi nhầm nội dung thì
-- người có cờ "Duyệt xuất kho ATLĐ" và Admin được sửa.
--
-- Sửa được (không đụng sổ kho): Khách hàng · BĐH · Người nhận · Địa chỉ · Nội dung
-- · Báo giá/HĐ · VAT % · Phí vận chuyển · Ghi chú · ĐƠN GIÁ BÁN từng dòng.
-- KHÔNG sửa: Ngày xuất (nằm trong số phiếu + ngày sổ kho), Mã SP, Số lượng (đã trừ
-- kho theo lô FIFO) -> muốn đổi thì Huỷ phiếu (cộng lại kho) rồi lập phiếu mới.
-- Phiếu Đã huỷ không sửa. RLS UPDATE của 116 giữ nguyên (Thủ kho chỉ sửa Nháp /
-- Bị trả lại) -> người duyệt sửa qua hàm SECURITY DEFINER dưới đây.
-- Ghi lại người sửa + lúc sửa (edited_by / edited_by_name / edited_at).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 116, 117, 123.
-- ============================================================

alter table public.atld_vouchers
  add column if not exists edited_by      text,
  add column if not exists edited_by_name text,
  add column if not exists edited_at      timestamptz;

-- p_header: {contractor_id, contractor_name, bdh_name, nguoi_nhan, dia_chi, ly_do,
--            chung_tu, vat_percent, phi_van_chuyen, ghi_chu}
-- p_prices: [{line_no, sale_price}] — sale_price null = để trống giá.
create or replace function public.atld_edit_issue(p_voucher uuid, p_header jsonb, p_prices jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.atld_vouchers%rowtype;
  t text;
  p jsonb;
begin
  if not public.atld_is_approver() then
    raise exception 'Chỉ TP/PP có cờ Duyệt xuất kho ATLĐ hoặc Admin mới sửa được phiếu này.';
  end if;
  select * into v from public.atld_vouchers where id = p_voucher for update;
  if not found then raise exception 'Không tìm thấy phiếu.'; end if;
  if v.loai <> 'xuat' then raise exception 'Đây không phải phiếu xuất.'; end if;
  if v.status = 'cancelled' then raise exception 'Phiếu % đã huỷ — không sửa.', v.so_phieu; end if;

  t := nullif(trim(coalesce(p_header ->> 'contractor_id', '')), '');
  update public.atld_vouchers set
    contractor_id   = t::uuid,
    contractor_name = nullif(trim(coalesce(p_header ->> 'contractor_name', '')), ''),  -- trigger 123 thay bằng tên danh mục khi có contractor_id
    bdh_name        = nullif(trim(coalesce(p_header ->> 'bdh_name', '')), ''),
    nguoi_nhan      = nullif(trim(coalesce(p_header ->> 'nguoi_nhan', '')), ''),
    dia_chi         = nullif(trim(coalesce(p_header ->> 'dia_chi', '')), ''),
    ly_do           = nullif(trim(coalesce(p_header ->> 'ly_do', '')), ''),
    chung_tu        = nullif(trim(coalesce(p_header ->> 'chung_tu', '')), ''),
    vat_percent     = greatest(coalesce((p_header ->> 'vat_percent')::numeric, 0), 0),
    phi_van_chuyen  = greatest(coalesce((p_header ->> 'phi_van_chuyen')::numeric, 0), 0),
    ghi_chu         = nullif(trim(coalesce(p_header ->> 'ghi_chu', '')), ''),
    edited_by       = public.caller_email(),
    edited_by_name  = nullif(trim(coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', '')), ''),
    edited_at       = now()
  where id = v.id;
  -- Trigger 123 đặt contractor_id mới -> chụp lại tên từ danh mục; nhưng nếu
  -- contractor_id KHÔNG đổi nó giữ tên cũ — đúng ý (tên danh mục không gõ đè được).

  for p in select * from jsonb_array_elements(coalesce(p_prices, '[]'::jsonb)) loop
    if (p ->> 'sale_price') is not null and (p ->> 'sale_price')::numeric < 0 then
      raise exception 'Đơn giá bán không được âm.';
    end if;
    update public.atld_voucher_lines
       set sale_price = (p ->> 'sale_price')::numeric
     where voucher_id = v.id and line_no = (p ->> 'line_no')::int;
  end loop;
end;
$$;

revoke all on function public.atld_edit_issue(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.atld_edit_issue(uuid, jsonb, jsonb) to authenticated;

-- KIỂM TRA
select 'cột người sửa' as muc, count(*)::text as ket_qua from information_schema.columns
 where table_name = 'atld_vouchers' and column_name in ('edited_by', 'edited_by_name', 'edited_at')  -- mong đợi 3
union all
select 'hàm sửa phiếu', count(*)::text from pg_proc where proname = 'atld_edit_issue';            -- mong đợi 1
