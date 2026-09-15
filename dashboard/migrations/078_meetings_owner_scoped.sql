-- ============================================================
-- 078 — BIÊN BẢN HỌP: MỖI TÀI KHOẢN CHỈ THẤY BIÊN BẢN CỦA CHÍNH MÌNH
--
-- YÊU CẦU (user chốt 15/09/2026):
--   • Tài khoản nào thấy biên bản + file ghi âm của tài khoản đó.
--   • Chỉ Admin (allowed_users.role = 'Admin') thấy toàn bộ.
--   • Biên bản CŨ không biết ai tạo -> chỉ Admin thấy.
--
-- ĐÂY LÀ VIỆC ĐẢO LẠI HAI QUYẾT ĐỊNH CŨ, ghi rõ để người đọc sau không tưởng
-- là sửa nhầm:
--   • supabase_schema_meetings.sql cố ý `DISABLE ROW LEVEL SECURITY` trên bảng
--     `meetings` và mở 4 policy "public" cho bucket — cả công ty dùng chung một
--     kho biên bản.
--   • 076 mục 3 ghi "giữ nguyên public = true (đã thống nhất hoãn việc siết
--     private + signed URL)". Nay làm đúng phần đã hoãn đó.
--
-- ⚠ VÌ SAO BẮT BUỘC PHẢI ĐÓNG BUCKET, KHÔNG CHỈ SIẾT BẢNG:
-- Bucket `meetings` đang public. File ghi âm nằm ở đường dẫn đoán được
-- (`recordings/<mốc thời gian>/part_000.webm`), mà URL public KHÔNG cần đăng
-- nhập. Siết RLS bảng mà để bucket public thì chỉ giấu được cái danh sách —
-- ai cầm link vẫn nghe trọn cuộc họp, kể cả người ngoài công ty.
--
-- ⚠ HỆ QUẢ ĐÃ CÂN NHẮC, KHÔNG PHẢI BỎ SÓT:
--   1. Mọi biên bản đã có từ trước migration này BIẾN MẤT khỏi danh sách của
--      nhân viên thường (created_by rỗng -> chỉ Admin mở được). Đây là lựa chọn
--      đã chốt, không phải mất dữ liệu: Admin vẫn thấy đủ và gán lại chủ được
--      bằng câu lệnh ở mục 7.
--   2. `voice_samples/` VẪN cho mọi tài khoản đã đăng nhập đọc. BẮT BUỘC như
--      vậy: lúc gỡ băng, trình duyệt của người chủ trì phải tải mẫu giọng của
--      NHỮNG NGƯỜI KHÁC để model gọi đúng tên (lib/meetingOpenAI.ts). Khoá theo
--      chủ sở hữu là tính năng tách người nói chết ngay.
--   3. Quyền GHI/XOÁ mẫu giọng giữ nguyên như cũ (mọi tài khoản đã đăng nhập).
--      Không đụng ở đây vì chốt chặn thật của việc đó nằm ở RPC
--      `set_my_voice_sample` (077) + kiểm quyền trong VoiceSampleManager.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> New Query -> dán TOÀN BỘ -> Run.
-- An toàn chạy lại nhiều lần.
-- YÊU CẦU: đã chạy supabase_schema_meetings.sql và 076.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. HAI HÀM NHẬN DIỆN NGƯỜI GỌI (idempotent, không phụ thuộc 006/018/065)
-- ─────────────────────────────────────────────────────────────

create or replace function public.caller_email()
returns text
language sql
stable
set search_path = public
as $fn$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$fn$;

create or replace function public.is_admin_caller()
returns boolean
language sql
stable
security definer          -- đọc allowed_users bất chấp RLS
set search_path = public
as $fn$
  select exists (
    select 1 from public.allowed_users au
    where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.role = 'Admin'
  );
$fn$;

-- ─────────────────────────────────────────────────────────────
-- 2. CỘT CHỦ SỞ HỮU
-- ─────────────────────────────────────────────────────────────

alter table public.meetings
  add column if not exists created_by text;

comment on column public.meetings.created_by is
  'Email người tạo biên bản, viết thường. Do trigger điền từ token — KHÔNG tin giá trị client gửi lên. Rỗng/NULL = biên bản cũ trước migration 078, chỉ Admin thấy.';

create index if not exists idx_meetings_created_by on public.meetings (lower(created_by));

-- ─────────────────────────────────────────────────────────────
-- 3. TRIGGER ĐIỀN CHỦ SỞ HỮU
--
-- Vì sao phải là trigger chứ không để client tự gửi `created_by`: client gửi gì
-- cũng được, kể cả email người khác. Trigger ghi đè bằng email trong token nên
-- không có đường giả mạo. BEFORE trigger chạy TRƯỚC khi RLS kiểm WITH CHECK,
-- nên policy INSERT ở mục 4 vẫn soi đúng giá trị đã ghi đè.
-- ─────────────────────────────────────────────────────────────

create or replace function public.meetings_stamp_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'INSERT' then
    -- nullif: phiên không có danh tính (chạy tay trong SQL Editor) để NULL,
    -- tuyệt đối không ghi chuỗi rỗng — chuỗi rỗng dễ lọt qua phép so sánh lỏng.
    new.created_by := nullif(public.caller_email(), '');
    return new;
  end if;

  -- UPDATE: chỉ Admin được đổi chủ (để gán lại biên bản cũ). Người khác sửa nội
  -- dung thoải mái nhưng không chuyển được quyền sở hữu sang mình.
  if not public.is_admin_caller() then
    new.created_by := old.created_by;
  end if;
  return new;
end $fn$;

drop trigger if exists trg_meetings_stamp_owner on public.meetings;
create trigger trg_meetings_stamp_owner
  before insert or update on public.meetings
  for each row execute function public.meetings_stamp_owner();

-- ─────────────────────────────────────────────────────────────
-- 4. RLS TRÊN BẢNG `meetings`
--
-- Xoá TOÀN BỘ policy cũ bằng vòng lặp động thay vì gọi tên: file schema gốc đặt
-- 4 policy "Allow public ...", nhưng không có gì bảo đảm chỉ có đúng 4 cái đó.
-- Sót lại MỘT policy permissive cũ là thủng sạch luật mới (policy cộng dồn theo
-- phép HOẶC).
-- ─────────────────────────────────────────────────────────────

alter table public.meetings enable row level security;

do $blk$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'meetings'
  loop
    execute format('drop policy %I on public.meetings', pol.policyname);
  end loop;
end $blk$;

-- Điều kiện "của chính mình" dùng phép BẰNG TUYỆT ĐỐI, không dùng like/position.
-- Đây đúng bẫy đã dính ở 018/050/065: so chuỗi con thì email rỗng khớp mọi dòng.
create policy "meetings select owner or admin" on public.meetings
  for select to authenticated
  using (
    public.is_admin_caller()
    or (coalesce(created_by, '') <> '' and lower(created_by) = public.caller_email())
  );

-- INSERT: chỉ cần một phiên có danh tính thật. Chủ sở hữu do trigger điền.
create policy "meetings insert authenticated" on public.meetings
  for insert to authenticated
  with check (public.caller_email() <> '');

create policy "meetings update owner or admin" on public.meetings
  for update to authenticated
  using (
    public.is_admin_caller()
    or (coalesce(created_by, '') <> '' and lower(created_by) = public.caller_email())
  )
  with check (
    public.is_admin_caller()
    or (coalesce(created_by, '') <> '' and lower(created_by) = public.caller_email())
  );

create policy "meetings delete owner or admin" on public.meetings
  for delete to authenticated
  using (
    public.is_admin_caller()
    or (coalesce(created_by, '') <> '' and lower(created_by) = public.caller_email())
  );

-- anon không có policy nào -> không đọc được dòng nào. Thu hồi luôn quyền bảng
-- cho chắc (RLS chỉ lọc dòng; GRANT mới là thứ quyết định có được chạm bảng).
revoke all on public.meetings from anon;
revoke all on public.meetings from public;
grant select, insert, update, delete on public.meetings to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. BUCKET `meetings` -> PRIVATE
-- ─────────────────────────────────────────────────────────────
-- Từ đây URL dạng /object/public/meetings/... trả lỗi. Giao diện phải xin
-- signed URL (lib/meetingFiles.ts). Giữ nguyên mime types + trần 500MB của 076.

update storage.buckets set public = false where id = 'meetings';

-- ─────────────────────────────────────────────────────────────
-- 6. POLICY CHO FILE TRONG BUCKET
--
-- ⚠ Bọc trong khối bắt lỗi: trên một số dự án Supabase, vai trò chạy SQL Editor
-- không phải chủ bảng storage.objects -> `create policy` báo "must be owner of
-- table objects". Phần còn lại của migration VẪN ĐÚNG; khi đó vào
-- Storage > meetings > Policies tạo tay theo đúng 4 mệnh đề dưới đây.
--
-- Nhận diện chủ file bằng cột owner/owner_id của chính Storage (Supabase tự điền
-- uid người upload) — KHÔNG bịa thêm thư mục theo uid, nhờ vậy các file đã có
-- vẫn đúng chủ mà không phải di dời.
-- ─────────────────────────────────────────────────────────────

do $blk$
declare
  pol          record;
  has_owner_id boolean;
  has_owner    boolean;
  owner_expr   text;
  mine         text;
begin
  select exists (select 1 from information_schema.columns
                 where table_schema = 'storage' and table_name = 'objects' and column_name = 'owner_id')
    into has_owner_id;
  select exists (select 1 from information_schema.columns
                 where table_schema = 'storage' and table_name = 'objects' and column_name = 'owner')
    into has_owner;

  if has_owner_id and has_owner then owner_expr := 'coalesce(owner_id, owner::text)';
  elsif has_owner_id            then owner_expr := 'owner_id';
  elsif has_owner               then owner_expr := 'owner::text';
  else                               owner_expr := 'null::text';
  end if;

  -- "File của tôi, hoặc tôi là Admin, hoặc đây là mẫu giọng dùng chung"
  mine := format(
    '(bucket_id = ''meetings'' and (
        (storage.foldername(name))[1] = ''voice_samples''
        or public.is_admin_caller()
        or %s = auth.uid()::text))', owner_expr);

  -- Xoá mọi policy cũ có nhắc tới bucket này. Lọc theo chuỗi có nháy ''meetings''
  -- nên không đụng policy của bucket khác (news-media, task-files, gps-checkins...).
  for pol in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%''meetings''%'
  loop
    execute format('drop policy %I on storage.objects', pol.policyname);
  end loop;

  execute format($p$ create policy "meeting files select owner or admin" on storage.objects
                     for select to authenticated using %s $p$, mine);

  -- Upload: tài khoản nào đã đăng nhập cũng ghi được (ghi âm, mẫu giọng, file
  -- Word xuất ra). Quyền ĐỌC mới là thứ siết.
  execute $p$ create policy "meeting files insert authenticated" on storage.objects
              for insert to authenticated with check (bucket_id = 'meetings') $p$;

  execute format($p$ create policy "meeting files update owner or admin" on storage.objects
                     for update to authenticated using %s with check %s $p$, mine, mine);

  execute format($p$ create policy "meeting files delete owner or admin" on storage.objects
                     for delete to authenticated using %s $p$, mine);

  raise notice 'Policy bucket meetings đã đặt xong (nhận diện chủ file bằng: %).', owner_expr;
exception when others then
  raise warning 'KHÔNG đặt được policy cho storage.objects (%). Phần còn lại của migration VẪN CHẠY ĐÚNG. Hãy vào Supabase > Storage > meetings > Policies và tạo tay 4 policy theo mục 6.', sqlerrm;
end $blk$;

-- ─────────────────────────────────────────────────────────────
-- 7. GÁN CHỦ CHO BIÊN BẢN CŨ (TUỲ CHỌN — mặc định KHÔNG chạy)
-- ─────────────────────────────────────────────────────────────
-- Mặc định biên bản cũ chỉ Admin thấy. Muốn trả một biên bản về cho người phụ
-- trách thì Admin bỏ dấu chú thích và sửa hai giá trị dưới đây rồi chạy.
-- (Admin chạy được vì trigger ở mục 3 cho phép Admin đổi chủ.)
--
-- update public.meetings
--    set created_by = 'nguoiphutrach@trungnamec.com.vn'
--  where id = '00000000-0000-0000-0000-000000000000';

-- ─────────────────────────────────────────────────────────────
-- KIỂM TRA
-- ─────────────────────────────────────────────────────────────

-- 1) RLS đã bật (mong đợi: rls_bat = true)
select relname, relrowsecurity as rls_bat
from pg_class where oid = 'public.meetings'::regclass;

-- 2) Đúng 4 policy mới, không còn "Allow public ..." (mong đợi: 4 dòng)
select policyname, cmd, roles
from pg_policies where schemaname = 'public' and tablename = 'meetings'
order by policyname;

-- 3) Bucket đã private (mong đợi: public = false)
select id, public, file_size_limit from storage.buckets where id = 'meetings';

-- 4) Policy file (mong đợi: 4 dòng "meeting files ...")
select policyname, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'meeting files%'
order by policyname;

-- 5) Chạy trong SQL Editor (không có JWT) thì PHẢI ra false/rỗng — nếu ra true
--    là hàm nhận diện bị thủng, dừng lại đừng deploy.
select public.is_admin_caller() as phai_la_false, public.caller_email() as phai_rong;

-- 6) Còn bao nhiêu biên bản chưa có chủ (chỉ Admin thấy)
select count(*) filter (where coalesce(created_by, '') = '')  as bien_ban_cu_chi_admin_thay,
       count(*) filter (where coalesce(created_by, '') <> '') as da_co_chu,
       count(*)                                               as tong
from public.meetings;
