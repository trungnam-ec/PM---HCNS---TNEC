-- ============================================================
-- 146 — SỬA PHIẾU XUẤT (145): THÊM Ô "NGƯỜI LẬP"
--
-- User yêu cầu 08/10/2026: tên Người lập lấy từ tài khoản Google (VD biệt danh
-- "Niềm vui mỗi ngày Hữu Dư") -> TP/PP / Admin sửa lại thành họ tên thật trong
-- form "Sửa nội dung". Chỉ đổi created_by_name (tên hiển thị / in phiếu);
-- created_by (email người lập, dùng cho quyền + chuông) GIỮ NGUYÊN.
-- Viết lại atld_edit_issue của 145, thêm đúng 1 cột; khoá p_header không có
-- created_by_name thì giữ tên cũ.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 145.
-- ============================================================

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
    created_by_name = case when p_header ? 'created_by_name'                          -- 146
                           then nullif(trim(coalesce(p_header ->> 'created_by_name', '')), '')
                           else v.created_by_name end,
    edited_by       = public.caller_email(),
    edited_by_name  = nullif(trim(coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', '')), ''),
    edited_at       = now()
  where id = v.id;

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

-- KIỂM TRA: mong đợi 1
select count(*) as ham_sua_nguoi_lap from pg_proc
 where proname = 'atld_edit_issue' and prosrc ilike '%created_by_name%';
