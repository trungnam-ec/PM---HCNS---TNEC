-- ============================================================
-- 148 — HỒ SƠ KHẤU TRỪ XỬ PHẠT: THÊM CỘT "NGƯỜI VI PHẠM"
--
-- User yêu cầu 09/10/2026: cột Người vi phạm (gõ tay) đứng sau Nhà thầu phụ; lúc
-- "Xuất phiếu" Quyết định xử phạt thì điền vào dòng "- Người vi phạm:".
-- Thuộc nhóm cột P.ATLĐ: trigger 147 viết lại, thêm đúng 1 dòng giữ nguoi_vi_pham
-- khi người sửa không có cờ nhập (KHĐT không đổi được).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 147.
-- ============================================================

alter table public.atld_penalties add column if not exists nguoi_vi_pham text;

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
      new.vi_pham := old.vi_pham;             -- 147
      new.nguoi_vi_pham := old.nguoi_vi_pham; -- 148
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

-- KIỂM TRA
select 'cột nguoi_vi_pham' as muc, count(*)::text as ket_qua from information_schema.columns
 where table_name = 'atld_penalties' and column_name = 'nguoi_vi_pham'                                    -- mong đợi 1
union all
select 'trigger giữ nguoi_vi_pham cho P.ATLĐ', count(*)::text from pg_proc
 where proname = 'atld_penalties_before_write' and prosrc ilike '%new.nguoi_vi_pham := old.nguoi_vi_pham%';  -- mong đợi 1
