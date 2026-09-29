-- ============================================================
-- 113 — QUYỀN HỆ THỐNG CÒN 2 LOẠI: XEM / CHỈNH SỬA
--
-- Chốt với user 29/09/2026 ("theo đề xuất"):
--   • Tab Thành viên chỉ còn 2 lựa chọn:
--       VIEW  Xem        — xem mọi tab trừ Tài chính, không thấy tiền
--       EDIT  Chỉnh sửa  — sửa các tab: Lý trình & Hạng mục, Nhà thầu & Hợp đồng
--                          (phần thông tin, KHÔNG có tiền), A. Kế hoạch, B. Pháp lý,
--                          C. Sản lượng (nhập), E. Vật tư (khối lượng, KHÔNG giá),
--                          Cảnh báo, Báo cáo, Vòng đời (hồ sơ hoàn công)
--   • Tiền (Tài chính, giá trị HĐ, phụ lục, nghiệm thu, đơn giá, giá vật tư):
--     chỉ cờ GĐDA/CHT (BĐH mình), cờ TC-KT, Ban lãnh đạo.
--   • DUYỆT nhật ký sản lượng (+ xoá báo cáo ngày): chỉ CHT/Chỉ huy phó = cờ
--     GĐDA/CHT (như trưởng bộ phận cấp phòng) + Ban lãnh đạo. Người nhập không tự duyệt.
--   • Hợp đồng/phạm vi: EDIT được THÊM/SỬA thông tin; XOÁ vẫn chỉ người có quyền
--     tài chính (xoá HĐ kéo theo xoá giá trị, phụ lục, thanh toán — on delete cascade).
--
-- CHUYỂN DỮ LIỆU (không ai mất quyền đột ngột):
--   CHT, QS, VP_BDH, VAT_TU -> EDIT ; KY_SU, QA_QC -> VIEW
--   GDDA, TC_KT gán tay: GIỮ NGUYÊN (vẫn chạy như cũ) cho tới khi user tick cờ
--   GĐDA/CHT hoặc cờ TC-KT rồi tự đổi. Câu kiểm tra cuối file liệt kê họ.
--   Một người có nhiều dòng cùng loại sau khi đổi -> giữ dòng tạo sớm nhất;
--   người vừa có EDIT vừa có VIEW -> bỏ dòng VIEW.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- ============================================================

-- ─── 1. CHUYỂN VAI TRÒ CŨ ───
alter table public.pc_project_members drop constraint if exists pc_project_members_role_check;

-- Bỏ dòng trùng trước khi đổi (unique project_id, email, role).
with mapped as (
  select id,
         row_number() over (
           partition by project_id, lower(trim(email)),
                        case when role in ('CHT','QS','VP_BDH','VAT_TU','EDIT') then 'EDIT' else 'VIEW' end
           order by (role in ('EDIT','VIEW')) desc, created_at
         ) as rn
  from public.pc_project_members
  where role in ('CHT','QS','VP_BDH','VAT_TU','EDIT','KY_SU','QA_QC','VIEW')
)
delete from public.pc_project_members where id in (select id from mapped where rn > 1);

update public.pc_project_members set role = 'EDIT' where role in ('CHT','QS','VP_BDH','VAT_TU');
update public.pc_project_members set role = 'VIEW' where role in ('KY_SU','QA_QC');

-- Đã có quyền sửa thì dòng Xem thừa.
delete from public.pc_project_members v
 where v.role = 'VIEW'
   and exists (select 1 from public.pc_project_members e
               where e.role = 'EDIT' and e.project_id = v.project_id
                 and lower(trim(e.email)) = lower(trim(v.email)));

alter table public.pc_project_members add constraint pc_project_members_role_check
  check (role in ('VIEW','EDIT','GDDA','TC_KT'));

-- ─── 2. HÀM QUYỀN ───
-- 'GDDA' trong danh sách = cả người có cờ GĐDA/CHT đúng BĐH (pc_has_role, 112).
create or replace function public.pc_can_edit_structure(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pc_is_leadership() or public.pc_has_role(p_project, array['GDDA','EDIT']);
$$;

create or replace function public.pc_can_edit_site(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pc_is_leadership() or public.pc_has_role(p_project, array['GDDA','EDIT']);
$$;

create or replace function public.pc_can_log(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pc_is_leadership() or public.pc_has_role(p_project, array['GDDA','EDIT']);
$$;

create or replace function public.pc_can_approve_log(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pc_is_leadership() or public.pc_has_role(p_project, array['GDDA']);
$$;

create or replace function public.pc_can_edit_material(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pc_is_leadership() or public.pc_has_role(p_project, array['GDDA','EDIT']);
$$;

-- Giá vật tư là tiền: chỉ người thấy/sửa được tài chính dự án.
create or replace function public.pc_can_view_material_price(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pc_can_view_finance(p_project);
$$;

create or replace function public.pc_can_edit_material_price(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pc_can_edit_finance(p_project);
$$;

-- Danh mục vật tư + giá thị trường dùng chung (có giá) — bỏ VAT_TU.
create or replace function public.pc_can_manage_material_catalog()
returns boolean language sql stable security definer set search_path = public as $$
  select public.pc_is_leadership() or public.pc_is_finance_staff()
      or public.pc_is_bdh_manager_any()
      or exists (select 1 from public.pc_project_members m
                  where m.role = 'GDDA' and lower(trim(m.email)) = public.caller_email());
$$;

-- Chọn/tạo nhà thầu khi lập HĐ: thêm người có quyền Chỉnh sửa ở ít nhất 1 dự án.
create or replace function public.pc_can_pick_partner()
returns boolean language sql stable security definer set search_path = public as $$
  select public.pc_is_leadership()
      or public.pc_is_finance_staff()
      or public.pc_is_bdh_manager_any()
      or exists (select 1 from public.pc_project_members m
                 where m.role in ('GDDA','TC_KT','EDIT') and lower(trim(m.email)) = public.caller_email());
$$;

-- ─── 3. HỢP ĐỒNG + PHẠM VI: EDIT thêm/sửa, XOÁ chỉ quyền tài chính ───
drop policy if exists pc_contracts_write  on public.pc_contracts;
drop policy if exists pc_contracts_insert on public.pc_contracts;
drop policy if exists pc_contracts_update on public.pc_contracts;
drop policy if exists pc_contracts_delete on public.pc_contracts;
create policy pc_contracts_insert on public.pc_contracts for insert to authenticated
  with check (public.pc_can_edit_structure(project_id) or public.pc_can_edit_finance(project_id));
create policy pc_contracts_update on public.pc_contracts for update to authenticated
  using (public.pc_can_edit_structure(project_id) or public.pc_can_edit_finance(project_id))
  with check (public.pc_can_edit_structure(project_id) or public.pc_can_edit_finance(project_id));
create policy pc_contracts_delete on public.pc_contracts for delete to authenticated
  using (public.pc_can_edit_finance(project_id));

drop policy if exists pc_scopes_write  on public.pc_contract_scopes;
drop policy if exists pc_scopes_insert on public.pc_contract_scopes;
drop policy if exists pc_scopes_update on public.pc_contract_scopes;
drop policy if exists pc_scopes_delete on public.pc_contract_scopes;
create policy pc_scopes_insert on public.pc_contract_scopes for insert to authenticated
  with check (public.pc_can_edit_structure(public.pc_contract_project(contract_id))
           or public.pc_can_edit_finance(public.pc_contract_project(contract_id)));
create policy pc_scopes_update on public.pc_contract_scopes for update to authenticated
  using (public.pc_can_edit_structure(public.pc_contract_project(contract_id))
      or public.pc_can_edit_finance(public.pc_contract_project(contract_id)))
  with check (public.pc_can_edit_structure(public.pc_contract_project(contract_id))
           or public.pc_can_edit_finance(public.pc_contract_project(contract_id)));
create policy pc_scopes_delete on public.pc_contract_scopes for delete to authenticated
  using (public.pc_can_edit_finance(public.pc_contract_project(contract_id)));

-- ─── 4. QUYỀN GỌI HÀM ───
do $$
declare f text;
begin
  foreach f in array array['pc_can_edit_structure(uuid)','pc_can_edit_site(uuid)','pc_can_log(uuid)',
                           'pc_can_approve_log(uuid)','pc_can_edit_material(uuid)','pc_can_view_material_price(uuid)',
                           'pc_can_edit_material_price(uuid)','pc_can_manage_material_catalog()','pc_can_pick_partner()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- KIỂM TRA 1: phân bố vai trò sau khi chuyển (chỉ còn VIEW / EDIT / GDDA / TC_KT)
select role, count(*) from public.pc_project_members group by role order by role;

-- KIỂM TRA 2: người còn gán tay GDDA / TC_KT — tick cờ GĐDA/CHT hoặc TC-KT cho họ
-- rồi đổi dòng của họ sang Chỉnh sửa trong tab Thành viên.
select p.name as du_an, m.name, m.email, m.role
from public.pc_project_members m join public.pc_projects p on p.id = m.project_id
where m.role in ('GDDA','TC_KT') order by p.name, m.role;

-- KIỂM TRA 3: policy của 2 bảng hợp đồng
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' and tablename in ('pc_contracts','pc_contract_scopes') order by tablename, cmd;
