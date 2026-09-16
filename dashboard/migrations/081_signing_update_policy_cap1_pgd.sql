-- ============================================================
-- 081 — VÁ POLICY UPDATE: CẤP 1 VÀ PHÓ GIÁM ĐỐC KHÔNG GHI ĐƯỢC (LỖI IM LẶNG)
--
-- ⚠ ĐÂY LÀ LỖI ĐANG CHẶN TOÀN BỘ LUỒNG TRÌNH KÝ TRÊN PRODUCTION.
--
-- TRIỆU CHỨNG (user báo 16/09/2026): cấp 1 bấm Duyệt hoặc Trả lại -> modal đóng
-- bình thường, người lập NHẬN ĐƯỢC EMAIL, nhưng cột Trạng thái KHÔNG đổi và
-- chuông không kêu. Phiếu nằm nguyên ở "Chờ Trưởng bộ phận".
--
-- NGUYÊN NHÂN:
-- Policy `signing_update` (052) quyết định ai được ghi bằng:
--     status = any(public.signing_stages_of_caller())
-- Hàm đó (bản mới nhất ở 053) CHỈ trả về 3 giá trị suy từ CỜ QUYỀN:
--     'cho_pho_giam_doc' · 'cho_giam_doc' · 'cho_ke_toan'
--
-- Migration 074 đổi máy trạng thái nhưng KHÔNG đụng tới policy này. Hệ quả:
--   • 'cho_cap1'      — cấp 1 nhận diện bằng CỘT cap1_email của từng phiếu,
--                       KHÔNG có cờ nào cả -> không bao giờ khớp -> BỊ CHẶN.
--   • 'cho_pgd_qlda'  — hai chặng PGĐ ĐƯỢC CHỌN mà 074 sinh ra. Hàm 053 chỉ
--   • 'cho_pgd_khdt'    biết chặng gộp 'cho_pho_giam_doc' -> cũng BỊ CHẶN.
-- Còn 'cho_giam_doc' và 'cho_ke_toan' vẫn khớp nên Giám đốc / Kế toán không
-- sao — nhưng phiếu không bao giờ bò tới được hai bước đó.
--
-- VÌ SAO HỎNG TRONG IM LẶNG: RLS chặn UPDATE thì PostgreSQL KHÔNG báo lỗi, nó
-- chỉ sửa 0 dòng. Client gọi `.update().eq()` mà không `.select()` nên nhận về
-- error = null, tưởng đã ghi xong: đóng modal, bắn email, ghi nhật ký. Chỉ có
-- CSDL là không đổi gì. (Cùng loại bẫy đã ghi trong ghi chú hàm xoá phiếu.)
--
-- CÁCH VÁ: dựng hàm `signing_caller_holds(status, cap1_email)` nói đúng MỘT
-- câu "người gọi có đang giữ bước này của phiếu này không", CHÉP ĐÚNG nhánh
-- `holds_old` của trigger `guard_signing_transition` (074/079). Từ nay RLS và
-- trigger đọc chung một luật — lệch nhau là sinh lại đúng lớp lỗi này.
--
-- ⚠ Khớp cap1_email theo CHUỖI CON, y hệt trigger. CỐ Ý giữ giống nhau: đổi
-- một bên mà quên bên kia thì phiếu lại tắc. Muốn siết thành khớp tuyệt đối
-- thì phải sửa CẢ HAI trong cùng một migration.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ -> Run.
-- An toàn chạy lại nhiều lần. YÊU CẦU: đã chạy 050, 052, 053, 060, 065, 074.
-- ============================================================

-- ─── 1. AI ĐANG GIỮ BƯỚC NÀY ───
-- Tham số truyền vào từ chính dòng đang xét, nên hàm dùng được trong RLS.
create or replace function public.signing_caller_holds(
  p_status     text,
  p_cap1_email text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select case p_status
    -- Cấp 1: theo email chốt trên phiếu. cap1_email rỗng = không tính được
    -- cấp 1 -> Admin duyệt thay (đã phủ ở nhánh is_admin_caller của policy).
    when 'cho_cap1' then
      p_cap1_email is not null
      and public.caller_email() <> ''
      and position(public.caller_email() in lower(p_cap1_email)) > 0
    -- Chặng PGĐ GỘP của phiếu cũ (trước 053/074): một trong hai cờ là đủ.
    when 'cho_pho_giam_doc' then public.signing_caller_qlda() or public.signing_caller_khdt()
    -- Hai chặng PGĐ ĐƯỢC CHỌN của phiếu mới (074): mỗi bên một cờ.
    when 'cho_pgd_qlda' then public.signing_caller_qlda()
    when 'cho_pgd_khdt' then public.signing_caller_khdt()
    when 'cho_giam_doc' then 'cho_giam_doc' = any(public.signing_stages_of_caller())
    when 'cho_ke_toan'  then public.signing_caller_acct()
    else false
  end;
$fn$;

-- ─── 2. POLICY UPDATE ───
-- USING  : nhìn dòng CŨ -> "có được đụng vào phiếu này không".
-- WITH CHECK: nhìn dòng MỚI. KHÔNG diễn tả luật chuyển bước ở đây vì WITH CHECK
--   không thấy OLD (lý do của 052). Luật chuyển bước nằm trọn trong trigger.
--   Chỉ cần khẳng định "người này có chân trong luồng" — và cấp 1 PHẢI được
--   tính vào, vì họ có thể không giữ cờ nào (signing_is_participant = false).
drop policy if exists "signing_update" on public.signing_submissions;

create policy "signing_update" on public.signing_submissions
  for update to authenticated
  using (
    public.is_admin_caller()
    or (public.caller_email() <> '' and lower(created_by) = public.caller_email())
    or public.signing_caller_holds(status, cap1_email)
  )
  with check (
    public.is_admin_caller()
    or (public.caller_email() <> '' and lower(created_by) = public.caller_email())
    or public.signing_is_participant()
    -- Cấp 1 không cờ: vẫn phải ghi ra được dòng mang trạng thái bước kế tiếp.
    or (cap1_email is not null
        and public.caller_email() <> ''
        and position(public.caller_email() in lower(cap1_email)) > 0)
  );

-- ─── 3. KIỂM TRA ───
-- 3a. Policy còn đủ cả USING lẫn WITH CHECK.
select policyname, cmd,
       qual       is not null as co_using,
       with_check is not null as co_with_check
from pg_policies
where schemaname = 'public' and tablename = 'signing_submissions'
order by cmd, policyname;

-- 3b. Chạy trong SQL Editor (KHÔNG có JWT) -> PHẢI ra false hết.
-- Ra true ở đâu là hàm hở, dừng lại sửa ngay.
select public.signing_caller_holds('cho_cap1',        'ai.do@trungnam.com') as cap1_false,
       public.signing_caller_holds('cho_pgd_qlda',    null)                 as qlda_false,
       public.signing_caller_holds('cho_pgd_khdt',    null)                 as khdt_false,
       public.signing_caller_holds('cho_giam_doc',    null)                 as gd_false,
       public.signing_caller_holds('cho_ke_toan',     null)                 as kt_false,
       public.signing_caller_holds('hoan_tat',        null)                 as xong_false;

-- 3c. Phiếu đang tắc: liệt kê phiếu còn nằm ở bước cấp 1 / PGĐ để đối chiếu
-- sau khi vá (duyệt thử một phiếu, trạng thái phải đổi thật).
select ma_phieu, loai, status, cap1_email, created_by, updated_at
from public.signing_submissions
where status in ('cho_cap1','cho_pgd_qlda','cho_pgd_khdt')
order by updated_at desc;
