-- ============================================================
-- 089 — KHO TỆP PHIẾU TRÌNH KÝ: SIẾT THEO ĐÚNG PHẠM VI XEM CỦA PHIẾU
--
-- LỖ HỔNG (phát hiện 22/09/2026 khi rà soát phạm vi xem theo yêu cầu của user):
-- Bảng `signing_submissions` đã phân phòng ban rất chặt từ 074 — nhân viên chỉ
-- thấy phiếu của mình, Trưởng/Phó phòng thấy cả phòng mình. NHƯNG kho tệp đính
-- kèm thì KHÔNG: policy cũ của 051 là
--
--     using (bucket_id = 'signing-dossiers' and public.signing_is_participant())
--
-- mà `signing_is_participant()` = Admin HOẶC có cờ lập phiếu HOẶC giữ bất kỳ cờ
-- duyệt nào. Tức là BẤT KỲ ai lập được phiếu đều đọc được TOÀN BỘ tệp trong kho,
-- kể cả hồ sơ, báo giá, hợp đồng của phòng ban khác — chỉ cần liệt kê kho rồi
-- tự tạo signed URL. RLS của bảng không che được chuyện này vì Storage là bảng
-- khác (`storage.objects`), không chịu policy của `signing_submissions`.
--
-- CÁCH VÁ: đọc được tệp khi và chỉ khi đọc được PHIẾU đang trỏ vào tệp đó.
-- Hàm `signing_file_visible()` CỐ Ý KHÔNG security definer — phải chạy dưới
-- quyền người gọi thì policy `signing_select` (074) mới áp vào, đó chính là chỗ
-- luật "của mình / của phòng mình" đang nằm. Đặt security definer ở đây là vô
-- hiệu hoá toàn bộ bản vá.
--
-- Vẫn cho người vừa TẢI LÊN đọc tệp của chính họ (`owner`): trong form soạn
-- phiếu, tệp tải lên xong là bấm xem lại được ngay, lúc đó chưa có dòng phiếu
-- nào trỏ tới nên nhánh trên chưa khớp.
--
-- KHÔNG đụng 3 policy INSERT/UPDATE/DELETE của 051: tải lên vẫn theo cờ lập
-- phiếu như cũ.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ -> Run.
-- An toàn chạy lại nhiều lần. YÊU CẦU: đã chạy 050, 051, 074.
-- ============================================================

-- ─── 1. Tệp này có thuộc phiếu mà tôi được xem không? ───
-- Cột `files` là jsonb mảng [{path,name,size}], nên dùng toán tử chứa @>:
--   '[{"path":"x","name":"y"}]' @> '[{"path":"x"}]'  ->  true
create or replace function public.signing_file_visible(p_path text)
returns boolean
language sql
stable
-- ⚠ KHÔNG security definer (xem ghi chú đầu file).
set search_path = public
as $$
  select coalesce(btrim(p_path), '') <> '' and exists (
    select 1
    from public.signing_submissions s
    where s.files @> jsonb_build_array(jsonb_build_object('path', p_path))
  );
$$;

grant execute on function public.signing_file_visible(text) to authenticated;

-- Kho tệp duyệt theo từng object nên truy vấn này chạy nhiều lần; không có chỉ
-- mục thì mỗi lần là một lượt quét bảng.
create index if not exists idx_signing_submissions_files_gin
  on public.signing_submissions using gin (files);

-- ─── 2. Thay policy SELECT của bucket ───
-- Bọc trong DO: cột định danh người tải lên tuỳ phiên bản Supabase (`owner`
-- uuid kiểu cũ, `owner_id` text kiểu mới). Dò rồi mới dựng câu policy, và
-- không có cột nào thì bỏ hẳn nhánh đó chứ không làm hỏng cả script.
do $$
declare
  owner_clause text := '';
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'objects'
               and column_name = 'owner_id') then
    owner_clause := ' or owner_id = auth.uid()::text';
  elsif exists (select 1 from information_schema.columns
                where table_schema = 'storage' and table_name = 'objects'
                  and column_name = 'owner') then
    owner_clause := ' or owner = auth.uid()';
  end if;

  execute 'drop policy if exists "signing dossier select participant" on storage.objects';
  execute 'drop policy if exists "signing dossier select scoped" on storage.objects';

  execute format($f$
    create policy "signing dossier select scoped"
      on storage.objects for select to authenticated
      using (
        bucket_id = 'signing-dossiers'
        and (
          public.is_admin_caller()
          or public.signing_file_visible(name)
          %s
        )
      )
  $f$, owner_clause);

  raise notice 'Da thay policy doc kho signing-dossiers (nhanh owner: "%").', owner_clause;
exception when others then
  raise warning 'KHONG dat duoc policy storage (%). Vao Supabase > Storage > signing-dossiers > Policies sua tay.', sqlerrm;
end $$;

-- ─── 3. KIỂM TRA ───
-- 3a. Chỉ còn ĐÚNG 1 policy SELECT, và nó phải là bản "scoped"
select policyname, cmd, qual
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'signing dossier%'
order by cmd, policyname;

-- 3b. Đối chiếu: số tệp CÓ phiếu trỏ tới vs tổng số tệp trong kho.
-- Chênh lệch = tệp mồ côi (tải lên rồi bỏ dở, hoặc đã gỡ khỏi phiếu) — từ nay
-- chỉ chính người tải lên và Admin đọc được, đúng như mong muốn.
select
  (select count(*) from storage.objects where bucket_id = 'signing-dossiers') as tong_tep,
  (select count(*) from storage.objects o
    where o.bucket_id = 'signing-dossiers'
      and exists (select 1 from public.signing_submissions s
                  where s.files @> jsonb_build_array(jsonb_build_object('path', o.name)))
  ) as tep_co_phieu_tro_toi;
