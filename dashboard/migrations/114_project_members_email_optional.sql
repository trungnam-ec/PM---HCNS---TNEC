-- ============================================================
-- 114 — THÀNH VIÊN DỰ ÁN KHÔNG BẮT BUỘC EMAIL
--
-- Nhân sự BĐH hiện trường (thủ kho, kỹ sư, công nhân…) nhiều người chưa có email
-- nhưng vẫn phải có trong danh sách nhân sự dự án (tab Thành viên, xuất PDF/Excel).
-- Trước đây ô chọn nhân sự bỏ qua hồ sơ không có email và cột email bắt buộc.
--
-- An toàn phân quyền: mọi hàm quyền so khớp lower(trim(m.email)) = caller_email();
-- email NULL không bao giờ khớp -> dòng không email chỉ để hiển thị, không cấp quyền.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- ============================================================

alter table public.pc_project_members alter column email drop not null;

-- KIỂM TRA: is_nullable phải là YES
select column_name, is_nullable from information_schema.columns
where table_schema = 'public' and table_name = 'pc_project_members' and column_name = 'email';
