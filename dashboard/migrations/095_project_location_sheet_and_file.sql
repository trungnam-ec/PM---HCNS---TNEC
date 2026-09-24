-- ============================================================
-- 095 — "Vị trí dự án": thêm LINK GOOGLE SHEET + 1 TỆP ĐÍNH KÈM (ảnh/PDF)
--       cho từng Ban điều hành
--
-- 1. Ba cột mới trên project_locations:
--      sheet_url        — link Google Sheet của dự án
--      attachment_path  — đường dẫn tệp trong kho `project-files`
--      attachment_name  — tên gốc của tệp để hiện cho người xem
--    Mỗi BĐH đúng MỘT tệp: tải tệp mới là thay tệp cũ.
--
-- 2. Kho tệp RIÊNG TƯ `project-files` (10MB, chỉ ảnh + PDF). Không để public:
--    ai cầm link là mở được, kể cả người đã nghỉ việc. Giao diện xem tệp bằng
--    link ký có hạn.
--      Đọc  : mọi nhân sự đã đăng nhập (khớp quyền đọc bảng project_locations).
--      Ghi/xoá: Admin HOẶC cờ can_manage_project_locations — CÙNG điều kiện với
--               policy pl_write_manage (017), gom vào một hàm để hai nơi không
--               bao giờ lệch nhau.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run.
-- An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. CỘT ───
alter table public.project_locations
  add column if not exists sheet_url       text,
  add column if not exists attachment_path text,
  add column if not exists attachment_name text;

-- ─── 2. HÀM QUYỀN GHI (dùng cho policy của kho tệp) ───
create or replace function public.caller_can_manage_project_locations()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_users au
    where lower(au.email) = lower(auth.jwt() ->> 'email')
      and au.role = 'Admin'
  )
  or exists (
    select 1 from public.approval_permissions ap
    where lower(coalesce(ap.email, '')) like '%' || lower(auth.jwt() ->> 'email') || '%'
      and ap.can_manage_project_locations = true
  );
$$;

revoke all on function public.caller_can_manage_project_locations() from public, anon;
grant execute on function public.caller_can_manage_project_locations() to authenticated;

-- ─── 3. KHO TỆP RIÊNG TƯ ───
-- Bọc bắt lỗi: SQL Editor chạy cả script trong MỘT transaction, lệnh storage
-- hỏng sẽ kéo đổ luôn phần cột ở trên.
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'project-files',
    'project-files',
    false,
    10485760, -- 10MB, đúng mức giao diện đang chặn
    array[
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'
    ]
  )
  on conflict (id) do update set
    public             = false,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  raise notice 'Bucket project-files đã sẵn sàng (private, 10MB, ảnh + PDF).';
exception
  when insufficient_privilege or others then
    raise warning 'KHÔNG tạo được bucket bằng SQL (%). Vào Supabase > Storage > New bucket, tên đúng "project-files", BỎ TICK Public, file size limit 10MB.', sqlerrm;
end $$;

-- ─── 4. POLICY CHO KHO ───
do $$
begin
  execute 'drop policy if exists "project files select authenticated" on storage.objects';
  execute 'drop policy if exists "project files insert manage" on storage.objects';
  execute 'drop policy if exists "project files update manage" on storage.objects';
  execute 'drop policy if exists "project files delete manage" on storage.objects';

  execute $p$
    create policy "project files select authenticated"
      on storage.objects for select to authenticated
      using (bucket_id = 'project-files')
  $p$;

  execute $p$
    create policy "project files insert manage"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'project-files' and public.caller_can_manage_project_locations())
  $p$;

  execute $p$
    create policy "project files update manage"
      on storage.objects for update to authenticated
      using (bucket_id = 'project-files' and public.caller_can_manage_project_locations())
      with check (bucket_id = 'project-files' and public.caller_can_manage_project_locations())
  $p$;

  execute $p$
    create policy "project files delete manage"
      on storage.objects for delete to authenticated
      using (bucket_id = 'project-files' and public.caller_can_manage_project_locations())
  $p$;

  raise notice 'Đã đặt 4 policy cho bucket project-files.';
exception
  when insufficient_privilege or others then
    raise warning 'KHÔNG đặt được policy storage (%). Tạo tay trong Supabase > Storage > project-files > Policies.', sqlerrm;
end $$;

-- ─── 5. KIỂM TRA ───
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'project-files';

select policyname, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'project files%'
order by cmd;

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'project_locations'
  and column_name in ('sheet_url', 'attachment_path', 'attachment_name')
order by column_name;
