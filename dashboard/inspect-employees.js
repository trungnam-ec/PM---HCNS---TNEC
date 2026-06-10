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
  console.log('Querying duplicate employees...');
  const { data, error } = await supabase
    .from('employees')
    .select('id, name, employee_code, email, department, role')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error:', error);
  } else {
    const counts = {};
    data.forEach(e => {
      counts[e.name] = (counts[e.name] || 0) + 1;
    });
    const duplicates = data.filter(e => counts[e.name] > 1);
    console.log('Duplicate records:', JSON.stringify(duplicates, null, 2));
  }
}

main().catch(console.error);
