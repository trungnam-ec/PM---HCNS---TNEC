-- Migration: Add extended employee columns
-- Run this in Supabase Dashboard > SQL Editor

ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_code TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS date_of_birth TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS cccd TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS degree TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS notes TEXT;
