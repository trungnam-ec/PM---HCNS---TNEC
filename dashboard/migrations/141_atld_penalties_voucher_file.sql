-- ============================================================
-- 141 — KHẤU TRỪ XỬ PHẠT: ĐÍNH KÈM TỆP / LINK CHO "SỐ CHỨNG TỪ" (P.KHĐT)
--
-- User yêu cầu 07/10/2026: Số chứng từ của KHĐT cũng tải tệp lên (có icon mắt
-- xem) hoặc dán link, giống Số QĐ của P.ATLĐ (139).
--   • 3 cột ct_file_path / ct_file_name / ct_link — thuộc nhóm cột ĐẦU RA:
--     chỉ cờ can_process_atld_penalty (KHĐT) / Admin sửa được (trigger 139 viết lại).
--   • Tệp chung bucket atld-penalty nhưng nằm thư mục "<id hồ sơ>/ct/…":
--     P.ATLĐ chỉ ghi/xoá được tệp QĐ (ngoài thư mục ct), KHĐT chỉ ghi/xoá tệp ct.
--   • XOÁ HỒ SƠ (user chốt cùng ngày): icon thùng rác cạnh nút sửa, CHỈ cờ P.ATLĐ
--     (can_input_atld_penalty) + Admin — bỏ điều kiện "KHĐT chưa trừ đồng nào"
--     của 139. Người xoá được hồ sơ cũng xoá được tệp chứng từ của hồ sơ đó.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 139.
-- ============================================================

alter table public.atld_penalties
  add column if not exists ct_file_path text,
  add column if not exists ct_file_name text,
  add column if not exists ct_link      text;

create or replace function public.atld_penalties_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  can_in  boolean := public.atld_penalty_is_input();
  can_out boolean := public.atld_penalty_is_process();
begin
  if tg_op = 'INSERT' then
    new.nam := extract(year from (now() at time zone 'Asia/Ho_Chi_Minh'))::int;
    perform pg_advisory_xact_lock(hashtext('atld_penalty_' || new.nam));
    select coalesce(max(seq), 0) + 1 into new.seq from public.atld_penalties where nam = new.nam;
    new.ma_ho_so   := 'HS.XP-' || new.nam || '-' || lpad(new.seq::text, 3, '0');
    new.created_by := public.caller_email();
    new.created_at := now();
    if not can_out then
      new.ngay_tiep_nhan := null; new.dot_thanh_toan := null; new.gia_tri_da_tru := 0;
      new.ngay_khau_tru := null;  new.so_chung_tu := null;    new.nguoi_nhap := null;
      new.ghi_chu := null;
      new.ct_file_path := null;   new.ct_file_name := null;   new.ct_link := null;
    end if;
  else
    new.nam := old.nam; new.seq := old.seq; new.ma_ho_so := old.ma_ho_so;
    new.created_by := old.created_by; new.created_at := old.created_at;
    if not can_in then
      new.loai_ho_so := old.loai_ho_so;       new.so_quyet_dinh := old.so_quyet_dinh;
      new.qd_file_path := old.qd_file_path;   new.qd_file_name := old.qd_file_name;
      new.qd_link := old.qd_link;             new.ngay_ban_hanh := old.ngay_ban_hanh;
      new.project_code := old.project_code;   new.project_name := old.project_name;
      new.contractor_id := old.contractor_id; new.contractor_name := old.contractor_name;
      new.noi_dung := old.noi_dung;           new.gia_tri_phai_tru := old.gia_tri_phai_tru;
      new.nguoi_lap := old.nguoi_lap;         new.ngay_gui_khdt := old.ngay_gui_khdt;
    end if;
    if not can_out then
      new.ngay_tiep_nhan := old.ngay_tiep_nhan; new.dot_thanh_toan := old.dot_thanh_toan;
      new.gia_tri_da_tru := old.gia_tri_da_tru; new.ngay_khau_tru := old.ngay_khau_tru;
      new.so_chung_tu := old.so_chung_tu;       new.nguoi_nhap := old.nguoi_nhap;
      new.ghi_chu := old.ghi_chu;
      new.ct_file_path := old.ct_file_path;     new.ct_file_name := old.ct_file_name;
      new.ct_link := old.ct_link;
    end if;
  end if;
  if new.qd_link is not null and trim(new.qd_link) = '' then new.qd_link := null; end if;
  if new.ct_link is not null and trim(new.ct_link) = '' then new.ct_link := null; end if;
  if new.qd_link is not null and new.qd_link !~* '^https?://' then
    raise exception 'Link quyết định phải bắt đầu bằng http:// hoặc https://';
  end if;
  if new.ct_link is not null and new.ct_link !~* '^https?://' then
    raise exception 'Link chứng từ phải bắt đầu bằng http:// hoặc https://';
  end if;
  new.updated_by := public.caller_email();
  new.updated_at := now();
  return new;
end;
$$;

-- Storage: tách quyền ghi/xoá theo thư mục (QĐ = ATLĐ, ct = KHĐT). Đọc giữ như 139.
do $$
begin
  execute 'drop policy if exists "atld penalty insert" on storage.objects';
  execute 'drop policy if exists "atld penalty delete" on storage.objects';
  execute $p$
    create policy "atld penalty insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'atld-penalty' and (
        (public.atld_penalty_is_input()   and coalesce((storage.foldername(name))[2], '') <> 'ct') or
        (public.atld_penalty_is_process() and (storage.foldername(name))[2] = 'ct')))
  $p$;
  -- P.ATLĐ xoá được mọi tệp (cần khi xoá cả hồ sơ); KHĐT chỉ tệp chứng từ.
  execute $p$
    create policy "atld penalty delete" on storage.objects for delete to authenticated
      using (bucket_id = 'atld-penalty' and (
        public.atld_penalty_is_input() or
        (public.atld_penalty_is_process() and (storage.foldername(name))[2] = 'ct')))
  $p$;
exception
  when insufficient_privilege or others then
    raise warning 'KHÔNG đặt được policy storage (%). Sửa tay trong Supabase > Storage > atld-penalty > Policies.', sqlerrm;
end $$;

-- Xoá hồ sơ: chỉ P.ATLĐ / Admin, không còn điều kiện chưa khấu trừ.
drop policy if exists atld_penalties_delete on public.atld_penalties;
create policy atld_penalties_delete on public.atld_penalties for delete to authenticated
  using (public.atld_penalty_is_input());

-- KIỂM TRA
select 'policy xoá hồ sơ (không còn điều kiện đã trừ)' as muc,
       count(*)::text as ket_qua from pg_policies
 where schemaname = 'public' and tablename = 'atld_penalties' and policyname = 'atld_penalties_delete'
   and qual not ilike '%gia_tri_da_tru%'                                                          -- mong đợi 1
union all
select 'cột ct_', count(*)::text as ket_qua from information_schema.columns
 where table_schema = 'public' and table_name = 'atld_penalties' and column_name like 'ct\_%'   -- mong đợi 3
union all
select 'policy storage atld penalty', count(*)::text from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and policyname like 'atld penalty%';    -- mong đợi 3
