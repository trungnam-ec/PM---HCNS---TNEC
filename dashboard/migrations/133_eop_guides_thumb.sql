-- ============================================================
-- 133 — Ảnh thu nhỏ cho Hướng dẫn EOP
--
-- Thêm cột thumb_path: đường dẫn ảnh trong bucket RIÊNG TƯ `news-media`
-- (thư mục eop/). Dùng lại bucket + policy của module Tin tức (migration 023),
-- quyền ghi vẫn là caller_can_manage_news() — không cần bucket/policy mới.
--
-- CÁCH CHẠY: Supabase SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

alter table public.eop_guides
  add column if not exists thumb_path text;

-- Kiểm tra: phải ra 1 dòng
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'eop_guides' and column_name = 'thumb_path';
