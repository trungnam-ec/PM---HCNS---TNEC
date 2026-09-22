-- ============================================================
-- 091 — PHIẾU TRÌNH KÝ: THÊM "PHIẾU YÊU CẦU" VÀ "ĐƠN ĐẶT HÀNG"
--
-- LÝ DO (user chốt 22/09/2026): hai biểu mẫu giấy đang dùng tay, đưa vào module
-- cho đi chung một luồng duyệt với 4 loại đã có.
--
--   phieu_yeu_cau : HC-BM 023/PYC  — yêu cầu cấp vật tư / hàng hoá / thiết bị.
--                   Bảng 6 cột: STT · Tên · Quy cách · ĐVT · Số lượng · Ngày cấp.
--   don_dat_hang  : KD/BM/001      — đơn đặt hàng cho dự án. Bảng 13 cột (định
--                   mức, luỹ kế 5a/5b, chênh lệch, đề xuất 7a/7b…) + ~15 ô đầu
--                   phiếu riêng. Xuất ra EXCEL, không phải Word.
--
-- LUỒNG DUYỆT — cả hai ĐÚNG 2 CẤP như tờ trình (user chốt), khớp ô ký trên giấy:
--   Người yêu cầu (người lập) → Phụ trách bộ phận (cấp 1) → Thủ trưởng đơn vị.
-- Các ô ký còn lại trên tờ giấy (P.VT, P.QLDA, xác nhận CĐT/BĐH…) để TRẮNG cho
-- người ta ký tay — đúng cách 4 loại phiếu hiện có đang làm.
--
-- HAI CỘT JSONB thay vì ~20 cột rời:
--   vat_tu   : mảng dòng vật tư. Số cột KHÁC NHAU theo loại phiếu (6 vs 13) nên
--              dựng cột riêng cho từng trường là đẻ ra 19 cột mà loại nào cũng
--              chỉ dùng một nửa. Cùng khuôn `so_sanh` (060) đã chạy ổn định.
--   chi_tiet : các ô đầu phiếu riêng của Đơn đặt hàng (số ĐĐH, đơn vị nhận nợ,
--              địa chỉ nhận hàng, người nhận hàng + SĐT, cán bộ kỹ thuật + SĐT,
--              tài liệu kèm theo, CĐT có thanh toán hay không, nguyên nhân phát
--              sinh…). Không cột nào trong số đó được lọc / cộng / sắp xếp —
--              chỉ để dựng form và đổ ra file, nên jsonb là đúng chỗ.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ -> Run.
-- An toàn chạy lại nhiều lần. YÊU CẦU: đã chạy 050, 060, 074, 079, 088.
-- ============================================================

-- ─── 1. NỚI CHECK `loai` ───
alter table public.signing_submissions
  drop constraint if exists signing_submissions_loai_check;
alter table public.signing_submissions
  add constraint signing_submissions_loai_check
  check (loai in ('ho_so', 'hop_dong', 'chuyen_tien', 'to_trinh',
                  'phieu_yeu_cau', 'don_dat_hang'));

-- ─── 2. HAI CỘT JSONB ───
-- Mặc định KHÁC NHAU: `vat_tu` là MẢNG dòng, `chi_tiet` là OBJECT các ô rời.
-- Đặt nhầm mặc định thì code client đọc `.length` trên object -> undefined.
alter table public.signing_submissions
  add column if not exists vat_tu   jsonb not null default '[]'::jsonb,
  add column if not exists chi_tiet jsonb not null default '{}'::jsonb;

comment on column public.signing_submissions.vat_tu is
  'Mang dong vat tu. 6 truong voi loai=phieu_yeu_cau, 13 truong voi don_dat_hang (091).';
comment on column public.signing_submissions.chi_tiet is
  'Cac o dau phieu rieng cua loai=don_dat_hang (091). Object phang, gia tri text.';

-- ─── 3. TRIGGER: KHOÁ LUÔN HAI CỘT MỚI ───
-- Thiếu hai cột này trong danh sách thì cấp duyệt sửa được bảng vật tư ngay lúc
-- bấm Duyệt — đúng loại lỗ hổng mà danh sách này sinh ra để bịt.
-- Phần còn lại chép NGUYÊN VĂN từ 088.

create or replace function public.guard_signing_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_email text    := public.caller_email();
  is_admin  boolean := public.is_admin_caller();
  is_owner  boolean := jwt_email <> '' and lower(old.created_by) = jwt_email;
  has_route boolean := jsonb_typeof(old.route) = 'array' and jsonb_array_length(old.route) > 0;
  has_qlda  boolean := public.signing_caller_qlda();
  has_khdt  boolean := public.signing_caller_khdt();
  has_acct  boolean := public.signing_caller_acct();
  has_gd    boolean := 'cho_giam_doc' = any(public.signing_stages_of_caller());
  is_cap1   boolean := old.cap1_email is not null and jwt_email <> ''
                       and position(jwt_email in lower(old.cap1_email)) > 0;
  holds_old boolean;
  cur_idx   int;
  nxt       text;
begin
  -- Ai đang giữ chặng old.status?
  holds_old := case old.status
    when 'cho_cap1'         then is_cap1 or (old.cap1_email is null and is_admin)
    when 'cho_pho_giam_doc' then has_qlda or has_khdt      -- legacy gộp
    when 'cho_pgd_qlda'     then has_qlda
    when 'cho_pgd_khdt'     then has_khdt
    when 'cho_giam_doc'     then has_gd
    when 'cho_ke_toan'      then has_acct
    else false end;

  -- 1) Không đổi trạng thái: chỉ người lập sửa nội dung, và chỉ ở nháp/trả lại.
  if old.status = new.status then
    if not (is_admin or (is_owner and old.status in ('nhap','tra_lai'))) then
      raise exception 'Phiếu đang ở bước "%" nên không sửa được nội dung.', old.status;
    end if;
    return new;
  end if;

  if is_admin then return new; end if;

  -- 2) NGƯỜI DUYỆT KHÔNG ĐƯỢC SỬA SỐ LIỆU / ĐỊNH TUYẾN.
  if not is_owner then
    if  new.don_vi               is distinct from old.don_vi
     or new.ve_viec              is distinct from old.ve_viec
     or new.noi_dung_trinh       is distinct from old.noi_dung_trinh
     or new.dot_so               is distinct from old.dot_so
     or new.chu_dau_tu           is distinct from old.chu_dau_tu
     or new.du_an                is distinct from old.du_an
     or new.hop_dong_so          is distinct from old.hop_dong_so
     or new.ngay_ky_hop_dong     is distinct from old.ngay_ky_hop_dong
     or new.goi_thau             is distinct from old.goi_thau
     or new.gia_tri_hd           is distinct from old.gia_tri_hd
     or new.gia_tri_nghiem_thu   is distinct from old.gia_tri_nghiem_thu
     or new.giu_bao_hanh         is distinct from old.giu_bao_hanh
     or new.giu_lai_tung_lan     is distinct from old.giu_lai_tung_lan
     or new.ty_le_giu_lai        is distinct from old.ty_le_giu_lai
     or new.khau_tru_tam_ung     is distinct from old.khau_tru_tam_ung
     or new.ty_le_thu_hoi        is distinct from old.ty_le_thu_hoi
     or new.de_nghi_thanh_toan   is distinct from old.de_nghi_thanh_toan
     or new.luy_ke_da_thanh_toan is distinct from old.luy_ke_da_thanh_toan
     or new.tam_ung_con_lai      is distinct from old.tam_ung_con_lai
     or new.project_code         is distinct from old.project_code
     or new.files                is distinct from old.files
     or new.created_by           is distinct from old.created_by
     or new.loai                 is distinct from old.loai
     or new.hang_muc             is distinct from old.hang_muc
     or new.ben_a                is distinct from old.ben_a
     or new.ben_b                is distinct from old.ben_b
     or new.vat_percent          is distinct from old.vat_percent
     or new.so_sanh              is distinct from old.so_sanh
     or new.route                is distinct from old.route
     or new.cap1_email           is distinct from old.cap1_email
     or new.pgd_chon             is distinct from old.pgd_chon
     -- 079 — tài khoản nhận tiền của giấy đề nghị chuyển tiền
     or new.so_tai_khoan         is distinct from old.so_tai_khoan
     or new.ngan_hang            is distinct from old.ngan_hang
     -- 088 — nội dung riêng của tờ trình
     or new.so_to_trinh          is distinct from old.so_to_trinh
     or new.can_cu               is distinct from old.can_cu
     or new.kien_nghi            is distinct from old.kien_nghi
     -- 091 — bảng vật tư + các ô đầu phiếu của Phiếu yêu cầu / Đơn đặt hàng
     or new.vat_tu               is distinct from old.vat_tu
     or new.chi_tiet             is distinct from old.chi_tiet
    then
      raise exception 'Người duyệt không được sửa số liệu / định tuyến trên phiếu. Nếu sai, hãy TRẢ LẠI để người lập sửa.';
    end if;
  end if;

  -- 3) Trả lại: chỉ cấp ĐANG giữ phiếu, và phải ghi lý do.
  if new.status = 'tra_lai' then
    if not holds_old then
      raise exception 'Bạn không phải cấp đang xử lý phiếu này nên không trả lại được.';
    end if;
    if coalesce(new.tra_lai_ly_do, '') = '' then
      raise exception 'Phải ghi lý do khi trả lại phiếu.';
    end if;
    return new;
  end if;

  -- 4) PHIẾU MỚI — đi theo route của chính phiếu.
  if has_route then
    if old.status in ('nhap','tra_lai') then
      if new.status <> (old.route ->> 0) then
        raise exception 'Bước đầu của phiếu phải là "%".', old.route ->> 0;
      end if;
      if not is_owner then
        raise exception 'Chỉ người lập phiếu mới được trình phiếu.';
      end if;
      return new;
    end if;

    select (t.ord - 1) into cur_idx
      from jsonb_array_elements_text(old.route) with ordinality as t(val, ord)
      where t.val = old.status
      limit 1;
    if cur_idx is null then
      raise exception 'Trạng thái "%" không nằm trong luồng của phiếu.', old.status;
    end if;
    if cur_idx + 1 >= jsonb_array_length(old.route) then
      nxt := 'hoan_tat';
    else
      nxt := old.route ->> (cur_idx + 1);
    end if;
    if new.status <> nxt then
      raise exception 'Không chuyển được từ "%" sang "%".', old.status, new.status;
    end if;
    if not holds_old then
      raise exception 'Bạn không phải cấp đang giữ phiếu này.';
    end if;
    return new;
  end if;

  -- 5) PHIẾU CŨ (route rỗng) — giữ nguyên luật 060.
  if old.status in ('nhap','tra_lai') and new.status = 'cho_pho_giam_doc' then
    if not is_owner then
      raise exception 'Chỉ người lập phiếu mới được trình phiếu.';
    end if;
    return new;
  end if;
  if holds_old then
    if old.status = 'cho_pho_giam_doc' and new.status = 'cho_giam_doc' then
      return new;
    end if;
    if old.status = 'cho_giam_doc' then
      if old.loai = 'hop_dong' and new.status = 'hoan_tat' then return new; end if;
      if old.loai <> 'hop_dong' and new.status = 'cho_ke_toan' then return new; end if;
    end if;
    if old.status = 'cho_ke_toan' and new.status = 'hoan_tat' then
      return new;
    end if;
    raise exception 'Không chuyển được từ "%" sang "%" (loại phiếu: %).',
      old.status, new.status, old.loai;
  end if;

  raise exception 'Bạn không có quyền chuyển phiếu từ "%" sang "%".', old.status, new.status;
end;
$$;

drop trigger if exists guard_signing_transition_trg on public.signing_submissions;
create trigger guard_signing_transition_trg
  before update on public.signing_submissions
  for each row execute function public.guard_signing_transition();

-- ─── 4. KIỂM TRA ───
select conname, pg_get_constraintdef(oid) as dinh_nghia
from pg_constraint
where conrelid = 'public.signing_submissions'::regclass
  and conname = 'signing_submissions_loai_check';

select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'signing_submissions'
  and column_name in ('vat_tu','chi_tiet')
order by column_name;

select loai, count(*) as so_phieu
from public.signing_submissions
group by loai
order by loai;
