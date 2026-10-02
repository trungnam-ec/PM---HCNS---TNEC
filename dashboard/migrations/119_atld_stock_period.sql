-- ============================================================
-- 119 — KHO BHLĐ: TỒN ĐẦU KỲ · NHẬP · XUẤT · TỒN CUỐI KỲ THEO KỲ (THÁNG)
--
-- User yêu cầu 02/10/2026: bảng "Tổng kho ATLĐ" thay cột "Tồn" bằng 4 cột
-- Tồn đầu kỳ – Nhập SP – Xuất SP – Tồn cuối kỳ; tồn cuối tháng 9 = tồn đầu tháng
-- 10, nối tiếp nhau.
--
-- KHÔNG có bảng chốt sổ từng tháng: mọi con số TÍNH TỪ SỔ KHO (atld_ledger) theo
-- ngày phiếu, nên việc "chuyển tồn cuối kỳ sang đầu kỳ sau" luôn khớp tự động:
--   Tồn đầu kỳ  = Σ sổ có ngày < từ ngày
--   Nhập trong kỳ = Σ dòng nhap + huy_nhap trong kỳ   (huỷ phiếu nhập trừ ngược)
--   Xuất trong kỳ = −Σ dòng xuat + huy_xuat trong kỳ  (huỷ phiếu xuất cộng lại)
--   Tồn cuối kỳ = Σ sổ có ngày <= đến ngày = đầu kỳ + nhập − xuất
-- Dòng huỷ mang NGÀY CỦA PHIẾU GỐC (hàm 116) nên huỷ một phiếu tháng trước thì
-- số của tháng đó và mọi tháng sau tự cập nhật theo.
--
-- SECURITY INVOKER: chạy bằng quyền người gọi — RLS của atld_items/atld_ledger
-- (mọi tài khoản đăng nhập đọc được, 116) vẫn áp; anon bị thu hồi quyền gọi.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 116.
-- ============================================================

create or replace function public.atld_stock_period(p_from date, p_to date)
returns table (
  item_id      uuid,
  ton_dau      numeric,
  nhap         numeric,
  xuat         numeric,
  ton_cuoi     numeric,
  gia_tri_cuoi numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select i.id,
         coalesce(sum(l.qty)    filter (where l.ngay <  p_from), 0)::numeric,
         coalesce(sum(l.qty)    filter (where l.ngay between p_from and p_to
                                          and l.kind in ('nhap', 'huy_nhap')), 0)::numeric,
         coalesce(-sum(l.qty)   filter (where l.ngay between p_from and p_to
                                          and l.kind in ('xuat', 'huy_xuat')), 0)::numeric,
         coalesce(sum(l.qty)    filter (where l.ngay <= p_to), 0)::numeric,
         coalesce(sum(l.amount) filter (where l.ngay <= p_to), 0)::numeric
    from public.atld_items i
    left join public.atld_ledger l on l.item_id = i.id
   group by i.id;
$$;

revoke all on function public.atld_stock_period(date, date) from public, anon;
grant execute on function public.atld_stock_period(date, date) to authenticated;

-- KIỂM TRA: mong đợi 1 dòng, số dòng = số mã trong danh mục
select count(*) as so_ma from public.atld_stock_period(date_trunc('month', now())::date, now()::date);
