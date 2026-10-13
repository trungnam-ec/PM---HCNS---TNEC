-- ============================================================
-- 157 — DANH BẠ ĐỐI TÁC: NGƯỜI CÓ CỜ "CHỈNH SỬA" ĐƯỢC XOÁ ĐỐI TÁC
-- User yêu cầu 13/10/2026: thẻ có nút X xoá nhanh; "chỉ người có cờ mới xoá được, người xem không
-- sửa và không xoá được". Trước đây (150) xoá chỉ Admin; nay xoá theo cờ can_manage_partner_dir
-- (Admin luôn được). Người chỉ có cờ XEM vẫn KHÔNG sửa, KHÔNG xoá.
-- Bảng tệp đính kèm và kho tệp đã cho người có cờ Sửa xoá (154) nên xoá đối tác trọn vẹn.
-- Muốn quay lại "chỉ Admin xoá": đổi hàm trong policy về public.is_admin_caller().
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại được.
-- YÊU CẦU: đã chạy 150.
-- ============================================================

drop policy if exists partner_directory_delete on public.partner_directory;
create policy partner_directory_delete on public.partner_directory
  for delete to authenticated using (public.partner_dir_can_manage());

select 'policy xoá theo cờ Sửa' as muc, count(*)::text as ket_qua from pg_policies
 where schemaname = 'public' and tablename = 'partner_directory' and policyname = 'partner_directory_delete'
   and qual ilike '%partner_dir_can_manage%';   -- mong đợi 1
