-- ============================================================
-- 072 — HỒ SƠ THANH TOÁN: kho tạm để né giới hạn 4.5MB của Vercel
--
-- Vercel serverless giới hạn REQUEST BODY 4.5MB. PDF scan hồ sơ thanh toán
-- thường lớn hơn -> gửi thẳng file qua route bị 413 "Request Entity Too Large"
-- (trả text thô, client parse JSON vỡ).
--
-- Cách né: client TẢI FILE THẲNG LÊN Supabase Storage (không qua Vercel), rồi
-- route /api/analyze-payment-dossier chỉ nhận ĐƯỜNG DẪN (JSON nhỏ), tự tải file
-- từ Storage (server -> Supabase, không dính giới hạn 4.5MB) rồi gửi OpenAI, xử
-- lý xong xoá file tạm.
--
-- Bucket PRIVATE, chỉ tài khoản đăng nhập (authenticated) ghi/đọc/xoá.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > Run. An toàn chạy lại nhiều lần.
-- ============================================================

do $$ begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('payment-dossiers','payment-dossiers', false, 26214400,  -- 25MB
          array['application/pdf','image/jpeg','image/png','image/webp',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/msword','text/plain'])
  on conflict (id) do update set
    public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
exception when insufficient_privilege or others then
  raise warning 'Tao bucket tay: Supabase > Storage > New bucket "payment-dossiers", BO TICK Public, file size limit 25MB.';
end $$;

do $$ begin
  execute 'drop policy if exists "pd file insert auth" on storage.objects';
  execute 'drop policy if exists "pd file select auth" on storage.objects';
  execute 'drop policy if exists "pd file delete auth" on storage.objects';
  execute $p$ create policy "pd file insert auth" on storage.objects
      for insert to authenticated with check (bucket_id='payment-dossiers') $p$;
  execute $p$ create policy "pd file select auth" on storage.objects
      for select to authenticated using (bucket_id='payment-dossiers') $p$;
  execute $p$ create policy "pd file delete auth" on storage.objects
      for delete to authenticated using (bucket_id='payment-dossiers') $p$;
exception when insufficient_privilege or others then
  raise warning 'Tao policy storage tay trong Supabase > Storage > payment-dossiers > Policies.';
end $$;

-- KIỂM TRA: bucket đã tạo (mong đợi 1 dòng, public=false)
select id, public, file_size_limit from storage.buckets where id='payment-dossiers';
