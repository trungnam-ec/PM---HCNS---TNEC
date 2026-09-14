-- ============================================================
-- 077 — NHÂN VIÊN TỰ GHI MẪU GIỌNG CỦA CHÍNH MÌNH
--
-- VẤN ĐỀ: mẫu giọng lưu ở cột `employees.voice_sample_path`, mà UPDATE bảng
-- `employees` bị khoá sau can_manage_employees_caller() từ migration 007. Nhân
-- viên thường bấm ghi mẫu là bị chặn, phải nhờ HCNS ghi hộ từng người — trong
-- khi đây là thứ mỗi người tự làm cho mình là nhanh nhất.
--
-- VÌ SAO KHÔNG NỚI RLS: RLS của Postgres chặn theo DÒNG, không chặn theo CỘT.
-- Cho nhân viên update dòng của chính họ là mở luôn mọi cột trong hồ sơ: chức
-- danh, phòng ban, trạng thái nghỉ việc, hạn mức phép. Đổi một tiện ích nhỏ lấy
-- một lỗ hổng thật.
--
-- CÁCH XỬ LÝ: mở ĐÚNG MỘT Ô, y khuôn migration 040 (my_contract_type).
--   Hàm security definer dưới đây tự lấy email người đăng nhập từ token, tìm
--   đúng hồ sơ của họ và chỉ ghi mỗi cột `voice_sample_path`. Không có tham số
--   nào để trỏ sang người khác, và đường dẫn bị ÉP phải đúng dạng
--   `voice_samples/<id-của-chính-họ>.<đuôi>` — người dùng không thể trỏ hồ sơ
--   mình vào file bất kỳ trong kho.
--
-- Truyền NULL để xoá mẫu giọng của chính mình.
-- Trả về: id nhân sự nếu ghi được, NULL nếu không khớp người hoặc đường dẫn sai.
--
-- Cách khớp người: đúng quy ước toàn hệ thống — "email đã lưu CHỨA email đăng
-- nhập" (một người có thể lưu nhiều email ngăn bởi dấu phẩy).
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ file -> Run.
-- An toàn chạy lại nhiều lần.
-- ============================================================

create or replace function public.set_my_voice_sample(p_path text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_id    uuid;
begin
  -- ⚠ BẮT BUỘC: position('' in bất_kỳ_chuỗi_nào) = 1, nên phiên KHÔNG có danh
  -- tính (email rỗng) sẽ khớp với MỌI nhân viên nếu bỏ chốt này. Cùng cái bẫy
  -- đã dính ở migration 018 và 040.
  if v_email = '' then
    return null;
  end if;

  select e.id into v_id
  from public.employees e
  where position(v_email in lower(coalesce(e.email, ''))) > 0
  limit 1;

  if v_id is null then
    return null;
  end if;

  -- Chỉ nhận đường dẫn trỏ đúng vào file mang id của CHÍNH người này. Không có
  -- chốt này thì ai cũng trỏ hồ sơ mình vào mẫu giọng của người khác được.
  if p_path is not null
     and p_path !~ ('^voice_samples/' || v_id::text || '\.(webm|wav|mp3|mpeg|m4a|mp4|ogg)$')
  then
    return null;
  end if;

  update public.employees
  set voice_sample_path = p_path
  where id = v_id;

  return v_id::text;
end;
$fn$;

comment on function public.set_my_voice_sample(text) is
  'Nhân viên tự ghi/xoá mẫu giọng của CHÍNH MÌNH. Chỉ đụng cột voice_sample_path, chỉ trên hồ sơ khớp email đăng nhập, và đường dẫn phải mang đúng id của họ.';

-- Chỉ người ĐÃ ĐĂNG NHẬP mới gọi được. Thu quyền của anon/public cho chắc —
-- mặc định Postgres cấp execute cho public.
revoke all on function public.set_my_voice_sample(text) from public;
revoke all on function public.set_my_voice_sample(text) from anon;
grant execute on function public.set_my_voice_sample(text) to authenticated;


-- ─── KIỂM CHỨNG SAU KHI CHẠY ───

-- 1) Chạy ngay trong SQL Editor (nơi KHÔNG có danh tính đăng nhập):
--    PHẢI trả về NULL. Ra một id nào đó nghĩa là đang khớp nhầm email rỗng với
--    mọi nhân viên -> chạy lại bản mới nhất của file này.
select public.set_my_voice_sample(null) as phai_la_null;

-- 2) ĐO THẬT: đăng nhập bằng 1 tài khoản NHÂN VIÊN THƯỜNG, mở Console trình duyệt:
--       await supabase.rpc('set_my_voice_sample', { p_path: 'voice_samples/SAI.webm' })
--    -> PHẢI ra null (đường dẫn không mang id của họ).
--
--    Đồng thời kiểm tra khoá hồ sơ nhân sự KHÔNG hở:
--       await supabase.from('employees').update({ role: 'Giám đốc' }).eq('id', '<id của chính họ>').select('id')
--    -> PHẢI ra mảng rỗng.
