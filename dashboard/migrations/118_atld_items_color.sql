-- ============================================================
-- 118 — KHO BHLĐ: CỘT MÀU SẮC CHO DANH MỤC SẢN PHẨM
--
-- User yêu cầu 02/10/2026: thêm "Màu sắc" chọn từ dropdown Trắng / Vàng / Xanh / Đỏ
-- (nón công nhân vàng, nón kỹ sư trắng, nón an toàn đỏ…). Danh sách màu nằm ở
-- giao diện (lib/atldStock.ts > COLOR_OPTIONS) — KHÔNG đặt CHECK ở CSDL để sau
-- này thêm màu chỉ cần sửa code, không phải chạy migration.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 116.
-- ============================================================

alter table public.atld_items add column if not exists color text;

-- Trigger chuẩn hoá của 116 — nguyên văn, thêm dòng dọn khoảng trắng cho color.
create or replace function public.atld_items_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.code := trim(new.code);
  new.name := trim(new.name);
  new.size := nullif(trim(coalesce(new.size, '')), '');
  new.unit := nullif(trim(coalesce(new.unit, '')), '');
  new.color := nullif(trim(coalesce(new.color, '')), '');
  if tg_op = 'INSERT' then
    new.created_by := public.caller_email();
  else
    new.created_by := old.created_by;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- KIỂM TRA: mong đợi 1 dòng "color"
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'atld_items' and column_name = 'color';
