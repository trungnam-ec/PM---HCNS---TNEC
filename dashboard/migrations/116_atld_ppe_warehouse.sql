-- ============================================================
-- 116 — KHO BHLĐ (PPE) CỦA PHÒNG AN TOÀN LAO ĐỘNG
--
-- Thay file Excel "XUAT_NHAP_KHO ATLD.xlsx" (Quan Ly / Chi Tiet / Nhap-Xuat + 71
-- thẻ kho PPExxx gõ tay). User chốt 02/10/2026:
--   • 1 kho tổng duy nhất của P.ATLĐ (không kho BĐH, không điều chuyển).
--   • Xuất cho BĐH / nhà thầu.
--   • VAT + phí vận chuyển của phiếu NHẬP cộng vào giá vốn lô.
--   • Đơn giá ai cũng thấy -> mọi tài khoản đăng nhập ĐỌC được toàn bộ.
--   • Phiếu XUẤT phải qua TP/PP ATLĐ duyệt (cờ, không suy từ chức danh).
--   • Mã SP giữ nguyên như Excel (PPE003, PPE003.1 … là size khác nhau).
--
-- Bảng:
--   atld_items          danh mục: Mã SP + Tên SP + Size SP, ĐVT, tồn tối thiểu
--   atld_partners       đối tác: NCC hoặc nhà thầu nhận hàng (gắn BĐH)
--   atld_vouchers       phiếu nhập / xuất
--   atld_voucher_lines  dòng phiếu
--   atld_lots           lô = 1 dòng phiếu nhập đã ghi sổ, giá vốn riêng
--   atld_ledger         SỔ KHO — chỉ thêm, không sửa, không xoá. Tồn = tổng sổ.
--   view atld_stock     tồn hiện tại từng mã
--
-- CHỐT CHẶN Ở CSDL (không tin giao diện):
--   • Sổ kho + lô KHÔNG có policy ghi nào -> chỉ 5 hàm SECURITY DEFINER bên dưới
--     ghi được. Kể cả Admin cũng không sửa/xoá sổ từ giao diện.
--   • Trạng thái phiếu chỉ đổi qua hàm: policy UPDATE của phiếu chỉ cho sửa phiếu
--     NHÁP / BỊ TRẢ LẠI và WITH CHECK giữ nguyên ở 2 trạng thái đó.
--   • Duyệt xuất khoá dòng vật tư (FOR UPDATE) rồi mới tính tồn -> 2 phiếu duyệt
--     cùng lúc không làm kho âm. Thiếu hàng là từ chối CẢ phiếu.
--
-- Cờ quyền mới (approval_permissions):
--   can_manage_atld_stock   Thủ kho ATLĐ: danh mục, lập phiếu, ghi sổ phiếu nhập,
--                           gửi duyệt phiếu xuất
--   can_approve_atld_issue  TP/PP ATLĐ: duyệt / trả lại phiếu xuất, huỷ phiếu
--
-- ⚠ KHÔNG tự bật cờ cho ai. Chạy xong vào Cài đặt hệ thống > Phân quyền, nhóm
--   "Kho BHLĐ — P. An toàn lao động" và tick đúng người.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- ============================================================

-- ─── 0. CỜ QUYỀN ───
alter table public.approval_permissions
  add column if not exists can_manage_atld_stock boolean not null default false;
alter table public.approval_permissions
  add column if not exists can_approve_atld_issue boolean not null default false;

-- ─── 1. HÀM NHẬN DIỆN NGƯỜI GỌI (độc lập, không phụ thuộc 096) ───
create or replace function public.caller_email()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.is_admin_caller()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.allowed_users au
    where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.role = 'Admin'
  );
$$;

-- Ô email của approval_permissions có thể chứa NHIỀU email ("a@x, b@gmail").
-- Khớp TUYỆT ĐỐI từng email — không so chuỗi con (sự cố email LIKE 08/09/2026).
create or replace function public.atld_email_in(p_field text)
returns boolean language sql stable set search_path = public as $$
  select public.caller_email() <> ''
     and public.caller_email() = any (
       regexp_split_to_array(lower(coalesce(p_field, '')), '[\s,;]+')
     );
$$;

create or replace function public.atld_is_keeper()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_caller() or exists (
    select 1 from public.approval_permissions p
    where p.can_manage_atld_stock = true and public.atld_email_in(p.email)
  );
$$;

create or replace function public.atld_is_approver()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_caller() or exists (
    select 1 from public.approval_permissions p
    where p.can_approve_atld_issue = true and public.atld_email_in(p.email)
  );
$$;

-- ─── 2. BẢNG ───
create table if not exists public.atld_items (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,                 -- Mã SP, VD PPE003.1
  name        text not null,                 -- Tên SP
  size        text,                          -- Size SP (M, L, 42, Vàng…)
  unit        text,                          -- ĐVT: Bộ, Cái, Đôi…
  min_stock   numeric(14,2) not null default 0 check (min_stock >= 0),
  note        text,
  active      boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists atld_items_code_unique on public.atld_items (lower(trim(code)));

create table if not exists public.atld_partners (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('ncc', 'nha_thau')),
  name        text not null,
  bdh_name    text,                          -- nhà thầu thuộc BĐH nào (tuỳ chọn)
  phone       text,
  address     text,
  note        text,
  active      boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now()
);
create unique index if not exists atld_partners_name_unique on public.atld_partners (kind, lower(trim(name)));

create table if not exists public.atld_vouchers (
  id              uuid primary key default gen_random_uuid(),
  loai            text not null check (loai in ('nhap', 'xuat')),
  nam             int  not null,
  seq             int  not null,
  so_phieu        text not null,             -- VD "07 PXK-ATLD.TNEC 20260925"
  ngay            date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  status          text not null default 'draft'
                  check (status in ('draft', 'pending', 'returned', 'posted', 'cancelled')),
  partner_id      uuid references public.atld_partners(id) on delete restrict,
  bdh_name        text,                      -- phiếu xuất: BĐH nhận
  nguoi_nhan      text,                      -- phiếu xuất: người nhận / phiếu nhập: người giao
  dia_chi         text,
  ly_do           text,
  chung_tu        text,                      -- Báo giá / HĐ mua bán
  vat_percent     numeric(5,2)  not null default 0 check (vat_percent >= 0),
  phi_van_chuyen  numeric(18,2) not null default 0 check (phi_van_chuyen >= 0),
  ghi_chu         text,
  created_by      text,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  submitted_by    text,
  submitted_at    timestamptz,
  approved_by     text,
  approved_at     timestamptz,
  approve_note    text,
  returned_by     text,
  returned_at     timestamptz,
  return_reason   text,
  posted_by       text,
  posted_at       timestamptz,
  cancelled_by    text,
  cancelled_at    timestamptz,
  cancel_reason   text,
  unique (loai, nam, seq)
);
create index if not exists atld_vouchers_status_idx on public.atld_vouchers (status, loai);
create index if not exists atld_vouchers_ngay_idx on public.atld_vouchers (ngay);

create table if not exists public.atld_voucher_lines (
  id          uuid primary key default gen_random_uuid(),
  voucher_id  uuid not null references public.atld_vouchers(id) on delete cascade,
  line_no     int  not null default 1,
  item_id     uuid not null references public.atld_items(id) on delete restrict,
  qty         numeric(14,2) not null check (qty > 0),
  unit_price  numeric(18,2) check (unit_price is null or unit_price >= 0),
              -- nhập: đơn giá CHƯA VAT gõ tay; xuất: hàm duyệt tự điền giá vốn BQ các lô
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists atld_voucher_lines_voucher_idx on public.atld_voucher_lines (voucher_id);
create index if not exists atld_voucher_lines_item_idx on public.atld_voucher_lines (item_id);

create table if not exists public.atld_lots (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.atld_items(id) on delete restrict,
  voucher_id  uuid not null references public.atld_vouchers(id) on delete restrict,
  line_id     uuid not null references public.atld_voucher_lines(id) on delete restrict,
  ngay        date not null,
  qty_in      numeric(14,2) not null check (qty_in > 0),
  unit_cost   numeric(18,4) not null,        -- giá vốn đã gồm VAT + phân bổ vận chuyển
  created_at  timestamptz not null default now()
);
create index if not exists atld_lots_item_idx on public.atld_lots (item_id, ngay, created_at);

create table if not exists public.atld_ledger (
  id          bigserial primary key,
  item_id     uuid not null references public.atld_items(id) on delete restrict,
  lot_id      uuid not null references public.atld_lots(id) on delete restrict,
  voucher_id  uuid not null references public.atld_vouchers(id) on delete restrict,
  line_id     uuid references public.atld_voucher_lines(id) on delete restrict,
  ngay        date not null,
  kind        text not null check (kind in ('nhap', 'xuat', 'huy_nhap', 'huy_xuat')),
  qty         numeric(14,2) not null,        -- + vào kho, − ra kho
  unit_cost   numeric(18,4) not null,
  amount      numeric(18,2) not null,        -- qty × unit_cost (cùng dấu qty)
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists atld_ledger_item_idx on public.atld_ledger (item_id, ngay);
create index if not exists atld_ledger_lot_idx on public.atld_ledger (lot_id);
create index if not exists atld_ledger_voucher_idx on public.atld_ledger (voucher_id);

-- ─── 3. SỐ PHIẾU TỰ SINH ───
-- Kiểu cũ của Excel: "07 PXK-ATLD.TNEC 20260925" — số thứ tự theo năm + loại,
-- đuôi là ngày phiếu. Khoá advisory theo (loại, năm) để 2 người tạo cùng lúc không
-- lấy trùng số; UNIQUE (loai, nam, seq) là lưới an toàn cuối.
create or replace function public.atld_format_so_phieu(p_loai text, p_seq int, p_ngay date)
returns text language sql immutable as $$
  select lpad(p_seq::text, 2, '0')
      || case when p_loai = 'nhap' then ' PNK-ATLD.TNEC ' else ' PXK-ATLD.TNEC ' end
      || to_char(p_ngay, 'YYYYMMDD');
$$;

create or replace function public.atld_vouchers_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.nam := extract(year from new.ngay)::int;
    perform pg_advisory_xact_lock(hashtext('atld_voucher_' || new.loai || '_' || new.nam));
    select coalesce(max(seq), 0) + 1 into new.seq
      from public.atld_vouchers where loai = new.loai and nam = new.nam;
    new.status := 'draft';               -- phiếu mới luôn là nháp, không tin client
    new.created_by := public.caller_email();
  else
    -- Đổi ngày phiếu khi còn nháp: cập nhật đuôi ngày, giữ số thứ tự.
    -- Không cho đổi loại phiếu / năm (số thứ tự gắn với cặp này).
    new.loai := old.loai;
    new.nam  := old.nam;
    new.seq  := old.seq;
    new.created_by := old.created_by;
    new.updated_at := now();
  end if;
  new.so_phieu := public.atld_format_so_phieu(new.loai, new.seq, new.ngay);
  return new;
end;
$$;

drop trigger if exists atld_vouchers_before_write on public.atld_vouchers;
create trigger atld_vouchers_before_write
  before insert or update on public.atld_vouchers
  for each row execute function public.atld_vouchers_before_write();

create or replace function public.atld_items_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.code := trim(new.code);
  new.name := trim(new.name);
  new.size := nullif(trim(coalesce(new.size, '')), '');
  new.unit := nullif(trim(coalesce(new.unit, '')), '');
  if tg_op = 'INSERT' then
    new.created_by := public.caller_email();
  else
    new.created_by := old.created_by;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists atld_items_touch on public.atld_items;
create trigger atld_items_touch
  before insert or update on public.atld_items
  for each row execute function public.atld_items_touch();

create or replace function public.atld_partners_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.name := trim(new.name);
  if tg_op = 'INSERT' then
    new.created_by := public.caller_email();
  else
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

drop trigger if exists atld_partners_touch on public.atld_partners;
create trigger atld_partners_touch
  before insert or update on public.atld_partners
  for each row execute function public.atld_partners_touch();

-- ─── 4. RLS ───
-- Xoá TOÀN BỘ policy cũ trước (chạy lại an toàn, không đoán tên).
do $$
declare t text; pol record;
begin
  foreach t in array array['atld_items','atld_partners','atld_vouchers','atld_voucher_lines','atld_lots','atld_ledger'] loop
    execute format('alter table public.%I enable row level security', t);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
    execute format('revoke all on public.%I from anon', t);
    -- ĐỌC: mọi tài khoản đăng nhập (user chốt: đơn giá ai cũng thấy)
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
  end loop;
end $$;

-- Danh mục + đối tác: Thủ kho / Admin ghi. Xoá bị FK chặn nếu đã có phiếu dùng.
create policy atld_items_insert on public.atld_items for insert to authenticated
  with check (public.atld_is_keeper());
create policy atld_items_update on public.atld_items for update to authenticated
  using (public.atld_is_keeper()) with check (public.atld_is_keeper());
create policy atld_items_delete on public.atld_items for delete to authenticated
  using (public.atld_is_keeper());

create policy atld_partners_insert on public.atld_partners for insert to authenticated
  with check (public.atld_is_keeper());
create policy atld_partners_update on public.atld_partners for update to authenticated
  using (public.atld_is_keeper()) with check (public.atld_is_keeper());
create policy atld_partners_delete on public.atld_partners for delete to authenticated
  using (public.atld_is_keeper());

-- Phiếu: Thủ kho chỉ sửa/xoá phiếu NHÁP hoặc BỊ TRẢ LẠI. Đổi trạng thái chỉ qua hàm.
create policy atld_vouchers_insert on public.atld_vouchers for insert to authenticated
  with check (public.atld_is_keeper());
create policy atld_vouchers_update on public.atld_vouchers for update to authenticated
  using (public.atld_is_keeper() and status in ('draft', 'returned'))
  with check (public.atld_is_keeper() and status in ('draft', 'returned'));
create policy atld_vouchers_delete on public.atld_vouchers for delete to authenticated
  using (public.atld_is_keeper() and status in ('draft', 'returned'));

create or replace function public.atld_voucher_editable(p_voucher uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.atld_vouchers v
                 where v.id = p_voucher and v.status in ('draft', 'returned'));
$$;

create policy atld_lines_insert on public.atld_voucher_lines for insert to authenticated
  with check (public.atld_is_keeper() and public.atld_voucher_editable(voucher_id));
create policy atld_lines_update on public.atld_voucher_lines for update to authenticated
  using (public.atld_is_keeper() and public.atld_voucher_editable(voucher_id))
  with check (public.atld_is_keeper() and public.atld_voucher_editable(voucher_id));
create policy atld_lines_delete on public.atld_voucher_lines for delete to authenticated
  using (public.atld_is_keeper() and public.atld_voucher_editable(voucher_id));

-- atld_lots + atld_ledger: KHÔNG có policy ghi -> chỉ hàm bên dưới ghi được.

-- ─── 5. VIEW TỒN KHO ───
-- security_invoker: view chạy theo quyền người gọi (RLS của bảng gốc vẫn áp).
-- View KHÔNG tự chịu RLS -> thu hồi anon thủ công (bẫy view GRANT).
drop view if exists public.atld_stock;
create view public.atld_stock with (security_invoker = true) as
  select i.id as item_id,
         coalesce(sum(l.qty), 0)::numeric(14,2)    as ton,
         coalesce(sum(l.amount), 0)::numeric(18,2) as gia_tri
  from public.atld_items i
  left join public.atld_ledger l on l.item_id = i.id
  group by i.id;
revoke all on public.atld_stock from anon, public;
grant select on public.atld_stock to authenticated;

-- ─── 6. HÀM NGHIỆP VỤ ───

create or replace function public.atld_status_label(p_status text)
returns text language sql immutable as $$
  select case p_status
    when 'draft' then 'Nháp' when 'pending' then 'Chờ duyệt' when 'returned' then 'Bị trả lại'
    when 'posted' then 'Đã ghi sổ' when 'cancelled' then 'Đã huỷ' else p_status end;
$$;

-- 6a. GHI SỔ PHIẾU NHẬP (Thủ kho). Mỗi dòng sinh 1 lô.
-- Giá vốn lô = đơn giá × (1 + VAT%) + phần phí vận chuyển của dòng / số lượng.
-- Phí vận chuyển chia theo tỷ lệ GIÁ TRỊ dòng (dòng 0 đồng thì chia theo số lượng).
create or replace function public.atld_post_receipt(p_voucher uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.atld_vouchers%rowtype;
  ln record;
  total_value numeric;
  total_qty numeric;
  share numeric;
  cost numeric;
  new_lot uuid;
begin
  if not public.atld_is_keeper() then
    raise exception 'Tài khoản chưa có quyền Thủ kho ATLĐ.';
  end if;
  select * into v from public.atld_vouchers where id = p_voucher for update;
  if not found then raise exception 'Không tìm thấy phiếu.'; end if;
  if v.loai <> 'nhap' then raise exception 'Đây không phải phiếu nhập.'; end if;
  if v.status not in ('draft', 'returned') then
    raise exception 'Phiếu % đã ở trạng thái %, không ghi sổ lại được.', v.so_phieu, public.atld_status_label(v.status);
  end if;
  if not exists (select 1 from public.atld_voucher_lines where voucher_id = v.id) then
    raise exception 'Phiếu chưa có dòng hàng nào.';
  end if;
  if exists (select 1 from public.atld_voucher_lines where voucher_id = v.id and unit_price is null) then
    raise exception 'Còn dòng chưa nhập đơn giá.';
  end if;

  select sum(qty * unit_price), sum(qty) into total_value, total_qty
    from public.atld_voucher_lines where voucher_id = v.id;

  for ln in select * from public.atld_voucher_lines where voucher_id = v.id order by line_no, created_at loop
    if v.phi_van_chuyen = 0 then
      share := 0;
    elsif total_value > 0 then
      share := v.phi_van_chuyen * (ln.qty * ln.unit_price) / total_value;
    else
      share := v.phi_van_chuyen * ln.qty / total_qty;
    end if;
    cost := round(ln.unit_price * (1 + v.vat_percent / 100) + share / ln.qty, 4);

    insert into public.atld_lots (item_id, voucher_id, line_id, ngay, qty_in, unit_cost)
    values (ln.item_id, v.id, ln.id, v.ngay, ln.qty, cost)
    returning id into new_lot;

    insert into public.atld_ledger (item_id, lot_id, voucher_id, line_id, ngay, kind, qty, unit_cost, amount, created_by)
    values (ln.item_id, new_lot, v.id, ln.id, v.ngay, 'nhap', ln.qty, cost, round(ln.qty * cost, 2), public.caller_email());
  end loop;

  update public.atld_vouchers
     set status = 'posted', posted_by = public.caller_email(), posted_at = now()
   where id = v.id;
end;
$$;

-- 6b. GỬI DUYỆT PHIẾU XUẤT (Thủ kho). Soát tồn ngay để khỏi gửi phiếu chắc chắn
-- bị từ chối; lúc duyệt vẫn soát lại lần nữa (tồn có thể đã đổi).
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
  if coalesce(trim(v.bdh_name), '') = '' and v.partner_id is null and coalesce(trim(v.nguoi_nhan), '') = '' then
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

-- 6c. DUYỆT PHIẾU XUẤT (TP/PP ATLĐ) -> trừ kho theo FIFO.
-- Chỉ lấy lô có ngày nhập <= ngày phiếu xuất (không xuất hàng "chưa về").
-- Khoá dòng vật tư theo thứ tự id trước khi tính -> 2 phiếu duyệt cùng lúc phải
-- xếp hàng, không cùng tiêu một lô. Thiếu bất kỳ mã nào = từ chối cả phiếu.
create or replace function public.atld_approve_issue(p_voucher uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.atld_vouchers%rowtype;
  ln record;
  lot record;
  remaining numeric;
  take numeric;
  amt numeric;
  amt_line numeric;
  avail numeric;
  v_code text;
begin
  if not public.atld_is_approver() then
    raise exception 'Tài khoản chưa có quyền duyệt xuất kho ATLĐ.';
  end if;
  select * into v from public.atld_vouchers where id = p_voucher for update;
  if not found then raise exception 'Không tìm thấy phiếu.'; end if;
  if v.loai <> 'xuat' then raise exception 'Đây không phải phiếu xuất.'; end if;
  if v.status <> 'pending' then
    raise exception 'Phiếu % không ở trạng thái chờ duyệt.', v.so_phieu;
  end if;

  perform 1 from public.atld_items
   where id in (select item_id from public.atld_voucher_lines where voucher_id = v.id)
   order by id for update;

  for ln in select * from public.atld_voucher_lines where voucher_id = v.id order by line_no, created_at loop
    remaining := ln.qty;
    amt_line := 0;

    for lot in
      select l.id, l.unit_cost, l.ngay, coalesce(sum(g.qty), 0) as con
        from public.atld_lots l
        left join public.atld_ledger g on g.lot_id = l.id
       where l.item_id = ln.item_id and l.ngay <= v.ngay
       group by l.id, l.unit_cost, l.ngay, l.created_at
      having coalesce(sum(g.qty), 0) > 0
       order by l.ngay, l.created_at
    loop
      exit when remaining <= 0;
      take := least(remaining, lot.con);
      amt := round(take * lot.unit_cost, 2);
      insert into public.atld_ledger (item_id, lot_id, voucher_id, line_id, ngay, kind, qty, unit_cost, amount, created_by)
      values (ln.item_id, lot.id, v.id, ln.id, v.ngay, 'xuat', -take, lot.unit_cost, -amt, public.caller_email());
      remaining := remaining - take;
      amt_line := amt_line + amt;
    end loop;

    if remaining > 0 then
      select i.code into v_code from public.atld_items i where i.id = ln.item_id;
      avail := ln.qty - remaining;
      raise exception 'Không đủ hàng mã % đến ngày %: cần %, chỉ còn %.',
        v_code, to_char(v.ngay, 'DD/MM/YYYY'), ln.qty, avail;
    end if;

    -- Đơn giá xuất = giá vốn bình quân các lô vừa lấy (để in phiếu / báo cáo).
    update public.atld_voucher_lines set unit_price = round(amt_line / ln.qty, 2) where id = ln.id;
  end loop;

  update public.atld_vouchers
     set status = 'posted',
         approved_by = public.caller_email(), approved_at = now(),
         approve_note = nullif(trim(coalesce(p_note, '')), ''),
         posted_by = public.caller_email(), posted_at = now()
   where id = v.id;
end;
$$;

-- 6d. TRẢ LẠI PHIẾU XUẤT (TP/PP ATLĐ) — bắt buộc lý do.
create or replace function public.atld_return_issue(p_voucher uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.atld_vouchers%rowtype;
begin
  if not public.atld_is_approver() then
    raise exception 'Tài khoản chưa có quyền duyệt xuất kho ATLĐ.';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Nhập lý do trả lại.'; end if;
  select * into v from public.atld_vouchers where id = p_voucher for update;
  if not found then raise exception 'Không tìm thấy phiếu.'; end if;
  if v.status <> 'pending' then
    raise exception 'Phiếu % không ở trạng thái chờ duyệt.', v.so_phieu;
  end if;
  update public.atld_vouchers
     set status = 'returned', returned_by = public.caller_email(), returned_at = now(),
         return_reason = trim(p_reason)
   where id = v.id;
end;
$$;

-- 6e. HUỶ PHIẾU ĐÃ GHI SỔ (TP/PP ATLĐ) — sinh dòng ĐẢO, không xoá gì.
-- Huỷ phiếu nhập: lô của phiếu phải còn nguyên (chưa xuất gram nào); đã xuất thì
-- phải huỷ các phiếu xuất đó trước.
create or replace function public.atld_cancel_voucher(p_voucher uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.atld_vouchers%rowtype;
  used text;
begin
  if not public.atld_is_approver() then
    raise exception 'Tài khoản chưa có quyền huỷ phiếu kho ATLĐ.';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Nhập lý do huỷ phiếu.'; end if;
  select * into v from public.atld_vouchers where id = p_voucher for update;
  if not found then raise exception 'Không tìm thấy phiếu.'; end if;
  if v.status <> 'posted' then
    raise exception 'Chỉ huỷ được phiếu đã ghi sổ (phiếu % đang ở trạng thái %).', v.so_phieu, public.atld_status_label(v.status);
  end if;

  if v.loai = 'nhap' then
    perform 1 from public.atld_items
     where id in (select item_id from public.atld_lots where voucher_id = v.id)
     order by id for update;
    -- Lô còn nguyên = tổng sổ của lô vẫn bằng số đã nhập (phiếu xuất đã huỷ có
    -- dòng đảo bù lại nên tự cân).
    select string_agg(distinct i.code, ', ') into used
      from public.atld_lots l
      join public.atld_items i on i.id = l.item_id
     where l.voucher_id = v.id
       and (select coalesce(sum(g.qty), 0) from public.atld_ledger g where g.lot_id = l.id) <> l.qty_in;
    if used is not null then
      raise exception 'Hàng của phiếu này đã được xuất (mã %). Huỷ các phiếu xuất đó trước.', used;
    end if;
  end if;

  insert into public.atld_ledger (item_id, lot_id, voucher_id, line_id, ngay, kind, qty, unit_cost, amount, created_by)
  select item_id, lot_id, voucher_id, line_id, ngay,
         case when v.loai = 'nhap' then 'huy_nhap' else 'huy_xuat' end,
         -qty, unit_cost, -amount, public.caller_email()
    from public.atld_ledger
   where voucher_id = v.id and kind in ('nhap', 'xuat');

  update public.atld_vouchers
     set status = 'cancelled', cancelled_by = public.caller_email(), cancelled_at = now(),
         cancel_reason = trim(p_reason)
   where id = v.id;
end;
$$;

-- 6f. Cờ quyền của người đang đăng nhập (giao diện ẩn/hiện nút).
create or replace function public.atld_my_access()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('keeper', public.atld_is_keeper(), 'approver', public.atld_is_approver());
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'atld_email_in(text)', 'atld_is_keeper()', 'atld_is_approver()', 'atld_voucher_editable(uuid)',
    'atld_post_receipt(uuid)', 'atld_submit_issue(uuid)', 'atld_approve_issue(uuid, text)',
    'atld_return_issue(uuid, text)', 'atld_cancel_voucher(uuid, text)', 'atld_my_access()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ─── 7. KIỂM TRA ───
select 'cột cờ' as muc, count(*)::text as ket_qua from information_schema.columns
 where table_schema = 'public' and table_name = 'approval_permissions'
   and column_name in ('can_manage_atld_stock', 'can_approve_atld_issue')       -- mong đợi 2
union all
select 'bảng atld_', count(*)::text from information_schema.tables
 where table_schema = 'public' and table_name like 'atld\_%' and table_type = 'BASE TABLE'  -- mong đợi 6
union all
select 'policy', count(*)::text from pg_policies
 where schemaname = 'public' and tablename like 'atld\_%';                      -- mong đợi 18
