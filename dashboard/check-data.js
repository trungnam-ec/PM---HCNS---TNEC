const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl && fs.existsSync('.env.local')) {
  const env = fs.readFileSync('.env.local', 'utf8');
  const matchUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]*)/);
  if (matchUrl) supabaseUrl = matchUrl[1].trim().replace(/['"]/g, '');
  const matchKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]*)/);
  if (matchKey) supabaseAnonKey = matchKey[1].trim().replace(/['"]/g, '');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log('=== KIỂM TRA DỮ LIỆU SUPABASE ===\n');

  // 1. Check invoices table
  console.log('--- BẢNG INVOICES (Hồ sơ thanh toán) ---');
  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('id, number, date, description, amount, beneficiary_name')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (invErr) {
    console.error('Lỗi query invoices:', invErr.message);
  } else {
    console.log(`Tổng số hóa đơn (10 mới nhất): ${invoices.length}`);
    invoices.forEach((inv, i) => {
      console.log(`  [${i+1}] Số: ${inv.number} | Ngày: ${inv.date} | Nhận: ${inv.beneficiary_name} | Số tiền: ${Number(inv.amount).toLocaleString('vi-VN')} đ | Mô tả: ${(inv.description||'').substring(0,50)}`);
    });
  }

  // 2. Check for HD-DK- (recurring payments)
  console.log('\n--- BẢNG INVOICES - Thanh toán định kỳ (HD-DK-) ---');
  const { data: recurring, error: recErr } = await supabase
    .from('invoices')
    .select('id, number, date, description, amount, beneficiary_name')
    .ilike('number', 'HD-DK-%')
    .order('created_at', { ascending: false });
  
  if (recErr) {
    console.error('Lỗi query recurring:', recErr.message);
  } else {
    console.log(`Tổng số thanh toán định kỳ: ${recurring.length}`);
    recurring.forEach((inv, i) => {
      console.log(`  [${i+1}] Số: ${inv.number} | Ngày: ${inv.date} | Nhận: ${inv.beneficiary_name} | Số tiền: ${Number(inv.amount).toLocaleString('vi-VN')} đ | Mô tả: ${(inv.description||'').substring(0,60)}`);
    });
  }

  // 3. Check admin_monthly_reports
  console.log('\n--- BẢNG ADMIN_MONTHLY_REPORTS (Báo cáo tháng) ---');
  const { data: reports, error: repErr } = await supabase
    .from('admin_monthly_reports')
    .select('*')
    .order('created_at', { ascending: true });
  
  if (repErr) {
    console.error('Lỗi query reports:', repErr.message);
  } else {
    console.log(`Tổng số hàng báo cáo: ${reports.length}`);
    // Check how many have non-zero values
    const nonZero = reports.filter(r => 
      [r.m1,r.m2,r.m3,r.m4,r.m5,r.m6,r.m7,r.m8,r.m9,r.m10,r.m11,r.m12]
        .some(v => Number(v) > 0)
    );
    console.log(`Số hàng có giá trị khác 0: ${nonZero.length}`);
    if (nonZero.length > 0) {
      console.log('Các hàng có giá trị:');
      nonZero.forEach(r => {
        const months = [r.m1,r.m2,r.m3,r.m4,r.m5,r.m6,r.m7,r.m8,r.m9,r.m10,r.m11,r.m12]
          .map((v,i) => v > 0 ? `T${i+1}:${Number(v).toLocaleString('vi-VN')}` : null)
          .filter(Boolean).join(', ');
        console.log(`  STT ${r.stt} - ${r.content}: ${months}`);
      });
    }
  }

  // 4. Count totals
  const { count: totalInvoices } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true });
  console.log(`\n=== TỔNG KẾT ===`);
  console.log(`Tổng hóa đơn trong Supabase: ${totalInvoices}`);
}

main().catch(console.error);
