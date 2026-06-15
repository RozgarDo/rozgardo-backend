const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Helper: enrich with employer name
async function enrichJobsWithEmployerName(jobs) {
    const employerIds = [...new Set(jobs.map(j => j.employer_id).filter(Boolean))];
    if (employerIds.length === 0) return jobs.map(j => ({ ...j, employer_name: 'Unknown' }));
    const { data: newEmployers } = await supabase
        .from('employers_users')
        .select('id, company_name')
        .in('id', employerIds);
    const employerMap = {};
    (newEmployers || []).forEach(e => { employerMap[e.id] = e.company_name; });
    const remainingIds = employerIds.filter(id => !employerMap[id]);
    if (remainingIds.length > 0) {
        const { data: profiles } = await supabase
            .from('employer_profiles')
            .select('user_id, company_name')
            .in('user_id', remainingIds);
        (profiles || []).forEach(p => { employerMap[p.user_id] = p.company_name; });
    }
    const stillMissing = employerIds.filter(id => !employerMap[id]);
    if (stillMissing.length > 0) {
        const { data: fallbackUsers } = await supabase.from('users').select('id, name').in('id', stillMissing);
        (fallbackUsers || []).forEach(u => { employerMap[u.id] = u.name; });
    }
    return jobs.map(job => ({
        ...job,
        employer_name: employerMap[job.employer_id] || 'Unknown Employer'
    }));
}

// Admin middleware
const requireAdmin = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
};

// GET /api/jobs
router.get('/', async (req, res) => {
    const { status, employer_id, category, location, limit, include_expired } = req.query;
    const isAdmin = req.user?.role === 'admin';
    let query = supabase.from('jobs').select('*').order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    if (employer_id) query = query.eq('employer_id', employer_id);
    if (category) query = query.eq('category', category);
    if (location) query = query.eq('location', location);
    if (limit) query = query.limit(parseInt(limit));
    if (!isAdmin) {
        const { data: active } = await supabase.from('employers_users').select('id').eq('account_status', 'active');
        const activeIds = (active || []).map(e => e.id);
        if (activeIds.length === 0) return res.json([]);
        query = query.in('employer_id', activeIds);
        if (include_expired !== 'true') {
            const today = new Date().toISOString().split('T')[0];
            query = query.eq('is_active', true);
            query = query.or(`apply_deadline.is.null,apply_deadline.gte.${today}`);
        }
    }
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    const enriched = await enrichJobsWithEmployerName(data);
    res.json(enriched);
});

// POST /api/jobs (with serial number)
router.post('/', async (req, res) => {
    const { title, category, salary, location, description, employer_id, job_type,
            required_experience, education, technical_skills, vacancies, apply_deadline } = req.body;
    if (!title || !employer_id) return res.status(400).json({ error: 'Title and employer_id required' });
    try {
        let serial = null;
        try {
            const { data } = await supabase.rpc('generate_next_job_serial');
            serial = data;
        } catch(e) { serial = `TMP-${Date.now()}`; }
        
        let vacanciesValue = vacancies ? parseInt(vacancies) : 1;
        if (isNaN(vacanciesValue)) vacanciesValue = 1;
        
        let deadline = null;
        if (apply_deadline) {
            const d = new Date(apply_deadline);
            if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid deadline' });
            deadline = d.toISOString().split('T')[0];
        }
        
        const { data, error } = await supabase
            .from('jobs')
            .insert([{
                title, category, salary, location, description: description || '',
                employer_id, job_type: job_type || 'Full-time',
                status: 'pending', is_active: true,
                required_experience, education, technical_skills,
                vacancies: vacanciesValue, apply_deadline: deadline,
                jobs_serial_number: serial
            }])
            .select()
            .single();
        if (error) throw error;
        res.status(201).json({ message: 'Job posted', job: data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// PATCH /:id/status (admin only)
router.patch('/:id/status', requireAdmin, async (req, res) => {
    const { status, is_active } = req.body;
    const jobId = req.params.id;
    try {
        const updates = {};
        if (status !== undefined) updates.status = status;
        if (is_active !== undefined) updates.is_active = is_active;
        const { data, error } = await supabase
            .from('jobs')
            .update(updates)
            .eq('id', jobId)
            .select()
            .single();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Job not found' });
        res.json({ message: 'Job updated', job: data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// PATCH /:id/manage (employer only)
router.patch('/:id/manage', async (req, res) => {
    const { is_active, apply_deadline, employer_id } = req.body;
    const userId = req.user?.id || employer_id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const { data: job } = await supabase.from('jobs').select('employer_id').eq('id', req.params.id).single();
        if (!job) return res.status(404).json({ error: 'Not found' });
        if (job.employer_id !== userId) return res.status(403).json({ error: 'Not your job' });
        const updates = {};
        if (is_active !== undefined) updates.is_active = is_active === true;
        if (apply_deadline !== undefined) {
            updates.apply_deadline = (apply_deadline === null || apply_deadline === '') ? null : new Date(apply_deadline).toISOString().split('T')[0];
        }
        const { data, error } = await supabase
            .from('jobs')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();
        if (error) throw error;
        res.json({ message: 'Job updated', job: data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// GET /:id
router.get('/:id', async (req, res) => {
    try {
        const { data: job, error } = await supabase.from('jobs').select('*').eq('id', req.params.id).single();
        if (error || !job) return res.status(404).json({ error: 'Not found' });
        const isAdmin = req.user?.role === 'admin';
        const isOwner = req.user?.id === job.employer_id;
        if (!isAdmin && !isOwner) {
            const { data: emp } = await supabase.from('employers_users').select('account_status').eq('id', job.employer_id).single();
            if (!emp || emp.account_status !== 'active') return res.status(404).json({ error: 'Inactive employer' });
            const today = new Date().toISOString().split('T')[0];
            if (!job.is_active || (job.apply_deadline && job.apply_deadline < today))
                return res.status(404).json({ error: 'Job unavailable' });
        }
        const { data: emp } = await supabase.from('employers_users').select('company_name').eq('id', job.employer_id).single();
        job.employer_name = emp?.company_name || 'Unknown';
        res.json(job);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;