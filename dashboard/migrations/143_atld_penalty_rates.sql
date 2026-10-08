-- ============================================================
-- 143 — P. AN TOÀN LAO ĐỘNG: TAB "ĐỊNH MỨC XỬ PHẠT"
--
-- User yêu cầu 08/10/2026: lưu Phụ lục 01 "Mức xử phạt" (QĐ ATLD/QD/005) thành
-- bảng trong hệ thống để làm căn cứ xử lý vi phạm.
--   • 3 tầng theo STT: "1" danh mục lớn → "1.1" nhóm → "1.1.1" hạng mục (có tiền).
--     Tầng suy ra từ số dấu chấm của STT, không cần cột cha.
--   • Mỗi hạng mục: mức Lần 1 / Lần 2 / Lần 3 + đơn vị (đồng/lần | đồng/người).
--   • Ra phiên bản QĐ mới thì SỬA ĐÈ (user để tôi chốt): hồ sơ đã lập vẫn giữ
--     số tiền riêng của nó nên không cần lưu bảng giá cũ.
--   • Xem: ai vào được tab Khấu trừ xử phạt. Thêm/sửa/upload Excel: cờ
--     can_input_atld_penalty (P.ATLĐ nhập) + Admin. XOÁ: theo quy tắc 142 — có cờ
--     Duyệt xuất kho ATLĐ thì xoá thẳng, không thì gửi yêu cầu chờ TP/PP duyệt.
--   • Không xoá được dòng tiêu đề khi còn mục con (trigger chặn).
--
-- Viết lại atld_request_delete / atld_decide_delete của 142 chỉ để thêm loại 'rate'.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 139, 142.
-- ============================================================

-- ─── 1. BẢNG ───
create table if not exists public.atld_penalty_rates (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique
              check (code ~ '^[0-9]+(\.[0-9]+){0,2}$'),   -- 1 | 1.1 | 1.1.1 (tối đa 3 tầng)
  noi_dung    text not null check (trim(noi_dung) <> ''),
  don_vi      text check (don_vi in ('lan', 'nguoi')),     -- đồng/lần | đồng/người
  muc_1       numeric(18,0) check (muc_1 >= 0),
  muc_2       numeric(18,0) check (muc_2 >= 0),
  muc_3       numeric(18,0) check (muc_3 >= 0),
  ghi_chu     text,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.atld_penalty_rates_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.atld_penalty_rates where code like old.code || '.%') then
      raise exception 'Mục % còn mục con bên trong — xoá các mục con trước.', old.code;
    end if;
    return old;
  end if;
  new.noi_dung := trim(new.noi_dung);
  new.ghi_chu := nullif(trim(coalesce(new.ghi_chu, '')), '');
  if tg_op = 'INSERT' then
    new.created_by := public.caller_email();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists atld_penalty_rates_before_write on public.atld_penalty_rates;
create trigger atld_penalty_rates_before_write
  before insert or update or delete on public.atld_penalty_rates
  for each row execute function public.atld_penalty_rates_before_write();

alter table public.atld_penalty_rates enable row level security;
revoke all on public.atld_penalty_rates from anon, public;
grant select, insert, update, delete on public.atld_penalty_rates to authenticated;

do $$
declare pol text;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'atld_penalty_rates' loop
    execute format('drop policy if exists %I on public.atld_penalty_rates', pol);
  end loop;
end $$;

create policy atld_penalty_rates_select on public.atld_penalty_rates for select to authenticated
  using (public.atld_penalty_can_view());
create policy atld_penalty_rates_insert on public.atld_penalty_rates for insert to authenticated
  with check (public.atld_penalty_is_input());
create policy atld_penalty_rates_update on public.atld_penalty_rates for update to authenticated
  using (public.atld_penalty_is_input()) with check (public.atld_penalty_is_input());
-- Xoá thẳng: P.ATLĐ nhập VÀ có cờ duyệt (Admin có cả hai) — như hồ sơ xử phạt ở 142.
create policy atld_penalty_rates_delete on public.atld_penalty_rates for delete to authenticated
  using (public.atld_penalty_is_input() and public.atld_is_approver());

-- ─── 2. YÊU CẦU XOÁ: THÊM LOẠI 'rate' ───
alter table public.atld_delete_requests drop constraint if exists atld_delete_requests_kind_check;
alter table public.atld_delete_requests add constraint atld_delete_requests_kind_check
  check (kind in ('item', 'issue', 'penalty', 'rate'));

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
    v_dv := case ra.don_vi when 'nguoi' then '/người' when 'lan' then '/lần' else '' end;
    v_title := 'Định mức xử phạt ' || ra.code || ' — ' || ra.noi_dung;
    v_detail := jsonb_build_array(
      jsonb_build_object('label', 'STT', 'value', ra.code),
      jsonb_build_object('label', 'Nội dung xử phạt', 'value', ra.noi_dung, 'wide', true),
      jsonb_build_object('label', 'Lần 1', 'value', public.atld_fmt_money(ra.muc_1) || v_dv),
      jsonb_build_object('label', 'Lần 2', 'value', public.atld_fmt_money(ra.muc_2) || v_dv),
      jsonb_build_object('label', 'Lần 3', 'value', public.atld_fmt_money(ra.muc_3) || v_dv),
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

create or replace function public.atld_decide_delete(p_id uuid, p_approve boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r     public.atld_delete_requests%rowtype;
  files jsonb := '[]'::jsonb;
  v_path text;
  v_qd text;
  v_ct text;
begin
  if not public.atld_is_approver() then
    raise exception 'Chỉ TP/PP có cờ Duyệt xuất kho ATLĐ hoặc Admin mới xử lý được yêu cầu xoá.';
  end if;
  select * into r from public.atld_delete_requests where id = p_id for update;
  if not found then raise exception 'Không tìm thấy yêu cầu xoá.'; end if;
  if r.status <> 'pending' then
    raise exception 'Yêu cầu này đã được xử lý (%).', case r.status when 'approved' then 'đã xoá' else 'không xoá' end;
  end if;

  -- Mục đã bị xoá bằng đường khác thì coi như xong, không báo lỗi.
  if p_approve then
    if r.kind = 'item' then
      begin
        delete from public.atld_items where id = r.target_id;
      exception when foreign_key_violation then
        raise exception 'Mã SP đã được dùng trong phiếu kho sau lúc gửi yêu cầu — không xoá được, hãy chuyển sang "Ngừng dùng".';
      end;
    elsif r.kind = 'issue' then
      select goc_file_path into v_path from public.atld_vouchers where id = r.target_id;
      if found then
        perform public.atld_delete_issue(r.target_id);   -- chặn phiếu Đã duyệt, soát sổ kho
        if v_path is not null then
          files := files || jsonb_build_object('bucket', 'atld-files', 'path', v_path);
        end if;
      end if;
    elsif r.kind = 'penalty' then
      delete from public.atld_penalties where id = r.target_id
        returning qd_file_path, ct_file_path into v_qd, v_ct;
      if v_qd is not null then files := files || jsonb_build_object('bucket', 'atld-penalty', 'path', v_qd); end if;
      if v_ct is not null then files := files || jsonb_build_object('bucket', 'atld-penalty', 'path', v_ct); end if;
    elsif r.kind = 'rate' then
      delete from public.atld_penalty_rates where id = r.target_id;   -- trigger chặn nếu còn mục con
    end if;
  end if;

  update public.atld_delete_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = public.caller_email(),
         decided_at = now(),
         decide_note = nullif(trim(coalesce(p_note, '')), '')
   where id = r.id;
  return jsonb_build_object('files', files);
end;
$$;

revoke all on function public.atld_penalty_rates_before_write() from public, anon;
revoke all on function public.atld_request_delete(text, uuid) from public, anon;
revoke all on function public.atld_decide_delete(uuid, boolean, text) from public, anon;
grant execute on function public.atld_request_delete(text, uuid) to authenticated;
grant execute on function public.atld_decide_delete(uuid, boolean, text) to authenticated;

-- ─── 3. KIỂM TRA ───
select 'bảng atld_penalty_rates' as muc, count(*)::text as ket_qua from information_schema.tables
 where table_schema = 'public' and table_name = 'atld_penalty_rates'                         -- mong đợi 1
union all
select 'policy', count(*)::text from pg_policies
 where schemaname = 'public' and tablename = 'atld_penalty_rates'                            -- mong đợi 4
union all
select 'yêu cầu xoá nhận loại rate', count(*)::text from pg_proc
 where proname = 'atld_request_delete' and prosrc ilike '%atld_penalty_rates%';              -- mong đợi 1
