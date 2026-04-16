const supabase = require('./supabaseClient');

async function testSupabase() {
    console.log("Testing user insert...");
    const { data, error } = await supabase.from('users').insert([
        { phone: '1000000000', role: 'admin', name: 'Super Admin Test' }
    ]).select();
    
    if (error) {
        console.error("Failed to insert:", error.message);
    } else {
        console.log("Success:", data);
        await supabase.from('users').delete().eq('phone', '1000000000');
    }
}
testSupabase();
