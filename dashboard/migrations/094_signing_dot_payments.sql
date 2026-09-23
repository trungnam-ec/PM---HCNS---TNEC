-- ============================================================
-- 094 — CÁC ĐỢT THANH TOÁN / CẤP PHÁT + NGÀY CỦA TỪNG ĐỢT
--
-- MỤC ĐÍCH: danh sách phiếu trình ký hiện thêm ba cột đọc liền mạch
--
--     Tổng giá trị HĐ / Dự toán  −  các đợt đã TT / cấp phát  =  Còn lại
--
-- KHÔNG đẻ ra bảng "đợt" riêng. Trong hệ này MỖI PHIẾU ĐÃ LÀ MỘT ĐỢT: phiếu hồ
-- sơ mang `dot_so` = đợt thanh toán thứ mấy của hợp đồng, đơn đặt hàng mang
-- `dot_so` = yêu cầu lần thứ mấy của hạng mục. Dựng thêm một bảng đợt nhập tay
-- thì cùng một con số nằm hai nơi và chắc chắn có ngày lệch nhau.
--
-- FILE NÀY LÀM HAI VIỆC:
--
--   1. Thêm cột `ngay_dot` — ngày thanh toán / cấp phát của ĐỢT NÀY, do NGƯỜI
--      LẬP chọn trên form. Khác `ngay_chi` (đã có từ 050): `ngay_chi` là ngày Kế
--      toán bấm xác nhận đã chi, chỉ có ở chặng cuối và chỉ phiếu hồ sơ mới đi
--      qua chặng đó — đơn đặt hàng không có Kế toán nên không bao giờ có ngày.
--
--   2. Hàm `signing_dot_list()` — trả về các đợt anh em của một phiếu, ĐỌC
--      XUYÊN RLS.
--
--      ⚠ ĐÂY MỚI LÀ LÝ DO BẮT BUỘC PHẢI CÓ MIGRATION. Gom đợt ở trình duyệt từ
--      danh sách đã tải về thì mỗi người thấy một con số "còn lại" khác nhau:
--      policy `signing_select` (074) cho nhân viên thường CHỈ thấy phiếu của
--      chính mình, nên đợt 1 và 2 do người khác lập sẽ không được trừ, và phần
--      mềm báo hợp đồng còn nợ nhiều hơn thực tế. Cùng lý do mà hàm
--      `luy_ke_da_thanh_toan` (050) phải là SECURITY DEFINER.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ -> Run.
-- An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. NGÀY CỦA ĐỢT ───
alter table public.signing_submissions
  add column if not exists ngay_dot date;

comment on column public.signing_submissions.ngay_dot is
  'Ngày thanh toán / cấp phát của chính đợt này, người lập chọn trên form. '
  'Khác ngay_chi (ngày Kế toán xác nhận đã chi, chỉ phiếu hồ sơ mới có).';

-- ─── 2. GUARD SỬA PHIẾU ───
-- Chép nguyên bản của 093, CHỈ thêm `ngay_dot` vào danh sách cột mà cấp duyệt
-- không được đụng tới. Không thêm thì người duyệt sửa được ngày đợt, mà ngày đó
-- đi thẳng vào phép tính "còn lại" của cả hợp đồng.
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
     -- 094 — ngày thanh toán / cấp phát của đợt này
     or new.ngay_dot             is distinct from old.ngay_dot
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

-- ─── 3. DANH SÁCH ĐỢT CỦA MỘT NHÓM PHIẾU ───
--
-- Gọi một lần cho cả bảng: truyền vào mảng KHOÁ NHÓM, trả về mọi đợt thuộc các
-- nhóm đó. Một lần gọi thay vì mỗi dòng một lần — danh sách 50 phiếu mà bắn 50
-- request thì trang đứng hình.
--
-- KHOÁ NHÓM — hai loại phiếu gom theo hai thứ khác nhau:
--   · hồ sơ        -> 'HS|<số hợp đồng>'          (các đợt thanh toán của 1 HĐ)
--   · đơn đặt hàng -> 'DDH|<dự án>|<hạng mục>'    (các lần cấp phát của 1 hạng mục)
-- Chuẩn hoá về chữ thường + cắt khoảng trắng để "264/2026/HĐXD " và
-- "264/2026/hđxd" không tách thành hai hợp đồng.
--
-- SỐ TIỀN CỦA MỘT ĐỢT:
--   · hồ sơ        -> `de_nghi_thanh_toan`, đúng con số đã trình ký.
--   · đơn đặt hàng -> TỔNG cột "Chi phí" của bảng vật tư. Đơn đặt hàng không có
--                     ô tiền nào ở đầu phiếu; cột Chi phí là chỗ duy nhất ghi
--                     giá trị, và nó là giá trị của riêng lần đặt hàng này —
--                     đúng thứ cần trừ khỏi tổng dự toán.
--
-- BỎ QUA `nhap` và `tra_lai` — cùng luật với `luy_ke_da_thanh_toan` (050):
-- phiếu chưa trình hoặc bị trả về thì chưa tiêu tiền của hợp đồng.

create or replace function public.signing_dot_list(p_keys text[])
returns table (
  khoa     text,
  id       uuid,
  ma_phieu text,
  loai     text,
  dot_so   integer,
  so_tien  numeric,
  ngay     date,
  status   text
)
language sql
stable
security definer
set search_path = public
-- SECURITY DEFINER nên hàm này ĐỌC XUYÊN RLS (cố ý — xem khối chú thích đầu
-- file). Vì vậy phải tự kiểm người gọi có chân trong luồng trình ký không, y
-- như `luy_ke_da_thanh_toan`: thiếu bước này thì bất kỳ tài khoản nào cũng dò
-- được tổng tiền đã thanh toán của mọi hợp đồng chỉ bằng cách đoán số hợp đồng.
as $$
  select
    case when s.loai = 'don_dat_hang'
      then 'DDH|' || lower(btrim(coalesce(s.du_an, ''))) || '|' || lower(btrim(coalesce(s.hang_muc, '')))
      else 'HS|'  || lower(btrim(coalesce(s.hop_dong_so, '')))
    end                                      as khoa,
    s.id,
    s.ma_phieu,
    s.loai::text,
    s.dot_so,
    case when s.loai = 'don_dat_hang' then (
      -- Ô "Chi phí" lưu dạng CHỮ theo quy ước gõ số của người Việt: dấu chấm
      -- phân cách nghìn, dấu phẩy thập phân. Bỏ dấu chấm TRƯỚC rồi mới đổi phẩy
      -- thành chấm — làm ngược thì "1.250,5" ra số rác.
      --
      -- ⚠ PHẢI KIỂM BẰNG REGEX TRƯỚC KHI ÉP KIỂU. Đây là ô người dùng gõ tay,
      -- một dòng lỡ gõ "1,2,3" sẽ thành "1.2.3" và `::numeric` NÉM LỖI — mà lỗi
      -- đó làm hỏng cả lượt gọi, tức một dòng vật tư sai chính tả là rỗng sạch
      -- cột "còn lại" của mọi phiếu. Dòng không đọc được thì bỏ qua (coi như 0),
      -- giống hệt cách `docSoVN` bên TypeScript trả null.
      select coalesce(sum(
        case when txt ~ '^-?[0-9]+(\.[0-9]+)?$' then txt::numeric else 0 end
      ), 0)
      from jsonb_array_elements(s.vat_tu) x,
           lateral (select regexp_replace(
             replace(replace(coalesce(x ->> 'chiPhi', ''), '.', ''), ',', '.'),
             '[^0-9.-]', '', 'g'
           ) as txt) t
    ) else s.de_nghi_thanh_toan end          as so_tien,
    coalesce(s.ngay_dot, s.ngay_chi, (s.created_at at time zone 'Asia/Ho_Chi_Minh')::date) as ngay,
    s.status::text
  from public.signing_submissions s
  where public.signing_is_participant()
    and s.loai in ('ho_so', 'don_dat_hang')
    and s.status not in ('nhap', 'tra_lai')
    and (
      case when s.loai = 'don_dat_hang'
        then 'DDH|' || lower(btrim(coalesce(s.du_an, ''))) || '|' || lower(btrim(coalesce(s.hang_muc, '')))
        else 'HS|'  || lower(btrim(coalesce(s.hop_dong_so, '')))
      end = any(p_keys)
    )
  order by s.dot_so nulls last, s.created_at;
$$;

revoke all on function public.signing_dot_list(text[]) from public, anon;
grant execute on function public.signing_dot_list(text[]) to authenticated;

-- ─── 4. KIỂM TRA ───
-- Chạy xong nên thấy: cột ngay_dot có mặt, và hàm trả về 1 dòng cho mỗi đợt.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'signing_submissions'
      and column_name = 'ngay_dot'
  ) then
    raise exception '094 chưa thêm được cột ngay_dot.';
  end if;
  raise notice '094 OK — đã có cột ngay_dot và hàm signing_dot_list().';
end $$;
