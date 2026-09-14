-- ============================================================
-- 076 — BIÊN BẢN HỌP: GHI ÂM TRỰC TIẾP + TÁCH NGƯỜI NÓI (DIARIZATION)
--
-- HIỆN TRẠNG:
-- Bảng `meetings` dựng tay từ supabase_schema_meetings.sql, chỉ đủ cho luồng
-- "tải 1 file lên -> whisper gỡ băng -> AI dựng biên bản". Bản gỡ băng là một
-- cục text, không biết ai nói câu nào, không biết câu đó ở giây thứ mấy.
--
-- CÁCH SỬA:
-- Thêm các cột phục vụ 4 thứ mới:
--   1. Ghi âm ngay trong app, tự cắt mỗi 20 phút -> NHIỀU file cho MỘT cuộc họp
--      (OpenAI chặn cứng 25MB/lần gọi API gỡ băng, không có cách lách).
--   2. Biết giờ đồng hồ thật lúc bấm Ghi -> timeline trong biên bản là giờ thật
--      chứ không phải giờ AI bịa ra.
--   3. Giữ lại từng câu kèm người nói + mốc giây -> bấm vào đầu việc là tua đúng
--      đoạn ghi âm để kiểm chứng.
--   4. Ghi nhận đã xoá file ghi âm lúc nào, ai xoá (dọn dung lượng sau khi chốt).
--
-- KÈM THEO: cột `voice_sample_path` trên `employees` (mẫu giọng 2-10 giây, để AI
-- gọi thẳng tên thật thay vì nhãn "Speaker 1/2/3") và mở thêm mime type webm cho
-- bucket `meetings` — MediaRecorder của Chrome/Edge xuất webm, THIẾU mime này là
-- Storage chặn thẳng lúc upload.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> New Query -> dán -> Run.
-- An toàn chạy lại nhiều lần.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. BẢNG `meetings` — các cột mới
-- ─────────────────────────────────────────────────────────────

alter table public.meetings
  add column if not exists audio_paths          text[]      default '{}'::text[],
  add column if not exists audio_segments       jsonb       default '[]'::jsonb,
  add column if not exists recording_started_at timestamptz,
  add column if not exists transcript_segments  jsonb       default '[]'::jsonb,
  add column if not exists speaker_map          jsonb       default '{}'::jsonb,
  add column if not exists audio_deleted_at     timestamptz,
  add column if not exists audio_deleted_by     text,
  add column if not exists ai_model             text;

comment on column public.meetings.audio_paths is
  'Đường dẫn Storage của MỌI đoạn ghi âm thuộc cuộc họp này. Dùng để xoá file. Giữ nguyên sau khi xoá làm dấu vết đã xoá những gì.';
comment on column public.meetings.audio_segments is
  'Bản đồ đoạn: [{path, offsetSec, durationSec}]. Để biết giây thứ N của cuộc họp nằm trong file nào -> nút tua theo mốc trích dẫn mới chạy được với họp nhiều đoạn.';
comment on column public.meetings.recording_started_at is
  'Giờ đồng hồ thật lúc bấm Ghi âm. CHỈ có ở đường ghi trực tiếp; tải file lên thì để NULL (timeline khi đó chỉ là khoảng thời gian, không phải giờ họp).';
comment on column public.meetings.transcript_segments is
  'Bản gỡ băng có cấu trúc: [{speaker, start, end, text}], start/end tính theo trục thời gian CẢ cuộc họp (đã cộng offset của đoạn).';
comment on column public.meetings.speaker_map is
  'Gán nhãn máy sang tên người thật: {"Speaker 1": "Nguyễn Văn A"}. Người kiểm tra điền tay ở màn Review.';
comment on column public.meetings.ai_model is
  'Model đã dùng để dựng biên bản, để so chất lượng giữa các lần chạy.';

-- Bỏ giá trị mặc định 09:00 / 10:30 của giờ họp.
-- Lý do: điền sẵn giờ giả vào biên bản chính thức nguy hiểm hơn là để trống cho
-- người dùng tự điền — cả prompt AI lẫn CSDL đều phải theo cùng một luật này.
alter table public.meetings alter column start_time drop default;
alter table public.meetings alter column end_time   drop default;

-- ─────────────────────────────────────────────────────────────
-- 2. BẢNG `employees` — mẫu giọng
-- ─────────────────────────────────────────────────────────────

alter table public.employees
  add column if not exists voice_sample_path text;

comment on column public.employees.voice_sample_path is
  'Đường dẫn mẫu giọng 2-10 giây trong bucket meetings (voice_samples/<id>.webm). Truyền cho model diarization để gọi thẳng tên thật thay vì Speaker 1/2/3.';

-- ─── Dựng lại view `employees_directory` để có cột mới (giữ nguyên logic 066) ───
-- Trang Biên bản họp đọc view này (không đọc bảng gốc, vì bảng gốc khoá PII) nên
-- cột mới phải có mặt trong view thì mới chọn được người có mẫu giọng.
drop view if exists public.employees_directory;

do $$
declare
  cols text;
  has_notes boolean;
  resigned_expr text;
  excluded_expr text;
begin
  -- Bộ cột "không PII" — giữ nguyên đúng danh sách của migration 011.
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
  into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'employees'
    and column_name not in (
      'cccd', 'cccd_date', 'cccd_place',
      'permanent_address', 'temporary_address',
      'emergency_contact_name', 'emergency_contact_relationship',
      'emergency_contact_phone',
      'notes'
    );

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'notes'
  ) into has_notes;

  -- ── is_resigned: giữ nguyên y hệt migration 031 ──
  resigned_expr :=
    '(lower(coalesce(status, '''')) like ''%nghỉ việc%'' or lower(coalesce(status, '''')) like ''%nghi viec%'')';
  if has_notes then
    resigned_expr := resigned_expr ||
      ' or (lower(coalesce(notes, '''')) like ''%nghỉ việc%'' or lower(coalesce(notes, '''')) like ''%nghi viec%'')';
  end if;

  -- ── is_excluded_from_benefits: giữ nguyên y hệt migration 032 ──
  excluded_expr := format(
    'lower(concat_ws('' '', %s, coalesce(status, ''''))) ~ ''(kiêm nhiệm|kiem nhiem|nghỉ việc|nghi viec)''',
    case when has_notes then 'coalesce(notes, '''')' else '''''' end
  );

  execute format(
    'create view public.employees_directory as
       select %s,
              (%s) as is_resigned,
              (%s) as is_excluded_from_benefits
       from public.employees',
    cols, resigned_expr, excluded_expr
  );

  raise notice 'employees_directory dựng lại, cột = %', cols;
end $$;

-- Thu hồi TRƯỚC, cấp SAU — bẫy GRANT của view (xem 011/056/066): view KHÔNG chịu
-- RLS, ai được GRANT là đọc sạch, mà Supabase cấp sẵn quyền cho anon/PUBLIC trên
-- object mới trong schema public. View vừa DROP rồi tạo mới nên bước này BẮT BUỘC.
revoke all on public.employees_directory from public;
revoke all on public.employees_directory from anon;
grant select on public.employees_directory to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. BUCKET `meetings` — mở mime type cho ghi âm của trình duyệt
-- ─────────────────────────────────────────────────────────────
-- BẮT BUỘC phải có audio/webm: MediaRecorder trên Chrome/Edge xuất webm, một số
-- máy gắn nhãn video/webm kể cả khi chỉ thu tiếng. Thiếu là upload bị chặn thẳng.
-- Giữ nguyên public = true (đã thống nhất hoãn việc siết private + signed URL).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meetings', 'meetings', true, 524288000,
  array[
    'audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/m4a','audio/x-m4a',
    'audio/mp4','audio/webm','audio/ogg','video/webm',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ]
)
on conflict (id) do update set
  public = true,
  file_size_limit = 524288000,
  allowed_mime_types = array[
    'audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/m4a','audio/x-m4a',
    'audio/mp4','audio/webm','audio/ogg','video/webm',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ];

-- ─────────────────────────────────────────────────────────────
-- KIỂM TRA
-- ─────────────────────────────────────────────────────────────

-- 1) 8 cột mới của meetings (mong đợi: 8 dòng)
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'meetings'
  and column_name in ('audio_paths','audio_segments','recording_started_at',
                      'transcript_segments','speaker_map','audio_deleted_at',
                      'audio_deleted_by','ai_model')
order by column_name;

-- 2) Giờ họp KHÔNG còn mặc định (mong đợi: 2 dòng, column_default rỗng)
select column_name, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'meetings'
  and column_name in ('start_time','end_time');

-- 3) voice_sample_path có trong CẢ bảng gốc lẫn view (mong đợi: 2 dòng)
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('employees','employees_directory')
  and column_name = 'voice_sample_path'
order by table_name;

-- 4) anon KHÔNG đọc được view, authenticated ĐƯỢC (mong đợi đúng 1 dòng: authenticated)
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'employees_directory'
order by grantee;

-- 5) Bucket đã nhận webm chưa (mong đợi: thấy audio/webm và video/webm)
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'meetings';
