-- ============================================================
-- 142 — P. AN TOÀN LAO ĐỘNG: XOÁ PHẢI QUA TP/PP DUYỆT
--
-- User yêu cầu 08/10/2026: nhân viên có cờ Thủ kho ATLĐ / Khấu trừ xử phạt —
-- P.ATLĐ nhập vẫn nhập liệu bình thường, nhưng bấm XOÁ thì chỉ GỬI YÊU CẦU.
-- Người có cờ "Duyệt xuất kho ATLĐ" (TP/PP) nhận chuông, mở popup xem nội dung
-- rồi bấm Xác nhận xoá thì hệ thống mới xoá (hoặc Không xoá).
--
-- Áp cho 3 nút xoá mà người không có cờ duyệt bấm được:
--   item    — mã SP ở Tổng Danh mục kho (mã chưa từng vào phiếu)
--   issue   — phiếu xuất Nháp / Bị trả lại
--   penalty — hồ sơ khấu trừ xử phạt
-- Admin và người có cờ Duyệt xuất vẫn xoá thẳng như cũ.
--
-- Nội dung hiện trong popup chụp lại TẠI LÚC GỬI (cột detail) — hàm tự đọc từ
-- dòng gốc, không tin client.
--
-- RLS: Thủ kho / NV nhập xử phạt không còn quyền DELETE thẳng (chỉ qua yêu cầu).
-- Riêng phiếu NHẬP nháp, Thủ kho vẫn xoá được — code dùng để dọn phiếu dở dang
-- khi ghi sổ lỗi (lib/atldStock.ts receiveItemStock).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 116, 124, 128, 139, 141.
-- ============================================================

-- ─── 1. BẢNG YÊU CẦU XOÁ ───
create table if not exists public.atld_delete_requests (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null check (kind in ('item', 'issue', 'penalty')),
  target_id         uuid not null,
  title             text not null,                     -- VD "Phiếu 07 PXK-ATLD.TNEC 20261008"
  detail            jsonb not null default '[]'::jsonb, -- [{label, value}] chụp lúc gửi
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by      text not null,
  requested_by_name text,
  requested_at      timestamptz not null default now(),
  decided_by        text,
  decided_at        timestamptz,
  decide_note       text
);
-- Mỗi mục chỉ 1 yêu cầu đang chờ.
create unique index if not exists atld_delete_requests_pending_unique
  on public.atld_delete_requests (kind, target_id) where status = 'pending';

alter table public.atld_delete_requests enable row level security;
revoke all on public.atld_delete_requests from anon, public;
grant select on public.atld_delete_requests to authenticated;

-- Người duyệt thấy hết; người gửi thấy yêu cầu của mình. Ghi CHỈ qua hàm bên dưới.
drop policy if exists atld_delete_requests_select on public.atld_delete_requests;
create policy atld_delete_requests_select on public.atld_delete_requests for select to authenticated
  using (public.atld_is_approver() or requested_by = public.caller_email());

-- ─── 2. GỬI YÊU CẦU XOÁ ───
create or replace function public.atld_fmt_money(p numeric)
returns text language sql immutable as $$
  select case when p is null then null
              else replace(to_char(round(p), 'FM999,999,999,999,990'), ',', '.') || ' đ' end;
$$;

create or replace function public.atld_request_delete(p_kind text, p_target uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_title  text;
  v_detail jsonb;
  v_id     uuid;
  it  public.atld_items%rowtype;
  vo  public.atld_vouchers%rowtype;
  pe  public.atld_penalties%rowtype;
  v_hang text;
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

-- ─── 3. TP/PP DUYỆT: XOÁ HOẶC KHÔNG XOÁ ───
-- Trả về các tệp cần dọn trong Storage ({bucket, path}) — giao diện xoá SAU khi
-- CSDL đã xoá xong (Storage không chịu RLS của bảng).
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

revoke all on function public.atld_fmt_money(numeric) from public, anon;
revoke all on function public.atld_request_delete(text, uuid) from public, anon;
revoke all on function public.atld_decide_delete(uuid, boolean, text) from public, anon;
grant execute on function public.atld_fmt_money(numeric) to authenticated;
grant execute on function public.atld_request_delete(text, uuid) to authenticated;
grant execute on function public.atld_decide_delete(uuid, boolean, text) to authenticated;

-- ─── 4. SIẾT QUYỀN XOÁ THẲNG ───
-- Mã SP: chỉ Admin / cờ Duyệt xuất (atld_is_approver đã gồm Admin).
drop policy if exists atld_items_delete on public.atld_items;
create policy atld_items_delete on public.atld_items for delete to authenticated
  using (public.atld_is_approver());

-- Phiếu: Thủ kho chỉ còn xoá phiếu NHẬP nháp (dọn phiếu dở); phiếu xuất cần cờ duyệt.
drop policy if exists atld_vouchers_delete on public.atld_vouchers;
create policy atld_vouchers_delete on public.atld_vouchers for delete to authenticated
  using (public.atld_is_keeper() and status in ('draft', 'returned')
         and (loai = 'nhap' or public.atld_is_approver()));

-- Hồ sơ xử phạt: P.ATLĐ nhập VÀ có cờ duyệt (Admin có cả hai).
drop policy if exists atld_penalties_delete on public.atld_penalties;
create policy atld_penalties_delete on public.atld_penalties for delete to authenticated
  using (public.atld_penalty_is_input() and public.atld_is_approver());

-- Tệp hồ sơ xử phạt: thêm người duyệt (dọn tệp sau khi xác nhận xoá). Còn lại giữ như 141.
do $$
begin
  execute 'drop policy if exists "atld penalty delete" on storage.objects';
  execute $p$
    create policy "atld penalty delete" on storage.objects for delete to authenticated
      using (bucket_id = 'atld-penalty' and (
        public.atld_penalty_is_input() or public.atld_is_approver() or
        (public.atld_penalty_is_process() and (storage.foldername(name))[2] = 'ct')))
  $p$;
exception
  when insufficient_privilege or others then
    raise warning 'KHÔNG đặt được policy storage (%). Sửa tay trong Supabase > Storage > atld-penalty > Policies.', sqlerrm;
end $$;

-- ─── 5. REALTIME cho chuông ───
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public'
                    and tablename = 'atld_delete_requests') then
    alter publication supabase_realtime add table public.atld_delete_requests;
  end if;
exception when others then
  raise warning 'Không bật được realtime cho atld_delete_requests (%) — chuông vẫn chạy, chỉ cần tải lại trang.', sqlerrm;
end $$;

-- ─── 6. KIỂM TRA ───
select 'bảng atld_delete_requests' as muc, count(*)::text as ket_qua from information_schema.tables
 where table_schema = 'public' and table_name = 'atld_delete_requests'                         -- mong đợi 1
union all
select 'hàm yêu cầu / duyệt xoá', count(*)::text from pg_proc
 where proname in ('atld_request_delete', 'atld_decide_delete')                                -- mong đợi 2
union all
select 'policy xoá đã siết', count(*)::text from pg_policies
 where schemaname = 'public' and policyname in ('atld_items_delete', 'atld_vouchers_delete', 'atld_penalties_delete')
   and qual ilike '%atld_is_approver%'                                                         -- mong đợi 3
union all
select 'realtime', count(*)::text from pg_publication_tables
 where pubname = 'supabase_realtime' and tablename = 'atld_delete_requests';                   -- mong đợi 1
