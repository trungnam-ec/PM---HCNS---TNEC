-- ============================================================
-- 154 — DANH BẠ ĐỐI TÁC: LÝ DO ĐỔI TRẠNG THÁI · CHẶN TRÙNG · TỆP PDF ĐÍNH KÈM
-- User chốt 13/10/2026 (sau buổi rà soát của "Ban lãnh đạo"):
--   (2) Tạm dừng / Danh sách đen BẮT BUỘC có lý do; lưu ai đổi và lúc nào.
--   (5) Đối tác KHÔNG có MST: chặn thêm trùng theo TÊN hoặc SỐ ĐIỆN THOẠI.
--   (8) Tệp đính kèm PDF < 10MB (profile năng lực, chứng chỉ, báo giá, khác).
--
-- Chốt chặn ở CSDL (trigger), không chỉ giao diện:
--   • status = paused/blacklist mà thiếu lý do -> lỗi PARTNER_REASON_REQUIRED.
--   • status_changed_by / status_changed_at do trigger đặt từ phiên đăng nhập, người
--     dùng không giả được. Chuyển về active/saved thì lý do tự xoá.
--   • Đối tác chưa có MST trùng tên (bỏ khoảng trắng thừa, không phân biệt hoa/thường)
--     hoặc trùng số điện thoại (so 9 chữ số cuối, nên 0912… = +84912…) với một đối tác
--     khác -> lỗi PARTNER_DUP|name|<tên> hoặc PARTNER_DUP|phone|<tên>. Có MST thì dựa
--     vào ràng buộc MST duy nhất của 150. Với dòng đang có, chỉ kiểm khi sửa tên /
--     số điện thoại / MST — không chặn oan thao tác khác trên dữ liệu cũ.
--
-- Storage: kho tệp RIÊNG TƯ partner-files, chỉ PDF, tối đa 10MB, đường dẫn
-- "<partner_id>/<tệp>". Storage KHÔNG chịu RLS của bảng nên có policy riêng cùng luật
-- xem / sửa như bảng (partner_dir_can_view / partner_dir_can_manage).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 150 (và 116 cho caller_email).
-- ============================================================

-- ─── 1. CỘT LÝ DO + NGƯỜI ĐỔI ───
alter table public.partner_directory add column if not exists status_reason text;
alter table public.partner_directory add column if not exists status_changed_by text;
alter table public.partner_directory add column if not exists status_changed_at timestamptz;

-- ─── 2. TRIGGER: LÝ DO + CHẶN TRÙNG ───
create or replace function public.partner_directory_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name   text;
  v_digits text;
  v_dup    text;
  v_raw    text;
begin
  -- Đổi trạng thái (hoặc tạo mới đã ở trạng thái khác "đang hợp tác").
  if (tg_op = 'INSERT' and new.status <> 'active')
     or (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    if new.status in ('paused', 'blacklist') and coalesce(btrim(new.status_reason), '') = '' then
      raise exception 'PARTNER_REASON_REQUIRED';
    end if;
    new.status_changed_at := now();
    new.status_changed_by := public.caller_email();
  end if;
  if new.status in ('active', 'saved') then
    new.status_reason := null;
  end if;

  -- Chặn trùng: chỉ với đối tác CHƯA có MST, và khi tạo mới / sửa tên-SĐT-MST.
  if coalesce(btrim(new.tax_code), '') = ''
     and (tg_op = 'INSERT'
          or new.name is distinct from old.name
          or new.phone is distinct from old.phone
          or new.phone2 is distinct from old.phone2
          or new.tax_code is distinct from old.tax_code) then

    v_name := lower(regexp_replace(btrim(new.name), '\s+', ' ', 'g'));
    select p.name into v_dup from public.partner_directory p
     where p.id <> new.id
       and lower(regexp_replace(btrim(p.name), '\s+', ' ', 'g')) = v_name
     limit 1;
    if found then
      raise exception 'PARTNER_DUP|name|%', v_dup;
    end if;

    foreach v_raw in array array[new.phone, new.phone2] loop
      v_digits := right(regexp_replace(coalesce(v_raw, ''), '\D', '', 'g'), 9);
      continue when length(v_digits) < 9;
      select p.name into v_dup from public.partner_directory p
       where p.id <> new.id
         and (right(regexp_replace(coalesce(p.phone, ''),  '\D', '', 'g'), 9) = v_digits
           or right(regexp_replace(coalesce(p.phone2, ''), '\D', '', 'g'), 9) = v_digits)
       limit 1;
      if found then
        raise exception 'PARTNER_DUP|phone|%', v_dup;
      end if;
    end loop;
  end if;

  return new;
end $$;

drop trigger if exists partner_directory_guard_trg on public.partner_directory;
create trigger partner_directory_guard_trg
  before insert or update on public.partner_directory
  for each row execute function public.partner_directory_guard();

-- ─── 3. BẢNG TỆP ĐÍNH KÈM ───
create table if not exists public.partner_directory_files (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.partner_directory(id) on delete cascade,
  doc_type    text not null default 'khac' check (doc_type in ('profile', 'chung_chi', 'bao_gia', 'khac')),
  file_name   text not null,
  file_path   text not null,
  size_bytes  bigint,
  uploaded_by text,
  created_at  timestamptz not null default now()
);
create index if not exists partner_directory_files_partner_idx on public.partner_directory_files (partner_id);

alter table public.partner_directory_files enable row level security;
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
              where schemaname = 'public' and tablename = 'partner_directory_files' loop
    execute format('drop policy if exists %I on public.partner_directory_files', pol.policyname);
  end loop;
end $$;

create policy partner_files_read on public.partner_directory_files
  for select to authenticated using (public.partner_dir_can_view());
create policy partner_files_insert on public.partner_directory_files
  for insert to authenticated with check (public.partner_dir_can_manage());
create policy partner_files_delete on public.partner_directory_files
  for delete to authenticated using (public.partner_dir_can_manage());

revoke all on public.partner_directory_files from anon, public;
grant select, insert, delete on public.partner_directory_files to authenticated;

-- ─── 4. KHO TỆP RIÊNG TƯ (làm trong khối riêng: lỗi quyền storage không cuốn cả script) ───
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('partner-files', 'partner-files', false, 10485760, array['application/pdf'])
  on conflict (id) do update
    set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf'];

  execute 'drop policy if exists "partner files select" on storage.objects';
  execute 'drop policy if exists "partner files insert" on storage.objects';
  execute 'drop policy if exists "partner files delete" on storage.objects';
  execute $p$
    create policy "partner files select" on storage.objects for select to authenticated
      using (bucket_id = 'partner-files' and public.partner_dir_can_view())
  $p$;
  execute $p$
    create policy "partner files insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'partner-files' and public.partner_dir_can_manage())
  $p$;
  execute $p$
    create policy "partner files delete" on storage.objects for delete to authenticated
      using (bucket_id = 'partner-files' and public.partner_dir_can_manage())
  $p$;
exception
  when insufficient_privilege or others then
    raise warning 'KHÔNG tạo được kho tệp / policy storage (%). Tạo tay: Storage > New bucket "partner-files" (Private, giới hạn 10MB, PDF) rồi thêm policy theo file này.', sqlerrm;
end $$;

-- ─── 5. KIỂM TRA ───
select 'cột lý do + người đổi' as muc, count(*)::text as ket_qua from information_schema.columns
 where table_schema = 'public' and table_name = 'partner_directory'
   and column_name in ('status_reason', 'status_changed_by', 'status_changed_at')               -- mong đợi 3
union all
select 'trigger guard', count(*)::text from pg_trigger
 where tgrelid = 'public.partner_directory'::regclass and tgname = 'partner_directory_guard_trg' -- mong đợi 1
union all
select 'policy bảng tệp', count(*)::text from pg_policies
 where schemaname = 'public' and tablename = 'partner_directory_files'                          -- mong đợi 3
union all
select 'bucket partner-files riêng tư 10MB', count(*)::text from storage.buckets
 where id = 'partner-files' and public = false and file_size_limit = 10485760                    -- mong đợi 1
union all
select 'policy storage partner files', count(*)::text from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and policyname like 'partner files %';   -- mong đợi 3
