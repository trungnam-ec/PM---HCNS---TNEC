-- SQL: Gộp email và dọn dẹp nhân sự trùng lặp phòng HCNS
-- Hãy copy đoạn code này và chạy trong Supabase Dashboard > SQL Editor

-- 1. Gộp email cho Dương Nhật Hoành Anh (Mã NV: 6408)
UPDATE employees 
SET email = 'anhdnh@trungnamgroup.com.vn, duongnhathoanhanh@gmail.com'
WHERE employee_code = '6408';
DELETE FROM employees WHERE name = 'Dương Nhật Hoành Anh' AND (employee_code IS NULL OR employee_code = '');

-- 2. Gộp email cho Võ Thị Thanh Nhàn (Mã NV: 6207)
UPDATE employees 
SET email = 'nhanvtt@trungnamgroup.com.vn, nhanvodesigner@gmail.com'
WHERE employee_code = '6207';
DELETE FROM employees WHERE name = 'Võ Thị Thanh Nhàn' AND (employee_code IS NULL OR employee_code = '');

-- 3. Gộp email cho Nguyễn Ngọc Thanh Hằng (Mã NV: 6338)
UPDATE employees 
SET email = 'hangnnt@trungnamgroup.com.vn, thanhhangg250379@gmail.com'
WHERE employee_code = '6338';
DELETE FROM employees WHERE name = 'Nguyễn Ngọc Thanh Hằng' AND (employee_code IS NULL OR employee_code = '');

-- 4. Gộp email cho Nguyễn Trường Thùy Quyên (Mã NV: 5897)
UPDATE employees 
SET email = 'quyenntt@trungnamgroup.com.vn, quyen.0408@gmail.com'
WHERE employee_code = '5897';
DELETE FROM employees WHERE name = 'Nguyễn Trường Thùy Quyên' AND (employee_code IS NULL OR employee_code = '');

-- 5. Gộp email cho Lê Thị Hoa Đào (Mã NV: 139)
UPDATE employees 
SET email = 'daolth@trungnamgroup.com.vn, lehoadao2706@gmail.com'
WHERE employee_code = '139';
DELETE FROM employees WHERE name = 'Lê Thị Hoa Đào' AND (employee_code IS NULL OR employee_code = '');

-- 6. Gộp email cho Nguyễn Bích Như Quỳnh (Mã NV: 6145)
UPDATE employees 
SET email = 'quynhnbn@trungnamgroup.com.vn, nhuquynh.nguyenbich@gmail.com'
WHERE employee_code = '6145';
DELETE FROM employees WHERE name = 'Nguyễn Bích Như Quỳnh' AND (employee_code IS NULL OR employee_code = '');

-- 7. Gộp email cho Phạm Thành Lộc (Mã NV: 5774)
UPDATE employees 
SET email = 'tnec.mkt@trungnamgroup.com.vn, phamthanhloc92vn@gmail.com'
WHERE employee_code = '5774';
DELETE FROM employees WHERE name = 'Phạm Thành Lộc' AND (employee_code IS NULL OR employee_code = '');
