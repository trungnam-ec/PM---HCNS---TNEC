-- ============================================================
-- 117 — KHO BHLĐ: NHÀ THẦU DÙNG CHUNG DANH MỤC ĐỐI TÁC CỦA HỒ SƠ TRÌNH KÝ
--
-- User yêu cầu 02/10/2026: mục "Nhà thầu" của Kho BHLĐ phải đồng bộ với Danh mục
-- đối tác bên Hồ sơ trình ký (bảng finance_partners, migration 048) — một nhà
-- thầu chỉ khai một nơi, khỏi hai danh sách lệch tên nhau.
--
-- Làm theo đúng tiền lệ của Quản trị dự án (096: pc_partner_list / pc_partner_create):
--   • finance_partners chỉ Admin / cờ Báo cáo đọc được (có số tài khoản), nên KHÔNG
--     mở RLS bảng đó. Thay vào là 2 cửa hẹp SECURITY DEFINER:
--       atld_contractor_list()   tên + tên gọi tắt của nhà thầu phụ đang dùng
--                                (KHÔNG kèm MST, số tài khoản) — mọi tài khoản
--       atld_contractor_create() Thủ kho thêm nhanh nhà thầu vào danh mục CHUNG
--                                (trùng tên thì trả id sẵn có). Sửa / xoá / số tài
--                                khoản vẫn làm ở Hồ sơ trình ký > Danh mục đối tác.
--   • Phiếu xuất trỏ thẳng vào finance_partners (contractor_id) + chụp tên lúc lưu
--     (contractor_name) để in phiếu / báo cáo không phải đọc bảng bị khoá.
--   • atld_partners từ nay CHỈ còn nhà cung cấp (NOT VALID: không đụng dòng cũ —
--     lúc viết file này bảng chưa có dòng nhà thầu nào).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 048 và 116.
-- ============================================================

-- ─── 1. PHIẾU XUẤT TRỎ VÀO DANH MỤC CHUNG ───
alter table public.atld_vouchers
  add column if not exists contractor_id uuid references public.finance_partners(id) on delete restrict;
alter table public.atld_vouchers
  add column if not exists contractor_name text;
create index if not exists atld_vouchers_contractor_idx on public.atld_vouchers (contractor_id);

-- ─── 2. atld_partners CHỈ CÒN NHÀ CUNG CẤP ───
alter table public.atld_partners drop constraint if exists atld_partners_kind_ncc_only;
alter table public.atld_partners
  add constraint atld_partners_kind_ncc_only check (kind = 'ncc') not valid;

-- ─── 3. HAI CỬA VÀO DANH MỤC CHUNG ───
create or replace function public.atld_contractor_list()
returns table (id uuid, name text, short_name text)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.name, f.short_name
  from public.finance_partners f
  where public.caller_email() <> ''
    and f.active
    and f.party_type = 'nha_thau_phu'
  order by f.name;
$$;

create or replace function public.atld_contractor_create(p_name text, p_short_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.atld_is_keeper() then
    raise exception 'Tài khoản chưa có quyền Thủ kho ATLĐ.';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Nhập tên nhà thầu.';
  end if;
  -- Trùng tên (không phân biệt hoa thường) -> dùng lại, không tạo bản thứ hai.
  select id into v_id from public.finance_partners where lower(trim(name)) = lower(trim(p_name)) limit 1;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.finance_partners (name, short_name, party_type)
  values (trim(p_name), nullif(trim(coalesce(p_short_name, '')), ''), 'nha_thau_phu')
  returning id into v_id;
  return v_id;
end;
$$;

-- ─── 4. CHỤP TÊN NHÀ THẦU KHI LƯU PHIẾU ───
-- Client không đọc được finance_partners nên tên do trigger điền, không tin client.
create or replace function public.atld_vouchers_contractor_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.contractor_id is null then
    new.contractor_name := null;
  elsif tg_op = 'INSERT' or new.contractor_id is distinct from old.contractor_id then
    select f.name into new.contractor_name from public.finance_partners f where f.id = new.contractor_id;
  else
    new.contractor_name := old.contractor_name;
  end if;
  return new;
end;
$$;

drop trigger if exists atld_vouchers_contractor_name on public.atld_vouchers;
create trigger atld_vouchers_contractor_name
  before insert or update on public.atld_vouchers
  for each row execute function public.atld_vouchers_contractor_name();

-- ─── 5. GỬI DUYỆT: NHÀ THẦU GIỜ LÀ contractor_id ───
-- Nguyên văn bản 116, chỉ đổi điều kiện "phải ghi người nhận".
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
  if coalesce(trim(v.bdh_name), '') = '' and v.contractor_id is null and coalesce(trim(v.nguoi_nhan), '') = '' then
    raise exception 'Phiếu xuất phải ghi BĐH, nhà thầu hoặc người nhận.';
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

do $$
declare f text;
begin
  foreach f in array array['atld_contractor_list()', 'atld_contractor_create(text, text)', 'atld_submit_issue(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ─── 6. KIỂM TRA ───
select 'cột contractor_*' as muc, count(*)::text as ket_qua from information_schema.columns
 where table_schema = 'public' and table_name = 'atld_vouchers'
   and column_name in ('contractor_id', 'contractor_name')                      -- mong đợi 2
union all
select 'nhà thầu trong danh mục chung', count(*)::text from public.finance_partners
 where active and party_type = 'nha_thau_phu';
