-- ============================================================
-- 160 — KHẤU TRỪ PPE: DÙNG CHUNG BẢNG atld_penalties, PHÂN BIỆT BẰNG CỘT kind
--
-- User yêu cầu 21/10/2026: thêm tab "Khấu trừ PPE" ngay dưới "Khấu trừ xử phạt", cùng
-- cấu trúc (bảng Excel "KHẤU TRỪ - CẤP PHÁT PPE THU HỒI CHI PHÍ (ATLĐ & KHĐT)").
--   • Cột kind: 'penalty' (mặc định, toàn bộ hồ sơ cũ) | 'ppe'.
--   • Mã hồ sơ PPE: "HS.PPE-2026-001", đánh số riêng theo (năm, loại) — hồ sơ xử phạt
--     vẫn "HS.XP-…" và giữ nguyên số.
--   • Quyền, cờ, RLS, bucket tệp, yêu cầu xoá chờ duyệt: DÙNG CHUNG với xử phạt
--     (cùng cờ can_input_atld_penalty / can_process_atld_penalty) — không cần tích cờ mới.
--   • kind không đổi được sau khi tạo (trigger).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 139–148.
-- ============================================================

alter table public.atld_penalties
  add column if not exists kind text not null default 'penalty';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'atld_penalties_kind_check') then
    alter table public.atld_penalties
      add constraint atld_penalties_kind_check check (kind in ('penalty', 'ppe'));
  end if;
end $$;

-- Số thứ tự tính riêng cho từng loại: (nam, seq) -> (nam, kind, seq).
alter table public.atld_penalties drop constraint if exists atld_penalties_nam_seq_key;
create unique index if not exists atld_penalties_nam_kind_seq_key on public.atld_penalties (nam, kind, seq);

create or replace function public.atld_penalties_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  can_in  boolean := public.atld_penalty_is_input();
  can_out boolean := public.atld_penalty_is_process();
begin
  if tg_op = 'INSERT' then
    new.nam := extract(year from (now() at time zone 'Asia/Ho_Chi_Minh'))::int;
    perform pg_advisory_xact_lock(hashtext('atld_penalty_' || new.kind || '_' || new.nam));
    select coalesce(max(seq), 0) + 1 into new.seq from public.atld_penalties where nam = new.nam and kind = new.kind;
    new.ma_ho_so   := case when new.kind = 'ppe' then 'HS.PPE-' else 'HS.XP-' end || new.nam || '-' || lpad(new.seq::text, 3, '0');
    new.created_by := public.caller_email();
    new.created_at := now();
    if not can_out then
      new.ngay_tiep_nhan := null; new.dot_thanh_toan := null; new.gia_tri_da_tru := 0;
      new.ngay_khau_tru := null;  new.so_chung_tu := null;    new.nguoi_nhap := null;
      new.ghi_chu := null;
      new.ct_file_path := null;   new.ct_file_name := null;   new.ct_link := null;
    end if;
  else
    new.nam := old.nam; new.seq := old.seq; new.ma_ho_so := old.ma_ho_so; new.kind := old.kind;
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
select 'cột kind' as muc, count(*)::text as ket_qua from information_schema.columns
 where table_schema = 'public' and table_name = 'atld_penalties' and column_name = 'kind'          -- mong đợi 1
union all
select 'ràng buộc (nam, kind, seq)', count(*)::text from pg_indexes
 where tablename = 'atld_penalties' and indexname = 'atld_penalties_nam_kind_seq_key'               -- mong đợi 1
union all
select 'hồ sơ cũ vẫn là penalty', count(*)::text from public.atld_penalties where kind = 'penalty';  -- = số hồ sơ xử phạt hiện có
