-- ============================================================
-- 122 — KHO BHLĐ: GỢI Ý "KHÁCH HÀNG" TỪ DANH MỤC ĐỐI TÁC CỦA HỒ SƠ TRÌNH KÝ
--
-- User yêu cầu 02/10/2026: cột "Khách hàng" ở tab Giá nhập kho lấy thông tin chung
-- từ Danh mục đối tác (finance_partners, 048) — bấm sửa là hiện danh sách để chọn.
--
-- finance_partners chỉ Admin / cờ Báo cáo đọc được (có số tài khoản, MST) nên KHÔNG
-- mở RLS bảng đó; thêm một cửa hẹp SECURITY DEFINER trả TÊN + tên gọi tắt + loại của
-- mọi đối tác đang dùng (khác atld_contractor_list của 117 — hàm đó chỉ nhà thầu phụ).
-- Mọi tài khoản đăng nhập gọi được (ô gợi ý), anon bị thu hồi.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 048.
-- ============================================================

create or replace function public.atld_shared_partner_list()
returns table (name text, short_name text, party_type text)
language sql
stable
security definer
set search_path = public
as $$
  select f.name, f.short_name, f.party_type
  from public.finance_partners f
  where public.caller_email() <> '' and f.active
  order by f.name;
$$;

revoke all on function public.atld_shared_partner_list() from public, anon;
grant execute on function public.atld_shared_partner_list() to authenticated;

-- KIỂM TRA: số đối tác đang dùng (chạy bằng quyền SQL Editor nên luôn ra số thật)
select count(*) as so_doi_tac from public.finance_partners where active;
