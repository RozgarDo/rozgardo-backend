const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Helper: enrich jobs with employer name from employer_profiles table
async function enrichJobsWithEmployerName(jobs) {
    const employerIds = [...new Set(jobs.map(j => j.employer_id).filter(Boolean))];
    if (employerIds.length === 0) return jobs.map(j => ({ ...j, employer_name: 'Unknown' }));

    const { data: profiles } = await supabase
        .from('employer_profiles')
        .select('user_id, company_name')
        .in('user_id', employerIds);

    const employerMap = {};
    (profiles || []).forEach(p => { employerMap[p.user_id] = p.company_name; });

    // Fallback to fetch from users table if profile not properly linked
    const missingIds = employerIds.filter(id => !employerMap[id]);
    if (missingIds.length > 0) {
        const { data: fallbackUsers } = await supabase.from('users').select('id, name').in('id', missingIds);
        (fallbackUsers || []).forEach(u => { employerMap[u.id] = u.name; });
    }

    return jobs.map(job => ({
        ...job,
        employer_name: employerMap[job.employer_id] || 'Unknown Employer'
    }));
}

// Get jobs (supports query params: status, employer_id, is_active, category, location, limit)
router.get('/', async (req, res) => {
    const { status, employer_id, is_active, category, location, limit } = req.query;
    let query = supabase.from('jobs').select('*').order('created_at', { ascending: false });
    
    if (status) query = query.eq('status', status);
    if (employer_id) query = query.eq('employer_id', employer_id);
    if (category) query = query.eq('category', category);
    if (location) query = query.eq('location', location);
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
    if (limit) query = query.limit(parseInt(limit));
    
    try {
        const { data, error } = await query;
        if (error) return res.status(400).json({ error: error.message });
        const enriched = await enrichJobsWithEmployerName(data);
        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single job details (with employer name)
router.get('/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('jobs')
            .select('*')
            .eq('id', req.params.id)
            .single();
        if (error) return res.status(400).json({ error: error.message });
        
        // Get employer name
        if (data.employer_id) {
            const { data: profile } = await supabase
                .from('employer_profiles')
                .select('company_name')
                .eq('user_id', data.employer_id)
                .single();
            if (profile?.company_name) {
                data.employer_name = profile.company_name;
            } else {
                const { data: user } = await supabase.from('users').select('name').eq('id', data.employer_id).single();
                data.employer_name = user?.name || 'Unknown Employer';
            }
        }
        
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Post a new job (Defaults to pending status)
router.post('/', async (req, res) => {
    const { title, category, salary, location, description, employer_id, job_type } = req.body;
    try {
        const { data, error } = await supabase
            .from('jobs')
            .insert([{ 
                title, 
                category, 
                salary, 
                location, 
                description: description || 'No description provided.', 
                employer_id, 
                job_type: job_type || 'Full-time',
                status: 'pending',
                is_active: true
            }])
            .select()
            .single();

        if (error) return res.status(400).json({ error: error.message });
        res.status(201).json({ message: 'Job posted successfully', job: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update job status (Admin functionality)
router.patch('/:id/status', async (req, res) => {
    const { status, is_active } = req.body; 
    try {
        const updates = {};
        if (status) updates.status = status;
        if (is_active !== undefined) updates.is_active = is_active;
        
        const { data, error } = await supabase
            .from('jobs')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();
            
        if (error) return res.status(400).json({ error: error.message });
        res.json({ message: `Job updated`, job: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
