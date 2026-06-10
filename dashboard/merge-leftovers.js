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
  console.log('Merging leftover duplicate profiles...');

  // 1. Merge Lại Nguyễn Lan Phương
  console.log('Updating Lại Nguyễn Lan Phương email...');
  const { error: updateL } = await supabase
    .from('employees')
    .update({ email: 'phuonglnl@trungnamgroup.com.vn, lanphuonghcns1611@gmail.com' })
    .eq('id', 'bc97c517-37ae-457c-8381-e899af6193f9');
  
  if (updateL) throw updateL;

  console.log('Deleting duplicate Lại Nguyễn Lan Phương...');
  const { error: deleteL } = await supabase
    .from('employees')
    .delete()
    .eq('id', '0cdede41-5dea-45bf-9786-5bf45859ce03');

  if (deleteL) throw deleteL;

  // 2. Delete duplicate Nguyễn Trương Thùy Quyên
  console.log('Deleting duplicate Nguyễn Trương Thùy Quyên...');
  const { error: deleteQ } = await supabase
    .from('employees')
    .delete()
    .eq('id', '1fae144e-4936-442b-a07c-f01ce5be43f9');

  if (deleteQ) throw deleteQ;

  console.log('Success! Leftovers merged successfully.');
}

main().catch(console.error);
