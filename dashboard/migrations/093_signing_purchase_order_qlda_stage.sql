-- ============================================================
-- 093 — ĐƠN ĐẶT HÀNG: THÊM CẤP DUYỆT "PHÒNG QLDA"
--
-- LUỒNG CHỐT (user 22/09/2026, khớp đúng 5 ô ký đánh số trên tờ KD/BM/001):
--   ➊ Người yêu cầu (nhân viên dự án — người lập)
--   ➋ BĐH dự án: Chỉ huy trưởng / Chỉ huy phó      -> `cho_cap1`
--   ➌ Phòng QLDA: Trưởng / Phó phòng QLDA          -> `cho_phong_qlda`  (MỚI)
--   ➍ Phó Giám đốc QLDA — ô "DUYỆT" trên tờ giấy   -> `cho_pgd_qlda`
--   ➎ Phòng Vật tư xác nhận cuối                    -> `cho_phong_vat_tu`
--
-- ⚠ KHÔNG CÓ chặng Giám đốc: user chốt ô "DUYỆT" của tờ này là PHÓ Giám đốc
-- phụ trách Dự án, không phải Giám đốc.
--
-- ➋ dùng lại cơ chế cấp 1 sẵn có (`resolveCap1` + `signing_is_dept_manager`):
-- bộ chức danh của nó ĐÃ bao gồm "chỉ huy trưởng" và "chỉ huy phó", nên nhân
-- viên thuộc một BĐH thì cấp 1 tự ra đúng người. Không cần cờ mới.
--
-- ➌ và ➍ là TÙY CHỌN, bật bằng 2 ô tích trên form lúc lập đơn (giống 2 ô tham
-- vấn PGĐ của migration 074). ➎ tự có khi công ty đã cấp cờ Phòng Vật tư cho ai
-- đó. Mọi lựa chọn chốt vào cột `route` của chính đơn lúc TRÌNH.
--
-- CHỈ đơn đặt hàng dùng chặng này. Năm loại phiếu kia giữ nguyên.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ -> Run.
-- An toàn chạy lại nhiều lần. YÊU CẦU: đã chạy 091 VÀ 092 trước.
-- ============================================================

-- ─── 1. CỜ QUYỀN MỚI ───
alter table public.approval_permissions
  add column if not exists can_approve_signing_phong_qlda boolean not null default false;

comment on column public.approval_permissions.can_approve_signing_phong_qlda is
  'Duyet cap Phong QLDA (TP/PP Quan ly du an) cua don dat hang KD/BM/001 (093).';

-- ─── 2. TRẠNG THÁI MỚI + VẾT KÝ ───
alter table public.signing_submissions
  drop constraint if exists signing_submissions_status_check;
alter table public.signing_submissions
  add constraint signing_submissions_status_check
  check (status in (
    'nhap','cho_cap1','cho_pho_giam_doc','cho_pgd_qlda','cho_pgd_khdt',
    'cho_phong_qlda','cho_phong_vat_tu','cho_giam_doc','cho_ke_toan',
    'hoan_tat','tra_lai'
  ));

-- Tiền tố `pqlda_` — KHÔNG trùng với `pvt_` (092) và không trùng `qlda_by`
-- (vết ký của PHÓ GIÁM ĐỐC QLDA, có từ 050). Ba cái này là ba cấp khác nhau.
alter table public.signing_submissions
  add column if not exists ykien_pqlda text,
  add column if not exists pqlda_by     text,
  add column if not exists pqlda_at     timestamptz;

-- ─── 3. HÀM NHẬN DIỆN ───
-- Giữ điều kiện "email KHÁC RỖNG": position('' in x) = 1, thiếu vế đó là phiên
-- không danh tính khớp mọi dòng.
create or replace function public.signing_caller_phong_qlda()
returns boolean language sql stable security definer set search_path=public as $$
  select public.caller_email() <> '' and exists (
    select 1 from public.approval_permissions p
    where p.can_approve_signing_phong_qlda
      and position(public.caller_email() in lower(coalesce(p.email,''))) > 0);
$$;

create or replace function public.signing_stages_of_caller()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(
    (select array_remove(array[
        case when bool_or(p.can_approve_signing_qlda)
               or bool_or(p.can_approve_signing_khdt)      then 'cho_pho_giam_doc' end,
        case when bool_or(p.can_approve_signing_phong_qlda) then 'cho_phong_qlda'   end,
        case when bool_or(p.can_approve_signing_vat_tu)     then 'cho_phong_vat_tu' end,
        case when bool_or(p.can_approve_signing_director)   then 'cho_giam_doc'     end,
        case when bool_or(p.can_approve_signing_accounting) then 'cho_ke_toan'      end
      ], null)
     from public.approval_permissions p
     where coalesce(auth.jwt() ->> 'email', '') <> ''
       and position(lower(auth.jwt() ->> 'email') in lower(coalesce(p.email, ''))) > 0),
    '{}'::text[]
  );
$$;

-- ─── 4. RLS: AI ĐANG GIỮ BƯỚC NÀY (policy UPDATE) ───
-- PHẢI khớp từng dòng với nhánh `holds_old` của trigger bên dưới.
create or replace function public.signing_caller_holds(
  p_status     text,
  p_cap1_email text
)
returns boolean language sql stable security definer set search_path = public as $fn$
  select case p_status
    when 'cho_cap1' then
      p_cap1_email is not null
      and public.caller_email() <> ''
      and position(public.caller_email() in lower(p_cap1_email)) > 0
    when 'cho_pho_giam_doc' then public.signing_caller_qlda() or public.signing_caller_khdt()
    when 'cho_pgd_qlda' then public.signing_caller_qlda()
    when 'cho_pgd_khdt' then public.signing_caller_khdt()
    when 'cho_phong_qlda'   then public.signing_caller_phong_qlda()   -- 093
    when 'cho_phong_vat_tu' then public.signing_caller_vat_tu()       -- 092
    when 'cho_giam_doc' then 'cho_giam_doc' = any(public.signing_stages_of_caller())
    when 'cho_ke_toan'  then public.signing_caller_acct()
    else false
  end;
$fn$;

-- ─── 5. TRIGGER CANH LUỒNG ───
-- Chép NGUYÊN VĂN từ 092, thêm biến `has_pql` và một nhánh trong `holds_old`.

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
  has_pvt   boolean := public.signing_caller_vat_tu();   -- 092
  has_pql   boolean := public.signing_caller_phong_qlda(); -- 093
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
    when 'cho_phong_qlda'   then has_pql                   -- 093
    when 'cho_phong_vat_tu' then has_pvt                   -- 092
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

-- ─── 6. RLS SELECT ───
-- Thiếu nhánh của chặng mới thì người giữ cờ KHÔNG THẤY đơn nào để mà duyệt,
-- và không có thông báo lỗi nào cả.
drop policy if exists "signing_select" on public.signing_submissions;
create policy "signing_select" on public.signing_submissions
  for select to authenticated
  using (
    public.is_admin_caller()
    or public.is_director_caller()
    -- Người lập luôn thấy phiếu của chính mình (mọi trạng thái).
    or (public.caller_email() <> '' and lower(created_by) = public.caller_email())
    -- PHIẾU MỚI (có route): tầm nhìn theo phòng.
    or (
      jsonb_array_length(coalesce(route,'[]'::jsonb)) > 0
      and status <> 'nhap'
      and (
           (cap1_email is not null and public.caller_email() <> ''
              and position(public.caller_email() in lower(cap1_email)) > 0)
        or public.signing_is_dept_manager(don_vi)
        or (public.signing_caller_qlda() and route ? 'cho_pgd_qlda')
        or (public.signing_caller_khdt() and route ? 'cho_pgd_khdt')
        or (public.signing_caller_phong_qlda() and route ? 'cho_phong_qlda')     -- 093
        or (public.signing_caller_vat_tu() and route ? 'cho_phong_vat_tu')       -- 092
        or (public.signing_caller_acct() and status in ('cho_ke_toan','hoan_tat'))
      )
    )
    -- PHIẾU CŨ (route rỗng): giữ luật 065.
    or (
      jsonb_array_length(coalesce(route,'[]'::jsonb)) = 0
      and status <> 'nhap'
      and coalesce(array_length(public.signing_stages_of_caller(), 1), 0) > 0
    )
  );

-- ─── 7. KIỂM TRA ───
-- 7a. Hai cờ mới đã có, và hiện ai đang được tick.
select count(*) filter (where can_approve_signing_phong_qlda) as so_nguoi_duyet_phong_qlda,
       count(*) filter (where can_approve_signing_vat_tu)     as so_nguoi_xac_nhan_vat_tu,
       count(*)                                               as tong_dong
from public.approval_permissions;

-- 7b. Check constraint đã nhận cả hai trạng thái mới.
select pg_get_constraintdef(oid) as trang_thai_hop_le
from pg_constraint
where conrelid = 'public.signing_submissions'::regclass
  and conname = 'signing_submissions_status_check';

-- 7c. Sáu cột vết ký của hai cấp mới.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'signing_submissions'
  and column_name in ('ykien_pqlda','pqlda_by','pqlda_at','ykien_pvt','pvt_by','pvt_at')
order by column_name;

-- 7d. Policy còn đủ 4 cái.
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'signing_submissions'
order by cmd, policyname;
