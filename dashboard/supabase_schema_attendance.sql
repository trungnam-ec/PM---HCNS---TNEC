-- ==========================================
-- 1. TẠO BẢNG LƯU TRỮ LỊCH SỬ NHẬP CÔNG (ATTENDANCE IMPORTS)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.attendance_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month VARCHAR(10) NOT NULL,       -- Ví dụ: '05/2026'
  year VARCHAR(4) NOT NULL,         -- Ví dụ: '2026'
  month_val VARCHAR(2) NOT NULL,    -- Ví dụ: '05'
  file_name VARCHAR(255) NOT NULL,  -- Tên file gốc
  file_path VARCHAR(500) NOT NULL,  -- Đường dẫn lưu trữ: '2026/05/filename.xlsx'
  file_url VARCHAR(1000),           -- URL tải file trực tiếp
  parsed_data JSONB NOT NULL,       -- Danh sách nhân viên đã phân tích dạng JSON
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bật Row Level Security (RLS)
ALTER TABLE public.attendance_imports ENABLE ROW LEVEL SECURITY;

-- Tạo chính sách (Policies) cho phép truy cập công khai (đọc/ghi/xóa)
DROP POLICY IF EXISTS "Allow public select for attendance_imports" ON public.attendance_imports;
CREATE POLICY "Allow public select for attendance_imports" ON public.attendance_imports FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert for attendance_imports" ON public.attendance_imports;
CREATE POLICY "Allow public insert for attendance_imports" ON public.attendance_imports FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update for attendance_imports" ON public.attendance_imports;
CREATE POLICY "Allow public update for attendance_imports" ON public.attendance_imports FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete for attendance_imports" ON public.attendance_imports;
CREATE POLICY "Allow public delete for attendance_imports" ON public.attendance_imports FOR DELETE USING (true);


-- ==========================================
-- 2. KHỞI TẠO BUCKET LƯU TRỮ FILE EXCEL CHẤM CÔNG
-- ==========================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attendance-files', 
  'attendance-files', 
  true, 
  20971520, -- Giới hạn 20MB mỗi file Excel
  ARRAY[
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Tạo các chính sách (Policies) truy cập cho storage.objects thuộc bucket 'attendance-files'
DROP POLICY IF EXISTS "Allow public select for attendance-files" ON storage.objects;
CREATE POLICY "Allow public select for attendance-files" ON storage.objects FOR SELECT USING (bucket_id = 'attendance-files');

DROP POLICY IF EXISTS "Allow public insert for attendance-files" ON storage.objects;
CREATE POLICY "Allow public insert for attendance-files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'attendance-files');

DROP POLICY IF EXISTS "Allow public update for attendance-files" ON storage.objects;
CREATE POLICY "Allow public update for attendance-files" ON storage.objects FOR UPDATE USING (bucket_id = 'attendance-files');

DROP POLICY IF EXISTS "Allow public delete for attendance-files" ON storage.objects;
CREATE POLICY "Allow public delete for attendance-files" ON storage.objects FOR DELETE USING (bucket_id = 'attendance-files');
