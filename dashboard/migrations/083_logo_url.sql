-- ============================================================
-- 083_logo_url.sql
-- Ô logo (đăng nhập / Sidebar / trang góp ý) đọc thêm khoá `logo_url`.
--
-- Có giá trị -> hiện ẢNH; để rỗng -> giữ nguyên ô 2 chữ cái `logo_text`.
-- Ảnh tải lỗi cũng tự rơi về chữ (xem components/BrandLogo.tsx), nên gắn sai
-- đường dẫn thì giao diện vẫn lành.
--
-- Khoá này BẮT BUỘC mở cho anon: màn hình đăng nhập và trang góp ý đều
-- chưa có session. Không nhạy cảm — chỉ là đường dẫn ảnh thương hiệu.
-- ============================================================

-- ─── 1. SEED KHOÁ MỚI (rỗng = chưa gắn ảnh) ───
insert into tenant_config (key, value, description) values
  ('logo_url', '""', 'Đường dẫn ảnh logo ("/logo.png" hoặc URL đầy đủ). Rỗng = dùng 2 chữ cái logo_text')
on conflict (key) do nothing;

-- ─── 2. MỞ RỘNG POLICY ANON ĐỌC TENANT_CONFIG ───
-- Giữ nguyên danh sách khoá của migration 082, chỉ thêm logo_url.
drop policy if exists "anon_read_brand_config" on tenant_config;
create policy "anon_read_brand_config" on tenant_config
  for select to anon
  using (key in (
    'company_name', 'company_short', 'system_title', 'system_subtitle',
    'login_subtitle', 'logo_text', 'logo_url',
    'email_sender_name', 'chairman_name', 'site_url'
  ));

-- ─── 3. KIỂM TRA KẾT QUẢ ───
select key, value from tenant_config where key in ('logo_text', 'logo_url', 'login_subtitle');
