const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'placeholder_key';

// Use Anon key for backend (Ensure RLS policies allow the operations if using Anon key)
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
