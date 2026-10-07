-- ============================================================
-- 140 — KHẤU TRỪ XỬ PHẠT: NẠP 4 HỒ SƠ TỪ BẢNG EXCEL CŨ
--
-- User gửi ảnh bảng Excel 07/10/2026 (HS.XP-2026-001 → 004), yêu cầu đưa vào tab.
-- Chạy trong SQL Editor (không có tài khoản đăng nhập) nên trigger 139 sẽ coi là
-- "không có quyền KHĐT" và xoá trắng cột đầu ra -> TẠM TẮT trigger trong lúc nạp,
-- tự ghi mã/năm/số thứ tự giữ đúng số cũ. Hồ sơ tạo mới sau đó tự lấy số 005.
-- Dự án: danh mục dự án đang trống -> chỉ ghi TÊN, mã để trống (sửa sau trên form).
-- Nhà thầu: tự gắn với danh mục đối tác nếu trùng tên (bỏ hoa/thường).
-- Link số QĐ trong Excel không lấy được từ ảnh -> gắn tệp/link lại trên form.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run.
-- Chạy lại được: hồ sơ đã có mã thì bỏ qua.
-- YÊU CẦU: đã chạy 139.
-- ============================================================

begin;
alter table public.atld_penalties disable trigger atld_penalties_before_write;

insert into public.atld_penalties (
  nam, seq, ma_ho_so, loai_ho_so, so_quyet_dinh, ngay_ban_hanh, project_name,
  contractor_id, contractor_name, noi_dung, gia_tri_phai_tru, nguoi_lap, ngay_gui_khdt,
  ngay_tiep_nhan, dot_thanh_toan, gia_tri_da_tru, nguoi_nhap, created_by
)
select v.nam, v.seq, v.ma, 'Xử phạt vi phạm an toàn', v.qd, v.ngay_bh::date, v.du_an,
       (select f.id from public.finance_partners f
         where lower(trim(f.name)) = lower(trim(v.nha_thau)) limit 1),
       v.nha_thau, v.noi_dung, v.phai_tru, 'Nguyễn Minh Thảo', date '2026-07-21',
       v.tiep_nhan::date, v.dot, v.da_tru, v.nguoi_nhap, 'excel-import'
from (values
  (2026, 1, 'HS.XP-2026-001', '52/026/QĐ/TNE&C',  '2026-05-08', 'Hương Lộ 11',
   'CÔNG TY TNHH XÂY DỰNG PHƯỚC VẠN THỊNH', 'Không chấp hành PPE và Bố trí biển báo', 800000,
   '2026-05-11', null, 0, 'Nguyễn Thị Ngọc Phú'),
  (2026, 2, 'HS.XP-2026-002', '80/026/QĐ/TNE&C',  '2026-05-29', 'Hương Lộ 11',
   'CÔNG TY TNHH XÂY DỰNG PHƯỚC VẠN THỊNH', 'Không chấp hành PPE', 600000,
   null, null, 0, 'Nguyễn Thị Ngọc Phú'),
  (2026, 3, 'HS.XP-2026-003', '70/026/QĐ/TNE&C',  '2026-05-23', 'XLNT Tây Ninh',
   'CÔNG TY TNHH GIẢI PHÁP MÔI TRƯỜNG ĐẠI NAM', 'Không trình nộp đầy đủ hồ sơ người và thiết bị', 1000000,
   '2026-07-21', 'HSTT Đợt 2', 1000000, null),
  (2026, 4, 'HS.XP-2026-004', '121/026/QĐ/TNE&C', '2026-06-24', 'XLNT Tây Ninh',
   'CÔNG TY TNHH GIẢI PHÁP MÔI TRƯỜNG ĐẠI NAM', 'Không trình nộp đầy đủ hồ sơ người và thiết bị', 2000000,
   '2026-07-21', 'HSTT Đợt 2', 2000000, null)
) as v(nam, seq, ma, qd, ngay_bh, du_an, nha_thau, noi_dung, phai_tru, tiep_nhan, dot, da_tru, nguoi_nhap)
where not exists (select 1 from public.atld_penalties p where p.ma_ho_so = v.ma);

alter table public.atld_penalties enable trigger atld_penalties_before_write;
commit;

-- KIỂM TRA: mong đợi 4 dòng, còn lại 800.000 / 600.000 / 0 / 0
select ma_ho_so, contractor_name, contractor_id is not null as khop_danh_muc_doi_tac,
       gia_tri_phai_tru, gia_tri_da_tru, gia_tri_con_lai
  from public.atld_penalties order by nam, seq;
