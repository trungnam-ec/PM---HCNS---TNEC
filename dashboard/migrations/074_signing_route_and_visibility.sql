-- ============================================================
-- 074 — PHIẾU TRÌNH KÝ: LUỒNG ĐỘNG THEO ROUTE + TẦM NHÌN THEO PHÒNG
--
-- THAY ĐỔI NGHIỆP VỤ (user chốt 11/09/2026):
-- Mỗi phiếu tự mang DANH SÁCH BƯỚC riêng (cột `route`), tính lúc lập theo phòng
-- ban + tổ của người trình. Luồng:
--   Cấp 1 (Tổ trưởng → nếu không có thì TP/PP → thiếu cả 3 thì Admin)
--   → [Phó Giám đốc: TÙY CHỌN, người trình chọn QLDA / KHĐT / không]
--   → Giám đốc
--   → [Kế toán: chỉ phiếu chi tiền = loại 'ho_so']
--
-- VÌ SAO LƯU ROUTE TRÊN PHIẾU (không nhét if/else từng phòng vào trigger):
-- Trigger chỉ cần "đi bước kế tiếp trong route của chính phiếu" — một luật chung.
-- Thêm luồng mới sau này = đổi cách DỰNG route ở client, KHÔNG đụng trigger/RLS.
--
-- BACK-COMPAT (bắt buộc, hệ thống đang chạy production):
-- Phiếu CŨ có route rỗng ('[]') -> trigger chạy NHÁNH LUẬT CŨ (như 060), RLS đọc
-- theo LUẬT CŨ (như 065). Không phiếu đang chạy dở nào bị vỡ.
--
-- TẦM NHÌN (SELECT) cho phiếu MỚI — "phòng nào xem phòng đó", như luồng task:
--   • Cá nhân: CHỈ phiếu chính mình lập (cùng phòng cũng không thấy của nhau).
--   • Tổ trưởng: + phiếu tổ mình (tự nhiên phủ, vì tổ trưởng chính là cap1_email).
--   • TP/PP: + phiếu nhân viên cùng phòng (khớp ô "Phòng ban" = don_vi).
--   • PGĐ (QLDA/KHĐT): CHỈ phiếu được ĐỊNH TUYẾN tới họ (route có bước của họ).
--   • Kế toán: CHỈ phiếu đã lên tới bước Kế toán (status cho_ke_toan / hoan_tat).
--   • Giám đốc / Ban lãnh đạo / Admin: tất cả.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ -> Run.
-- An toàn chạy lại nhiều lần. YÊU CẦU: đã chạy 050, 052, 053, 060, 065.
-- ============================================================

-- ─── 1. CỘT MỚI ───
alter table public.signing_submissions
  add column if not exists route       jsonb not null default '[]'::jsonb,
  add column if not exists cap1_email  text,   -- email người duyệt cấp 1 (null = Admin duyệt thay)
  add column if not exists cap1_by      text,
  add column if not exists cap1_at      timestamptz,
  add column if not exists ykien_cap1   text,
  add column if not exists pgd_chon     text;  -- '', 'qlda', 'khdt' — PGĐ người trình chọn

-- Thêm trạng thái 'cho_cap1' vào check (giữ mọi giá trị cũ để phiếu lịch sử không vỡ).
alter table public.signing_submissions
  drop constraint if exists signing_submissions_status_check;
alter table public.signing_submissions
  add constraint signing_submissions_status_check
  check (status in (
    'nhap','cho_cap1','cho_pho_giam_doc','cho_pgd_qlda','cho_pgd_khdt',
    'cho_giam_doc','cho_ke_toan','hoan_tat','tra_lai'
  ));

-- ─── 2. HÀM NHẬN DIỆN NGƯỜI GỌI (bổ sung) ───
-- caller_email() / is_admin_caller() / is_director_caller() / signing_stages_of_caller()
-- đã có từ 050/065. Thêm: 3 cờ PGĐ/Kế toán tách riêng + kiểm tra "quản lý phòng".
--
-- ⚠ Mọi hàm giữ điều kiện "email KHÁC RỖNG" — position('' in x)=1, thiếu là phiên
-- không danh tính khớp mọi dòng (bẫy 018/050/065).

create or replace function public.signing_caller_qlda()
returns boolean language sql stable security definer set search_path=public as $$
  select public.caller_email() <> '' and exists (
    select 1 from public.approval_permissions p
    where p.can_approve_signing_qlda
      and position(public.caller_email() in lower(coalesce(p.email,''))) > 0);
$$;

create or replace function public.signing_caller_khdt()
returns boolean language sql stable security definer set search_path=public as $$
  select public.caller_email() <> '' and exists (
    select 1 from public.approval_permissions p
    where p.can_approve_signing_khdt
      and position(public.caller_email() in lower(coalesce(p.email,''))) > 0);
$$;

create or replace function public.signing_caller_acct()
returns boolean language sql stable security definer set search_path=public as $$
  select public.caller_email() <> '' and exists (
    select 1 from public.approval_permissions p
    where p.can_approve_signing_accounting
      and position(public.caller_email() in lower(coalesce(p.email,''))) > 0);
$$;

-- Người gọi có phải Trưởng/Phó phòng (hoặc trưởng đơn vị) của ĐÚNG phòng `p_dept`.
-- Khớp danh sách chức danh như isDepartmentManagerRole() trong lib/approvers.ts.
create or replace function public.signing_is_dept_manager(p_dept text)
returns boolean language sql stable security definer set search_path=public as $$
  select public.caller_email() <> '' and coalesce(btrim(p_dept),'') <> '' and exists (
    select 1 from public.employees e
    where position(public.caller_email() in lower(coalesce(e.email,''))) > 0
      and lower(btrim(coalesce(e.department,''))) = lower(btrim(p_dept))
      and lower(coalesce(e.role,'')) ~
        'trưởng phòng|truong phong|phó phòng|pho phong|quyền trưởng phòng|quyen truong phong|kế toán trưởng|ke toan truong|trưởng bộ phận|truong bo phan|chỉ huy trưởng|chi huy truong|chỉ huy phó|chi huy pho'
  );
$$;

-- ─── 3. TRIGGER CANH LUỒNG (route + fallback luật cũ) ───
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

-- ─── 4. RLS: INSERT cho phép bước đầu mới ───
-- Phiếu mới trình đi bắt đầu ở 'cho_cap1' (route[0]). Whitelist cũ ('nhap',
-- 'cho_pgd_qlda') đã lỗi thời sau 053 — thay bằng ('nhap','cho_cap1').
drop policy if exists "signing_insert" on public.signing_submissions;
create policy "signing_insert" on public.signing_submissions
  for insert to authenticated
  with check (
    (public.is_admin_caller() or public.can_create_signing_caller())
    and lower(created_by) = public.caller_email()
    and public.caller_email() <> ''
    and status in ('nhap','cho_cap1')
    -- Không cho khai sẵn vết duyệt lúc tạo.
    and cap1_at is null and qlda_at is null and khdt_at is null
    and giam_doc_at is null and ke_toan_at is null
  );

-- ─── 5. RLS: SELECT theo phòng (phiếu mới) + giữ luật cũ cho phiếu cũ ───
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
           -- Cấp 1 được định tuyến tới (phủ luôn Tổ trưởng: tổ trưởng chính là cap1).
           (cap1_email is not null and public.caller_email() <> ''
              and position(public.caller_email() in lower(cap1_email)) > 0)
           -- Trưởng/Phó phòng thấy cả phòng mình (theo ô "Phòng ban" trên phiếu).
        or public.signing_is_dept_manager(don_vi)
           -- PGĐ chỉ thấy phiếu định tuyến tới họ.
        or (public.signing_caller_qlda() and route ? 'cho_pgd_qlda')
        or (public.signing_caller_khdt() and route ? 'cho_pgd_khdt')
           -- Kế toán chỉ thấy phiếu đã lên tới bước Kế toán.
        or (public.signing_caller_acct() and status in ('cho_ke_toan','hoan_tat'))
      )
    )
    -- PHIẾU CŨ (route rỗng): giữ luật 065 — ai có cờ duyệt thấy phiếu đã trình.
    or (
      jsonb_array_length(coalesce(route,'[]'::jsonb)) = 0
      and status <> 'nhap'
      and coalesce(array_length(public.signing_stages_of_caller(), 1), 0) > 0
    )
  );

-- ─── 6. KIỂM TRA ───
-- 6a. Cột + trạng thái mới đã có.
select column_name from information_schema.columns
where table_schema='public' and table_name='signing_submissions'
  and column_name in ('route','cap1_email','cap1_by','cap1_at','ykien_cap1','pgd_chon')
order by column_name;

-- 6b. Chạy trong SQL Editor (KHÔNG có JWT) -> tất cả phải FALSE (hàm không hở).
select public.signing_caller_qlda()  as qlda_false,
       public.signing_caller_khdt()  as khdt_false,
       public.signing_caller_acct()  as acct_false,
       public.signing_is_dept_manager('Phòng Kế Hoạch Đấu Thầu') as mgr_false;

-- 6c. Policy còn đúng 4 lệnh.
select policyname, cmd,
       qual is not null as co_using, with_check is not null as co_with_check
from pg_policies
where schemaname='public' and tablename='signing_submissions'
order by cmd, policyname;

-- 6d. Phiếu cũ (route rỗng) vẫn còn — sẽ chạy nhánh luật cũ.
select case when jsonb_array_length(route)=0 then 'phiếu cũ (luật cũ)' else 'phiếu mới (route)' end as loai_phieu,
       count(*)
from public.signing_submissions group by 1;
