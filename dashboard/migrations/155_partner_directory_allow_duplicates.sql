-- ============================================================
-- 155 — DANH BẠ ĐỐI TÁC: BỎ CHẶN TRÙNG (CHỈ CẢNH BÁO)
--
-- User chốt 13/10/2026: Danh bạ đối tác là KHO THU THẬP GỐC các thông tin lấy từ bên ngoài
-- để chọn nhà thầu tốt nhất khi ký hợp đồng; các danh mục đối tác khác (finance_partners,
-- atld_partners…) chỉ cập nhật từ đây sang. Phải GHI ĐẦY ĐỦ mọi thứ nhập vào — trùng với
-- đối tác khác "kệ nó, không sao", giao diện chỉ cảnh báo chứ không chặn lưu.
--
-- Hai thứ đang chặn trùng bị gỡ:
--   • trigger 154: chặn trùng TÊN / SỐ ĐIỆN THOẠI với đối tác chưa có MST  -> bỏ phần chặn trùng
--   • ràng buộc MST duy nhất của 150 (partner_directory_tax_unique)          -> đổi thành chỉ mục thường
-- GIỮ NGUYÊN trong trigger: bắt buộc nêu lý do khi Tạm dừng / Danh sách đen và ghi người đổi
-- + thời điểm (đó là kiểm soát nội bộ, không phải chặn trùng).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 150 và 154.
-- ============================================================

-- ─── 1. TRIGGER: chỉ còn phần lý do + người đổi trạng thái ───
create or replace function public.partner_directory_guard()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if (tg_op = 'INSERT' and new.status <> 'active')
     or (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    if new.status in ('paused', 'blacklist') and coalesce(btrim(new.status_reason), '') = '' then
      raise exception 'PARTNER_REASON_REQUIRED';
    end if;
    new.status_changed_at := now();
    new.status_changed_by := public.caller_email();
  end if;
  if new.status in ('active', 'saved') then
    new.status_reason := null;
  end if;
  return new;
end $fn$;

-- ─── 2. MST: bỏ ràng buộc duy nhất, giữ chỉ mục để tìm nhanh ───
drop index if exists public.partner_directory_tax_unique;
create index if not exists partner_directory_tax_idx
  on public.partner_directory (lower(trim(tax_code)))
  where tax_code is not null and trim(tax_code) <> '';

-- ─── KIỂM TRA ───
select 'còn chỉ mục MST duy nhất' as muc, count(*)::text as ket_qua from pg_indexes
 where schemaname = 'public' and tablename = 'partner_directory' and indexname = 'partner_directory_tax_unique'  -- mong đợi 0
union all
select 'chỉ mục MST thường', count(*)::text from pg_indexes
 where schemaname = 'public' and tablename = 'partner_directory' and indexname = 'partner_directory_tax_idx'     -- mong đợi 1
union all
select 'hàm guard còn chặn trùng', count(*)::text from pg_proc
 where proname = 'partner_directory_guard' and prosrc ilike '%PARTNER_DUP%';                                      -- mong đợi 0
