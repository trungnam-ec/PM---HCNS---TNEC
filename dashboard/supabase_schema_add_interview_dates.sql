-- SQL script to add new columns for "Ngày PV" and independent Notes for Vòng 1, Vòng 2, and Thử việc.
-- Please run this in the Supabase Dashboard -> SQL Editor.

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS v1_interview_date DATE;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS v2_interview_date DATE;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS v1_notes TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS v2_notes TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS thuviec_notes TEXT;
