const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const supabase = require('./supabaseClient');

const authRoutes = require('./routes/authRoutes');
const jobRoutes = require('./routes/jobRoutes');
const applicationRoutes = require('./routes/applicationRoutes');
const onboardingRoutes = require('./routes/onboardingRoutes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ========== JWT Authentication Middleware ==========
app.use(async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            // Try admin_users first
            const { data: admin, error: adminErr } = await supabase
                .from('admin_users')
                .select('id, role')
                .eq('id', decoded.id)
                .single();
            if (admin && !adminErr) {
                req.user = { id: admin.id, role: admin.role };
                console.log(`🔐 Admin: ${admin.id} (${admin.role})`);
            } else {
                // Try regular users
                const { data: user, error: userErr } = await supabase
                    .from('users')
                    .select('id, role')
                    .eq('id', decoded.id)
                    .single();
                if (user && !userErr) {
                    req.user = { id: user.id, role: user.role || 'employee' };
                    console.log(`🔐 User: ${user.id} (${user.role})`);
                }
            }
        } catch (err) {
            console.warn('JWT verify failed:', err.message);
        }
    }
    next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/onboarding', onboardingRoutes);

app.get('/warmup', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));