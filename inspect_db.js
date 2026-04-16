const supabase = require('./supabaseClient');

async function inspect() {
  try {
    // This query fetches check constraints for the applications table
    const { data, error } = await supabase.rpc('get_check_constraints', { table_name: 'applications' });
    
    if (error) {
      // If RPC doesn't exist, try a direct query if possible (usually not allowed via anon key)
      console.log('RPC failed, trying raw query...');
      const { data: rawData, error: rawError } = await supabase
        .from('applications')
        .select('status')
        .limit(1);
      
      if (rawError) throw rawError;
      console.log('Successfully fetched one row from applications. Status:', rawData[0]?.status);
    } else {
      console.log('Check Constraints:', data);
    }
  } catch (err) {
    console.error('Inspection Error:', err.message);
  }
}

inspect();
