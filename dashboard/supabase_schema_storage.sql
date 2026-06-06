-- 1. Khởi tạo bucket 'clerical-documents' nếu chưa tồn tại
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clerical-documents', 
  'clerical-documents', 
  true, 
  10485760, -- Giới hạn 10MB mỗi file
  ARRAY[
    'application/pdf', 
    'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
    'image/png', 
    'image/jpeg', 
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
    'application/pdf', 
    'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
    'image/png', 
    'image/jpeg', 
    'text/plain'
  ];

-- 2. Cho phép xem công khai các tệp trong bucket 'clerical-documents' (Select Policy)
CREATE POLICY "Allow public select for clerical-documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'clerical-documents');

-- 3. Cho phép tải lên tệp mới (Insert Policy)
CREATE POLICY "Allow public insert for clerical-documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'clerical-documents');

-- 4. Cho phép cập nhật tệp hiện có (Update Policy)
CREATE POLICY "Allow public update for clerical-documents"
ON storage.objects FOR UPDATE
USING (bucket_id = 'clerical-documents');

-- 5. Cho phép xóa tệp (Delete Policy)
CREATE POLICY "Allow public delete for clerical-documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'clerical-documents');
