-- ============================================================
-- 144 — ĐỊNH MỨC XỬ PHẠT: ĐƠN VỊ TỰ DO + HÌNH THỨC XỬ LÝ BỔ SUNG
--
-- File Word Phụ lục 01 thật (08/10/2026) có nhiều đơn vị hơn lần / người:
-- "đồng/thiết bị" (93 ô), "đồng/xe" (51), "đồng/vụ", "đồng/tủ", "đồng/hố cọc",
-- "đồng/người, thiết bị"… -> bỏ CHECK ('lan','nguoi') của 143, cột don_vi lưu
-- nguyên chữ sau "đồng/" (VD 'lần', 'thiết bị'). Đổi 2 giá trị cũ sang chữ.
-- Thêm cột hinh_thuc_bo_sung: phần ghi sau số tiền trong Phụ lục ("buộc thôi việc
-- và chuyển Công an xử lý", "Bồi thường 100% tài sản"…) — user chốt 08/10/2026 là
-- cột riêng, chọn bằng dropdown trên giao diện (vẫn tự ghi được).
-- Viết lại atld_request_delete để popup duyệt xoá ghi "đồng/<đơn vị>" đúng chữ
-- và hiện hình thức bổ sung.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 143.
-- ============================================================

alter table public.atld_penalty_rates drop constraint if exists atld_penalty_rates_don_vi_check;
alter table public.atld_penalty_rates add column if not exists hinh_thuc_bo_sung text;
update public.atld_penalty_rates set don_vi = 'lần'   where don_vi = 'lan';
update public.atld_penalty_rates set don_vi = 'người' where don_vi = 'nguoi';
update public.atld_penalty_rates set don_vi = nullif(trim(don_vi), '') where don_vi is not null;

create or replace function public.atld_request_delete(p_kind text, p_target uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_title  text;
  v_detail jsonb;
  v_id     uuid;
  it  public.atld_items%rowtype;
  vo  public.atld_vouchers%rowtype;
  pe  public.atld_penalties%rowtype;
  ra  public.atld_penalty_rates%rowtype;
  v_hang text;
  v_dv   text;
begin
  if p_kind = 'item' then
    if not public.atld_is_keeper() then raise exception 'Tài khoản chưa có quyền Thủ kho ATLĐ.'; end if;
    select * into it from public.atld_items where id = p_target;
    if not found then raise exception 'Không tìm thấy mã SP (có thể đã bị xoá).'; end if;
    if exists (select 1 from public.atld_voucher_lines where item_id = it.id) then
      raise exception 'Mã % đã được dùng trong phiếu kho nên không xoá được — hãy chuyển sang "Ngừng dùng".', it.code;
    end if;
    v_title := 'Mã SP ' || it.code || ' — ' || it.name;
    v_detail := jsonb_build_array(
      jsonb_build_object('label', 'Mã SP', 'value', it.code),
      jsonb_build_object('label', 'Tên SP', 'value', it.name),
      jsonb_build_object('label', 'Size', 'value', it.size),
      jsonb_build_object('label', 'Màu sắc', 'value', it.color),
      jsonb_build_object('label', 'ĐVT', 'value', it.unit),
      jsonb_build_object('label', 'NCC/PVT', 'value', it.ncc),
      jsonb_build_object('label', 'Giá nhập', 'value', public.atld_fmt_money(it.gia_nhap))
    );

  elsif p_kind = 'issue' then
    if not public.atld_is_keeper() then raise exception 'Tài khoản chưa có quyền Thủ kho ATLĐ.'; end if;
    select * into vo from public.atld_vouchers where id = p_target;
    if not found then raise exception 'Không tìm thấy phiếu (có thể đã bị xoá).'; end if;
    if vo.loai <> 'xuat' then raise exception 'Đây không phải phiếu xuất.'; end if;
    if vo.status not in ('draft', 'returned') then
      raise exception 'Phiếu % đang ở trạng thái "%" — chỉ gửi yêu cầu xoá phiếu Nháp / Bị trả lại.',
        vo.so_phieu, public.atld_status_label(vo.status);
    end if;
    select string_agg(i.code || ' ' || i.name || ' × ' || rtrim(to_char(l.qty, 'FM999999990.##'), '.'), E'\n' order by l.line_no)
      into v_hang
      from public.atld_voucher_lines l join public.atld_items i on i.id = l.item_id
     where l.voucher_id = vo.id;
    v_title := 'Phiếu xuất ' || vo.so_phieu;
    v_detail := jsonb_build_array(
      jsonb_build_object('label', 'Số phiếu', 'value', vo.so_phieu),
      jsonb_build_object('label', 'Ngày phiếu', 'value', to_char(vo.ngay, 'DD/MM/YYYY')),
      jsonb_build_object('label', 'Trạng thái', 'value', public.atld_status_label(vo.status)),
      jsonb_build_object('label', 'Khách hàng', 'value', vo.contractor_name),
      jsonb_build_object('label', 'BĐH nhận', 'value', vo.bdh_name),
      jsonb_build_object('label', 'Người nhận', 'value', vo.nguoi_nhan),
      jsonb_build_object('label', 'Người lập', 'value', coalesce(vo.created_by_name, vo.created_by)),
      jsonb_build_object('label', 'Nội dung', 'value', vo.ly_do, 'wide', true),
      jsonb_build_object('label', 'Hàng xuất', 'value', v_hang, 'wide', true)
    );

  elsif p_kind = 'penalty' then
    if not public.atld_penalty_is_input() then
      raise exception 'Tài khoản chưa có cờ Khấu trừ xử phạt — P.ATLĐ nhập.';
    end if;
    select * into pe from public.atld_penalties where id = p_target;
    if not found then raise exception 'Không tìm thấy hồ sơ (có thể đã bị xoá).'; end if;
    v_title := 'Hồ sơ khấu trừ xử phạt ' || pe.ma_ho_so;
    v_detail := jsonb_build_array(
      jsonb_build_object('label', 'Mã hồ sơ', 'value', pe.ma_ho_so),
      jsonb_build_object('label', 'Loại hồ sơ', 'value', pe.loai_ho_so),
      jsonb_build_object('label', 'Số QĐ', 'value', pe.so_quyet_dinh),
      jsonb_build_object('label', 'Ngày ban hành', 'value', to_char(pe.ngay_ban_hanh, 'DD/MM/YYYY')),
      jsonb_build_object('label', 'Dự án', 'value', pe.project_name),
      jsonb_build_object('label', 'Nhà thầu', 'value', pe.contractor_name),
      jsonb_build_object('label', 'Giá trị phải trừ', 'value', public.atld_fmt_money(pe.gia_tri_phai_tru)),
      jsonb_build_object('label', 'KHĐT đã trừ', 'value', public.atld_fmt_money(pe.gia_tri_da_tru)),
      jsonb_build_object('label', 'Người lập', 'value', pe.nguoi_lap),
      jsonb_build_object('label', 'Nội dung', 'value', pe.noi_dung, 'wide', true)
    );

  elsif p_kind = 'rate' then
    if not public.atld_penalty_is_input() then
      raise exception 'Tài khoản chưa có cờ Khấu trừ xử phạt — P.ATLĐ nhập.';
    end if;
    select * into ra from public.atld_penalty_rates where id = p_target;
    if not found then raise exception 'Không tìm thấy mục định mức (có thể đã bị xoá).'; end if;
    if exists (select 1 from public.atld_penalty_rates where code like ra.code || '.%') then
      raise exception 'Mục % còn mục con bên trong — xoá các mục con trước.', ra.code;
    end if;
    v_dv := coalesce('/' || ra.don_vi, '');   -- 144: đơn vị là chữ tự do
    v_title := 'Định mức xử phạt ' || ra.code || ' — ' || ra.noi_dung;
    v_detail := jsonb_build_array(
      jsonb_build_object('label', 'STT', 'value', ra.code),
      jsonb_build_object('label', 'Nội dung xử phạt', 'value', ra.noi_dung, 'wide', true),
      jsonb_build_object('label', 'Lần 1', 'value', public.atld_fmt_money(ra.muc_1) || v_dv),
      jsonb_build_object('label', 'Lần 2', 'value', public.atld_fmt_money(ra.muc_2) || v_dv),
      jsonb_build_object('label', 'Lần 3', 'value', public.atld_fmt_money(ra.muc_3) || v_dv),
      jsonb_build_object('label', 'Hình thức xử lý bổ sung', 'value', ra.hinh_thuc_bo_sung, 'wide', true),
      jsonb_build_object('label', 'Ghi chú', 'value', ra.ghi_chu)
    );

  else
    raise exception 'Loại yêu cầu xoá không hợp lệ: %', p_kind;
  end if;

  if exists (select 1 from public.atld_delete_requests
              where kind = p_kind and target_id = p_target and status = 'pending') then
    raise exception 'Đã có yêu cầu xoá % đang chờ TP/PP duyệt.', v_title;
  end if;

  insert into public.atld_delete_requests (kind, target_id, title, detail, requested_by, requested_by_name)
  values (p_kind, p_target, v_title, v_detail, public.caller_email(),
          nullif(trim(coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.atld_request_delete(text, uuid) from public, anon;
grant execute on function public.atld_request_delete(text, uuid) to authenticated;

-- KIỂM TRA
select 'cột hình thức bổ sung' as muc, count(*)::text as ket_qua from information_schema.columns
 where table_name = 'atld_penalty_rates' and column_name = 'hinh_thuc_bo_sung'                -- mong đợi 1
union all
select 'check đơn vị đã bỏ', (count(*) = 0)::text from pg_constraint
 where conname = 'atld_penalty_rates_don_vi_check'                                            -- mong đợi true
union all
select 'còn mã đơn vị cũ lan/nguoi', count(*)::text from public.atld_penalty_rates
 where don_vi in ('lan', 'nguoi')                                                            -- mong đợi 0
union all
select 'hàm yêu cầu xoá đã cập nhật', count(*)::text from pg_proc
 where proname = 'atld_request_delete' and prosrc ilike '%144: đơn vị%';                     -- mong đợi 1
