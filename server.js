const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

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
// JWT Middleware – logs everything
// =================================================================
app.use(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  //console.log('[Middleware] Authorization header:', authHeader ? 'present' : 'missing');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      //console.log('[Middleware] Decoded token:', decoded);

      // 1️⃣ Admin
      const { data: admin, error: adminErr } = await supabaseAdmin
        .from('admin_users')
        .select('id, role, token_version')
        .eq('id', decoded.id)
        .single();

      if (admin && !adminErr) {
        const tokenVersion = decoded.token_version || 0;
        if (tokenVersion !== admin.token_version) {
          //console.warn('[Middleware] Admin token version mismatch');
          return res.status(401).json({ error: 'Session expired. Please log in again.' });
        }
        req.user = { id: admin.id, role: admin.role };
        //console.log('[Middleware] Admin authenticated:', req.user);
        return next();
      }

      // 2️⃣ Employee
      const { data: employee, error: empErr } = await supabaseAdmin
        .from('employees_users')
        .select('id')
        .eq('id', decoded.id)
        .single();

      if (employee && !empErr) {
        req.user = { id: employee.id, role: 'employee' };
        //console.log('[Middleware] Employee authenticated:', req.user);
        return next();
      }

      // 3️⃣ Employer
      const { data: employer, error: empEmployerErr } = await supabaseAdmin
        .from('employers_users')
        .select('id')
        .eq('id', decoded.id)
        .single();

      if (employer && !empEmployerErr) {
        req.user = { id: employer.id, role: 'employer' };
        //console.log('[Middleware] Employer authenticated:', req.user);
        return next();
      }

      console.warn('[Middleware] User not found in any table for id:', decoded.id);
    } catch (err) {
      //console.warn('[Middleware] JWT verification error:', err.message);
    }
  }
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/onboarding', onboardingRoutes);

app.get('/warmup', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));