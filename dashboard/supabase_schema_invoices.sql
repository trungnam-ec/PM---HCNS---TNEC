-- Lệnh SQL khởi tạo bảng quản lý hoá đơn trên Supabase
-- Vui lòng truy cập trang Supabase -> SQL Editor -> Tạo truy vấn mới, dán đoạn code này và nhấn Run.

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  number TEXT NOT NULL,
  date DATE,
  description TEXT,
  amount NUMERIC,
  file_url TEXT,
  beneficiary_name TEXT,
  bank_account TEXT,
  bank_name_branch TEXT
);

-- Tạo Index để tối ưu hoá tốc độ truy vấn theo số hoá đơn
CREATE INDEX IF NOT EXISTS idx_invoices_number ON public.invoices(number);

-- Vô hiệu hoá RLS để client-side có thể tự do đọc/ghi dữ liệu (thuận tiện cho môi trường phát triển)
ALTER TABLE public.invoices DISABLE ROW LEVEL SECURITY;

-- Tạo các Policy công khai để đảm bảo quyền truy cập đọc/ghi hoạt động tốt trong mọi cấu hình RLS:
DROP POLICY IF EXISTS "Allow public select for invoices" ON public.invoices;
CREATE POLICY "Allow public select for invoices" ON public.invoices FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert for invoices" ON public.invoices;
CREATE POLICY "Allow public insert for invoices" ON public.invoices FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update for invoices" ON public.invoices;
CREATE POLICY "Allow public update for invoices" ON public.invoices FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete for invoices" ON public.invoices;
CREATE POLICY "Allow public delete for invoices" ON public.invoices FOR DELETE USING (true);
