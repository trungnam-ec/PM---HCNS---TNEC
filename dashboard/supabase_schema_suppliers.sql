-- SQL Schema to create suppliers table and seed initial data
-- Copy this query, go to Supabase -> SQL Editor -> New Query, paste and run it.

CREATE TABLE IF NOT EXISTS public.suppliers (
  id TEXT PRIMARY KEY, -- ID dạng NCC-01
  name TEXT NOT NULL,
  account TEXT NOT NULL,
  bank TEXT NOT NULL,
  service TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Disable Row Level Security (RLS) so the client can perform read/write operations directly
ALTER TABLE public.suppliers DISABLE ROW LEVEL SECURITY;

-- Enable public access policies just in case RLS is re-enabled globally
DROP POLICY IF EXISTS "Allow public select for suppliers" ON public.suppliers;
CREATE POLICY "Allow public select for suppliers" ON public.suppliers FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert for suppliers" ON public.suppliers;
CREATE POLICY "Allow public insert for suppliers" ON public.suppliers FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update for suppliers" ON public.suppliers;
CREATE POLICY "Allow public update for suppliers" ON public.suppliers FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete for suppliers" ON public.suppliers;
CREATE POLICY "Allow public delete for suppliers" ON public.suppliers FOR DELETE USING (true);

-- Seed initial 7 suppliers
INSERT INTO public.suppliers (id, name, account, bank, service) VALUES
('NCC-01', 'CÔNG TY CỔ PHẦN AN CƯ ĐỨC PHÚ', '520052868', 'TP BANK - PGD Kỳ Hòa - CN Sài Gòn', 'Thuê văn phòng HCM'),
('NCC-02', 'CÔNG TY CỔ PHẦN ĐẦU TƯ THỊNH VƯỢNG HVC', '334818', 'ACB - CN Tân Bình', 'Lắp máy lạnh văn phòng'),
('NCC-03', 'CÔNG TY CỔ PHẦN HAI BỐN BẢY', '14020592925013', 'NH TMCP Kỹ Thương VN - CN Quang Trung', 'Chuyển phát nhanh'),
('NCC-04', 'CÔNG TY CỔ PHẦN THƯƠNG MẠI XÂY DỰNG HPK', '3181551718', 'NH ACB - CN Gò Vấp', 'Thi công sửa chữa văn phòng'),
('NCC-05', 'Nguyễn Bích Như Quỳnh', '11112857', 'Ngân hàng ACB', ''),
('NCC-06', 'Nguyễn Ngọc Thanh Hằng', '02597652501', 'Ngân hàng Tiên Phong (TP BANK)', ''),
('NCC-07', 'TRẦN NGHIỆP QUANG', '0942870512', 'Ngân hàng SHB', 'Thuê nhà Vàm Lẽo')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  account = EXCLUDED.account,
  bank = EXCLUDED.bank,
  service = EXCLUDED.service;
