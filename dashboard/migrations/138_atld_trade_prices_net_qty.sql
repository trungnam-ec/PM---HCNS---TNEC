-- ============================================================
-- 138 — KHO BHLĐ: DANH SÁCH XUẤT-NHẬP HIỆN SỐ CÒN HIỆU LỰC THEO SỔ KHO
--
-- Sự cố 07/10/2026 (mã PPEN012): tab "Danh sách Quản lý Xuất-Nhập kho" đọc số
-- lượng IN TRÊN PHIẾU, còn "Tổng Danh mục kho" đọc SỔ KHO. Sửa số Nhập SP (137)
-- chỉ thêm dòng huy_nhap vào sổ nên danh sách vẫn hiện 8+8+8+10 trong khi tổng
-- kho còn 8 -> hai màn hình lệch nhau.
-- User chốt: nhập ngày nào thì danh sách hiện đúng ngày đó, lọc theo tháng là biết
-- hàng thuộc lần nhập nào -> danh sách phải khớp sổ kho:
--   • Dòng phiếu NHẬP đã ghi sổ: số lượng = Σ sổ (nhap + huy_nhap) của dòng đó.
--     Dòng bị trừ hết (= 0) thì ẩn.
--   • Ẩn phiếu "Điều chỉnh tồn đầu kỳ ..." (136) — giống phiếu tồn đầu kỳ Excel,
--     không phải giao dịch mua/bán thật.
-- Phiếu xuất, phiếu đã huỷ, dòng Excel cũ: giữ nguyên như 123.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 123.
-- ============================================================

drop view if exists public.atld_trade_prices;
create view public.atld_trade_prices with (security_invoker = true) as
  select h.id,
         'excel'::text          as nguon,
         h.loai,
         h.ngay,
         h.item_id,
         h.qty::numeric         as qty,
         h.unit_price,
         null::numeric          as vat_percent,
         h.doi_tac,
         h.chung_tu,
         null::text             as so_phieu,
         null::text             as status,
         null::uuid             as voucher_id,
         null::text             as created_by,
         null::text             as created_by_name,
         null::text             as nguoi_nhan,
         null::text             as bdh_name,
         null::text             as ly_do,
         null::text             as ly_do_tra_huy
    from public.atld_price_history h
  union all
  select l.id,
         'phieu'::text,
         v.loai,
         v.ngay,
         l.item_id,
         case when v.loai = 'nhap' and v.status = 'posted' then coalesce(s.net, 0) else l.qty end::numeric,
         case when v.loai = 'xuat' then coalesce(l.sale_price, l.unit_price) else l.unit_price end,
         v.vat_percent,
         case when v.loai = 'nhap' then p.name else v.contractor_name end,
         v.chung_tu,
         v.so_phieu,
         v.status,
         v.id,
         v.created_by,
         v.created_by_name,
         v.nguoi_nhan,
         v.bdh_name,
         v.ly_do,
         case v.status when 'returned' then v.return_reason when 'cancelled' then v.cancel_reason end
    from public.atld_voucher_lines l
    join public.atld_vouchers v on v.id = l.voucher_id
    left join public.atld_partners p on p.id = v.partner_id
    left join (select line_id, sum(qty) as net
                 from public.atld_ledger
                where kind in ('nhap', 'huy_nhap')
                group by line_id) s on s.line_id = l.id
   where v.ly_do is distinct from 'Tồn đầu kỳ chuyển từ Excel'
     and coalesce(v.ly_do, '') not like 'Điều chỉnh tồn đầu kỳ%'
     and (v.loai = 'xuat' or v.status in ('posted', 'cancelled'))
     and not (v.loai = 'nhap' and v.status = 'posted' and coalesce(s.net, 0) = 0);

revoke all on public.atld_trade_prices from anon, public;
grant select on public.atld_trade_prices to authenticated;

-- KIỂM TRA: các dòng nhập của PPEN012 — mong đợi số lượng khớp cột Nhập SP ở Tổng kho
select t.ngay, t.so_phieu, t.qty, t.status
  from public.atld_trade_prices t
  join public.atld_items i on i.id = t.item_id
 where i.code = 'PPEN012' and t.nguon = 'phieu' and t.loai = 'nhap'
 order by t.ngay, t.so_phieu;
