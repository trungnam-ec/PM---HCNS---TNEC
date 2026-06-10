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
  
  console.log(`Found ${data.length} records.`);
  if (data.length > 1) {
    const idsToDelete = data.slice(1).map(r => r.id);
    console.log("Deleting duplicate IDs:", idsToDelete);
    const { error: delErr } = await supabase
      .from('tasks')
      .delete()
      .in('id', idsToDelete);
    
    if (delErr) {
      console.error("Delete error:", delErr);
    } else {
      console.log("Successfully cleaned up duplicates.");
    }
  } else {
    console.log("No duplicates to delete.");
  }
}

main();
