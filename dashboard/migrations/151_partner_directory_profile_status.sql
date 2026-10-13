-- ============================================================
-- 151 — DANH BẠ ĐỐI TÁC: LINK "PROFILE CÔNG TY" + TRẠNG THÁI "LƯU THÔNG TIN"
--
-- Sếp/user yêu cầu 13/10/2026:
--   • Thêm ô link "Profile công ty" (cạnh Website) -> cột profile_url.
--   • Thêm trạng thái "Lưu thông tin": đối tác chỉ lưu để tham khảo, chưa hợp tác
--     -> giá trị 'saved' trong ràng buộc status.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 150.
-- ============================================================

alter table public.partner_directory
  add column if not exists profile_url text;

-- Xoá ràng buộc status cũ (tìm theo nội dung, không đoán tên) rồi tạo lại có 'saved'.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.partner_directory'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.partner_directory drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.partner_directory
  add constraint partner_directory_status_chk
  check (status in ('active', 'saved', 'paused', 'blacklist'));

-- ─── KIỂM TRA ───
select 'cột profile_url' as muc, count(*)::text as ket_qua from information_schema.columns
 where table_schema = 'public' and table_name = 'partner_directory' and column_name = 'profile_url'  -- mong đợi 1
union all
select 'ràng buộc status có saved', count(*)::text from pg_constraint
 where conrelid = 'public.partner_directory'::regclass and contype = 'c'
   and pg_get_constraintdef(oid) ilike '%saved%';                                                     -- mong đợi 1
