-- ============================================================
-- 082_login_subtitle.sql
-- Dòng chữ lớn màu xanh trên MÀN HÌNH ĐĂNG NHẬP đọc từ tenant_config
-- thay vì hardcode trong AuthWrapper.
--
-- Tách riêng khỏi `system_subtitle` (dòng nhỏ dưới logo ở Sidebar): hai chỗ
-- này cần độ dài và cách xưng tên khác nhau, gộp chung thì sửa chỗ này hỏng
-- chỗ kia.
--
-- Khoá này BẮT BUỘC mở cho anon: màn hình đăng nhập chưa có session.
-- Không nhạy cảm — chuỗi mặc định vốn đã nằm sẵn trong bundle JS client.
-- ============================================================

-- ─── 1. SEED KHOÁ MỚI ───
insert into tenant_config (key, value, description) values
  ('login_subtitle', '"Hệ thống EOP Trungnam E&C"', 'Dòng chữ lớn màu xanh trên màn hình đăng nhập')
on conflict (key) do nothing;

-- ─── 2. MỞ RỘNG POLICY ANON ĐỌC TENANT_CONFIG ───
-- Giữ nguyên danh sách khoá của migration 004, chỉ thêm login_subtitle.
drop policy if exists "anon_read_brand_config" on tenant_config;
create policy "anon_read_brand_config" on tenant_config
  for select to anon
  using (key in (
    'company_name', 'company_short', 'system_title', 'system_subtitle',
    'login_subtitle', 'logo_text', 'email_sender_name', 'chairman_name', 'site_url'
  ));

-- ─── 3. KIỂM TRA KẾT QUẢ ───
select key, value from tenant_config where key = 'login_subtitle';
