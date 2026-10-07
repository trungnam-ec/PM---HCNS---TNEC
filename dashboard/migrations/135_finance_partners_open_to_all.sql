-- ============================================================
-- 135 — DANH MỤC ĐỐI TÁC: MỞ CHO MỌI TÀI KHOẢN XEM VÀ THÊM / SỬA
--
-- user chốt 07/10/2026: trước đây chỉ Admin + người có cờ can_view_reports
-- (048/052/059). Ai lập phiếu chuyển tiền / tạm ứng cũng phải chọn được đối
-- tác và số tài khoản, nên mở cho mọi người đã đăng nhập.
--
-- ĐÃ CÂN NHẮC: số tài khoản ngân hàng của đối tác từ nay MỌI tài khoản nội bộ
-- đọc được (096 từng cố ý giấu khỏi kỹ sư). Anon vẫn bị chặn hoàn toàn.
--
-- QUYỀN XOÁ GIỮ NGUYÊN theo mức rủi ro:
--   finance_partners          : chỉ Admin (xoá kéo theo cả hợp đồng — 052)
--   finance_partner_contracts : chỉ Admin
--   finance_partner_accounts / finance_contract_accounts : ai cũng xoá được
--     (xoá một tài khoản chỉ mất đúng dòng đó — lý do ở 059)
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ -> Run.
-- An toàn chạy lại nhiều lần. YÊU CẦU: đã chạy 048, 052, 059.
-- ============================================================

-- Xoá TOÀN BỘ policy cũ của 4 bảng (không đoán tên), rồi dựng lại.
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public'
             and tablename in ('finance_partners', 'finance_partner_contracts',
                               'finance_partner_accounts', 'finance_contract_accounts')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- ─── finance_partners ───
create policy "partners_select_all" on public.finance_partners
  for select to authenticated using (true);
create policy "partners_insert_all" on public.finance_partners
  for insert to authenticated with check (true);
create policy "partners_update_all" on public.finance_partners
  for update to authenticated using (true) with check (true);
create policy "partners_delete_admin" on public.finance_partners
  for delete to authenticated using (public.is_admin_caller());

-- ─── finance_partner_contracts ───
create policy "contracts_select_all" on public.finance_partner_contracts
  for select to authenticated using (true);
create policy "contracts_insert_all" on public.finance_partner_contracts
  for insert to authenticated with check (true);
create policy "contracts_update_all" on public.finance_partner_contracts
  for update to authenticated using (true) with check (true);
create policy "contracts_delete_admin" on public.finance_partner_contracts
  for delete to authenticated using (public.is_admin_caller());

-- ─── tài khoản ngân hàng ───
create policy "accounts_all" on public.finance_partner_accounts
  for all to authenticated using (true) with check (true);
create policy "contract_accounts_all" on public.finance_contract_accounts
  for all to authenticated using (true) with check (true);

-- ─── KIỂM TRA: phải ra 4 + 4 + 1 + 1 = 10 dòng ───
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('finance_partners', 'finance_partner_contracts',
                    'finance_partner_accounts', 'finance_contract_accounts')
order by tablename, cmd;
