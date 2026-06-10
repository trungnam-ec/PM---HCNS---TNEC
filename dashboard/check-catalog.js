const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

let supabaseUrl = '';
let supabaseAnonKey = '';

try {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    if (line.includes('NEXT_PUBLIC_SUPABASE_URL')) {
      supabaseUrl = line.split('=')[1].trim().replace(/['"]/g, '');
    }
    if (line.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY')) {
      supabaseAnonKey = line.split('=')[1].trim().replace(/['"]/g, '');
    }
  }
} catch (e) {
  console.error("Error reading .env.local file:", e);
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('title', 'VPP_INVENTORY_CATALOG');
  
  if (error) {
    console.error("Error querying tasks:", error);
    return;
  }
  
  console.log(`Found ${data.length} records matching VPP_INVENTORY_CATALOG:`);
  data.forEach((row, i) => {
    console.log(`Record ${i + 1}:`);
    console.log(`- ID: ${row.id}`);
    console.log(`- Title: ${row.title}`);
    console.log(`- Notes: ${row.notes}`);
  });
}

main();
