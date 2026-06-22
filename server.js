const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const supabase = require('./supabaseClient');
const { createClient } = require('@supabase/supabase-js');

// Create admin client with service role (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const authRoutes = require('./routes/authRoutes');
const jobRoutes = require('./routes/jobRoutes');
const applicationRoutes = require('./routes/applicationRoutes');
const onboardingRoutes = require('./routes/onboardingRoutes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// =================================================================
// JWT Authentication Middleware (with admin token_version check)
// =================================================================
app.use(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // ✅ Use supabaseAdmin to fetch admin (bypasses RLS)
      const { data: admin, error } = await supabaseAdmin
        .from('admin_users')
        .select('id, role, token_version')
        .eq('id', decoded.id)
        .single();

      if (admin && !error) {
        const tokenVersion = decoded.token_version || 0;
        // Compare token_version (must match)
        if (tokenVersion !== admin.token_version) {
          return res.status(401).json({ error: 'Session expired. Please log in again.' });
        }
        req.user = { id: admin.id, role: admin.role };
        // console.log(`✅ Admin authenticated: ${admin.id} (version ${admin.token_version})`);
      } else {
        // Fallback: regular users (employees / employers)
        const { data: user, error: userErr } = await supabase
          .from('users')
          .select('id, role')
          .eq('id', decoded.id)
          .single();

        if (user && !userErr) {
          req.user = { id: user.id, role: user.role || 'employee' };
        }
      }
    } catch (err) {
      console.warn('JWT verify failed:', err.message);
    }
  }
  next();
});

// =================================================================
// Routes
// =================================================================
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/onboarding', onboardingRoutes);

// Health check
app.get('/warmup', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));