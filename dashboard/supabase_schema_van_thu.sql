-- Lệnh SQL khởi tạo bảng quản lý văn thư trên Supabase
-- Vui lòng truy cập trang Supabase -> SQL Editor -> Tạo truy vấn mới, dán đoạn code này và nhấn Run.

CREATE TABLE IF NOT EXISTS clerical_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('incoming', 'outgoing_1', 'outgoing_2', 'outgoing_hdqt')),
  stt INT,
  receive_send_date DATE,
  doc_number TEXT,
  doc_date DATE,
  summary TEXT,
  sender_receiver TEXT,
  signer_recipient TEXT,
  has_scan BOOLEAN DEFAULT false,
  has_original BOOLEAN DEFAULT false,
  file_name TEXT,
  scan_file_url TEXT,
  original_file_url TEXT,
  ai_analysis JSONB
);

-- Tạo Index để tối ưu hoá tốc độ truy vấn theo loại công văn
CREATE INDEX IF NOT EXISTS idx_clerical_documents_type ON clerical_documents(type);

-- Vô hiệu hoá RLS để client-side có thể tự do đọc/ghi dữ liệu (thuận tiện cho môi trường phát triển)
ALTER TABLE clerical_documents DISABLE ROW LEVEL SECURITY;
