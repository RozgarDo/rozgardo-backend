const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const verifyAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Decode token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🔐 Fetch current token_version from database
    const { data: admin, error } = await supabaseAdmin
      .from('admin_users')
      .select('token_version')
      .eq('id', decoded.id)
      .single();

    if (error || !admin) {
      return res.status(401).json({ error: 'Admin not found' });
    }

    // Compare token version
    if (decoded.token_version !== admin.token_version) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    console.error('Token verification error:', err);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = verifyAdmin;