-- ============================================================
-- 124 — KHO BHLĐ: CHỨNG TỪ GỐC CỦA PHIẾU XUẤT KHO
--
-- User yêu cầu 02/10/2026 (tab "Xuất kho cho BĐH/Đối tác"): nút tải lên bản gốc
-- của phiếu xuất (ảnh / PDF, tối đa 2MB); tệp lớn hơn thì dán link (Drive...).
--
-- 1. 3 cột trên atld_vouchers: goc_file_path + goc_file_name (tệp trong kho
--    riêng tư atld-files) và goc_link (link ngoài).
-- 2. Hàm atld_set_issue_original: ghi 3 cột ở MỌI trạng thái phiếu (bản ký gốc
--    thường có SAU khi duyệt, lúc policy UPDATE của 116 đã khoá phiếu). Chỉ
--    Thủ kho / người duyệt xuất ATLĐ / Admin.
-- 3. Bucket atld-files (private, 2MB, ảnh + PDF): mọi tài khoản đăng nhập ĐỌC
--    (khớp policy đọc của bảng atld_* ở 116), Thủ kho / người duyệt ghi + xoá.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 116.
-- ============================================================

-- ─── 1. Cột ───
alter table public.atld_vouchers
  add column if not exists goc_file_path text,
  add column if not exists goc_file_name text,
  add column if not exists goc_link      text;

-- ─── 2. Hàm ghi chứng từ gốc ───
create or replace function public.atld_set_issue_original(
  p_voucher uuid, p_file_path text, p_file_name text, p_link text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_link text := nullif(trim(coalesce(p_link, '')), '');
begin
  if not (public.atld_is_keeper() or public.atld_is_approver()) then
    raise exception 'Tài khoản chưa có quyền Thủ kho / duyệt xuất ATLĐ.';
  end if;
  if v_link is not null and v_link !~* '^https?://' then
    raise exception 'Link phải bắt đầu bằng http:// hoặc https://';
  end if;
  update public.atld_vouchers
     set goc_file_path = nullif(trim(coalesce(p_file_path, '')), ''),
         goc_file_name = nullif(trim(coalesce(p_file_name, '')), ''),
         goc_link      = v_link
   where id = p_voucher and loai = 'xuat';
  if not found then raise exception 'Không tìm thấy phiếu xuất.'; end if;
end;
$$;

revoke all on function public.atld_set_issue_original(uuid, text, text, text) from public, anon;
grant execute on function public.atld_set_issue_original(uuid, text, text, text) to authenticated;

-- ─── 3. Kho tệp riêng tư ───
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'atld-files', 'atld-files', false, 2097152, -- 2MB, đúng mức giao diện chặn
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic']
  )
  on conflict (id) do update set
    public             = false,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
  raise notice 'Bucket atld-files đã sẵn sàng (private, 2MB, ảnh + PDF).';
exception
  when insufficient_privilege or others then
    raise warning 'KHÔNG tạo được bucket bằng SQL (%). Vào Supabase > Storage > New bucket, tên đúng "atld-files", BỎ TICK Public, file size limit 2MB.', sqlerrm;
end $$;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
              where schemaname = 'storage' and tablename = 'objects' and policyname like 'atld files%' loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;

  execute $p$
    create policy "atld files select authenticated" on storage.objects for select to authenticated
      using (bucket_id = 'atld-files')
  $p$;
  execute $p$
    create policy "atld files insert keeper" on storage.objects for insert to authenticated
      with check (bucket_id = 'atld-files' and (public.atld_is_keeper() or public.atld_is_approver()))
  $p$;
  execute $p$
    create policy "atld files delete keeper" on storage.objects for delete to authenticated
      using (bucket_id = 'atld-files' and (public.atld_is_keeper() or public.atld_is_approver()))
  $p$;
  raise notice 'Đã đặt 3 policy cho bucket atld-files.';
exception
  when insufficient_privilege or others then
    raise warning 'KHÔNG đặt được policy storage (%). Tạo tay trong Supabase > Storage > atld-files > Policies.', sqlerrm;
end $$;

-- ─── 4. KIỂM TRA ───
select 'cột goc_' as muc, count(*)::text as ket_qua from information_schema.columns
 where table_schema = 'public' and table_name = 'atld_vouchers' and column_name like 'goc\_%'   -- mong đợi 3
union all
select 'bucket atld-files', count(*)::text from storage.buckets where id = 'atld-files' and public = false  -- mong đợi 1
union all
select 'policy atld files', count(*)::text from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and policyname like 'atld files%';       -- mong đợi 3
