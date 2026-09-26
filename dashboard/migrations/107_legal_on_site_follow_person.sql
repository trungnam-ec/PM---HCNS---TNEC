-- ============================================================
-- 107 — PHÁP LÝ: CỘT "HIỆN DIỆN" ĐI THEO NGƯỜI PHỤ TRÁCH (chỉ dọn dữ liệu cũ)
--
-- Quy tắc mới trên giao diện tab B. Pháp lý: mục nhân sự chưa có người phụ
-- trách thì ẩn ô hiện diện; gán tên thì tự tích. File này đưa dữ liệu ĐÃ CÓ về
-- đúng quy tắc: có tên -> tích, không tên -> bỏ tích. Mục không theo dõi hiện
-- diện (on_site IS NULL) giữ nguyên.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- ============================================================

update public.pc_legal_items
set on_site = (coalesce(trim(person_name), '') <> '')
where on_site is not null
  and on_site is distinct from (coalesce(trim(person_name), '') <> '');
