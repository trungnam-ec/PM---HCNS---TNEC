-- ============================================================
-- 126 — P. AN TOÀN LAO ĐỘNG: GÓI ENTERPRISE + CỜ "XEM MODULE"
--
-- User yêu cầu 02/10/2026: module về gói cao nhất (Enterprise) và có cờ quyền để
-- tích cấp phép từng nhân sự được vào. BỎ chốt cũ "mọi tài khoản đều xem được
-- tồn + đơn giá" (116).
--
-- Ai được XEM (đọc dữ liệu atld_*):
--   Admin · cờ can_view_atld (mới) · cờ Thủ kho ATLĐ · cờ Duyệt xuất kho ATLĐ.
-- Hai cờ cũ vẫn là quyền THAO TÁC (lập phiếu / duyệt) và tự kèm quyền xem —
-- không phải tích thêm cờ xem cho thủ kho, TP/PP.
--
-- Chốt chặn ở CSDL chứ không chỉ ẩn menu: thay policy ĐỌC (using true) của 7
-- bảng atld_* + kho tệp atld-files bằng atld_can_view(). Hai view atld_stock /
-- atld_trade_prices và hàm atld_stock_period là security_invoker nên tự theo RLS
-- của bảng gốc. Policy GHI không đổi.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 116 → 125.
-- SAU KHI CHẠY: Cài đặt > Phân quyền > Cờ quyền người dùng > nhóm "Kho BHLĐ" —
-- tích "Xem module" cho những người cần vào (Admin luôn vào được).
-- ============================================================

-- ─── 1. Cột cờ ───
alter table public.approval_permissions
  add column if not exists can_view_atld boolean not null default false;

-- ─── 2. Hàm quyết định quyền xem ───
create or replace function public.atld_can_view()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_caller() or exists (
    select 1 from public.approval_permissions p
    where (p.can_view_atld = true or p.can_manage_atld_stock = true or p.can_approve_atld_issue = true)
      and public.atld_email_in(p.email)
  );
$$;
revoke all on function public.atld_can_view() from public, anon;
grant execute on function public.atld_can_view() to authenticated;

-- atld_my_access trả thêm 'viewer' (giao diện).
create or replace function public.atld_my_access()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('keeper', public.atld_is_keeper(), 'approver', public.atld_is_approver(), 'viewer', public.atld_can_view());
$$;

-- ─── 3. Policy ĐỌC của 7 bảng: thay "using (true)" bằng atld_can_view() ───
-- Chỉ xoá policy SELECT (giữ nguyên insert/update/delete của 116/120/121).
do $$
declare t text; pol record;
begin
  foreach t in array array['atld_items','atld_partners','atld_vouchers','atld_voucher_lines','atld_lots','atld_ledger','atld_price_history'] loop
    for pol in select policyname from pg_policies
                where schemaname = 'public' and tablename = t and cmd = 'SELECT' loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
    execute format('create policy %I on public.%I for select to authenticated using (public.atld_can_view())', t || '_read', t);
  end loop;
end $$;

-- ─── 4. Kho tệp chứng từ gốc ───
do $$
begin
  execute 'drop policy if exists "atld files select authenticated" on storage.objects';
  execute 'drop policy if exists "atld files select viewer" on storage.objects';
  execute $p$
    create policy "atld files select viewer" on storage.objects for select to authenticated
      using (bucket_id = 'atld-files' and public.atld_can_view())
  $p$;
exception
  when insufficient_privilege or others then
    raise warning 'KHÔNG đổi được policy storage (%). Sửa tay trong Supabase > Storage > atld-files > Policies.', sqlerrm;
end $$;

-- ─── 5. KIỂM TRA ───
select 'cột can_view_atld' as muc, count(*)::text as ket_qua from information_schema.columns
 where table_schema = 'public' and table_name = 'approval_permissions' and column_name = 'can_view_atld'   -- mong đợi 1
union all
select 'policy đọc dùng atld_can_view', count(*)::text from pg_policies
 where schemaname = 'public' and tablename like 'atld\_%' and cmd = 'SELECT'
   and qual ilike '%atld_can_view%'                                                                       -- mong đợi 7
union all
select 'policy đọc còn mở (true)', count(*)::text from pg_policies
 where schemaname = 'public' and tablename like 'atld\_%' and cmd = 'SELECT' and qual = 'true'           -- mong đợi 0
union all
select 'storage atld files select', count(*)::text from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and policyname = 'atld files select viewer';     -- mong đợi 1
