const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]*)/)[1].trim();
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]*)/)[1].trim();
const supabase = createClient(url, key);

async function main() {
  // Use individual inserts to test adding columns
  // Since we can't run DDL with anon key, we'll use the Supabase MCP or direct SQL
  // First let's test what columns exist
  const { data, error } = await supabase.from('employees').select('*').limit(1);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Current columns:', Object.keys(data[0] || {}));
  }
}

main().catch(console.error);
