-- SQL Schema to fix RLS and structure for admin_monthly_reports
-- Copy this query, go to Supabase -> SQL Editor -> New Query, paste and run it.

CREATE TABLE IF NOT EXISTS public.admin_monthly_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stt TEXT NOT NULL,
  content TEXT NOT NULL,
  category_type TEXT DEFAULT 'office', -- 'office' or 'project'
  m1 NUMERIC DEFAULT 0,
  m2 NUMERIC DEFAULT 0,
  m3 NUMERIC DEFAULT 0,
  m4 NUMERIC DEFAULT 0,
  m5 NUMERIC DEFAULT 0,
  m6 NUMERIC DEFAULT 0,
  m7 NUMERIC DEFAULT 0,
  m8 NUMERIC DEFAULT 0,
  m9 NUMERIC DEFAULT 0,
  m10 NUMERIC DEFAULT 0,
  m11 NUMERIC DEFAULT 0,
  m12 NUMERIC DEFAULT 0,
  notes TEXT,
  is_custom BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Disable Row Level Security (RLS) so the client can perform read/write operations directly
ALTER TABLE public.admin_monthly_reports DISABLE ROW LEVEL SECURITY;

-- Enable public access policies just in case RLS is re-enabled globally
DROP POLICY IF EXISTS "Allow public select for admin_monthly_reports" ON public.admin_monthly_reports;
CREATE POLICY "Allow public select for admin_monthly_reports" ON public.admin_monthly_reports FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert for admin_monthly_reports" ON public.admin_monthly_reports;
CREATE POLICY "Allow public insert for admin_monthly_reports" ON public.admin_monthly_reports FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update for admin_monthly_reports" ON public.admin_monthly_reports;
CREATE POLICY "Allow public update for admin_monthly_reports" ON public.admin_monthly_reports FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete for admin_monthly_reports" ON public.admin_monthly_reports;
CREATE POLICY "Allow public delete for admin_monthly_reports" ON public.admin_monthly_reports FOR DELETE USING (true);
