-- SQL Query to update public.suppliers and public.invoices tables
-- Go to Supabase -> SQL Editor -> New Query, paste and run this code.

-- 1. Add project_name column to both suppliers and invoices tables
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS project_name TEXT DEFAULT 'Văn phòng HCM';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS project_name TEXT DEFAULT 'Văn phòng HCM';

-- 2. Update initial suppliers with correct project names
UPDATE public.suppliers SET project_name = 'Văn phòng HCM' WHERE id IN ('NCC-01', 'NCC-02', 'NCC-03', 'NCC-04', 'NCC-05', 'NCC-06');
UPDATE public.suppliers SET project_name = 'Vàm Lẽo' WHERE id = 'NCC-07';
