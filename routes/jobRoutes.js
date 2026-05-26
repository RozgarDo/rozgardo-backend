const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');




// Helper: enrich jobs with employer name from employers_users or fallback
async function enrichJobsWithEmployerName(jobs) {
    const employerIds = [...new Set(jobs.map(j => j.employer_id).filter(Boolean))];
    if (employerIds.length === 0) return jobs.map(j => ({ ...j, employer_name: 'Unknown' }));

    // 1. Try new employers_users table
    const { data: newEmployers } = await supabase
        .from('employers_users')
        .select('id, company_name')
        .in('id', employerIds);

    const employerMap = {};
    (newEmployers || []).forEach(e => { employerMap[e.id] = e.company_name; });

    // 2. Fallback to old employer_profiles for remaining IDs
    const remainingIds = employerIds.filter(id => !employerMap[id]);
    if (remainingIds.length > 0) {
        const { data: profiles } = await supabase
            .from('employer_profiles')
            .select('user_id, company_name')
            .in('user_id', remainingIds);
        (profiles || []).forEach(p => { employerMap[p.user_id] = p.company_name; });
    }

    // 3. Final fallback to legacy users table
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


// Get jobs (supports query params: status, employer_id, is_active, category, location, limit)
// router.get('/', async (req, res) => {
//     const { status, employer_id, is_active, category, location, limit } = req.query;
//     let query = supabase.from('jobs').select('*').order('created_at', { ascending: false });
    
//     if (status) query = query.eq('status', status);
//     if (employer_id) query = query.eq('employer_id', employer_id);
//     if (category) query = query.eq('category', category);
//     if (location) query = query.eq('location', location);
//     if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
//     if (limit) query = query.limit(parseInt(limit));
    
//     try {
//         const { data, error } = await query;
//         if (error) return res.status(400).json({ error: error.message });
//         const enriched = await enrichJobsWithEmployerName(data);
//         res.json(enriched);
//     } catch (err) {
//         res.status(500).json({ error: err.message });
//     }
// });


router.get('/', async (req, res) => {
    const { status, employer_id, is_active, category, location, limit } = req.query;
    
    try {
        // 1. First, get all active employer IDs
        const { data: activeEmployers, error: employerError } = await supabase
            .from('employers_users')
            .select('id')
            .eq('account_status', 'active');
        
        if (employerError) {
            console.error('Error fetching active employers:', employerError);
            return res.status(500).json({ error: 'Failed to fetch active employers' });
        }
        
        const activeEmployerIds = (activeEmployers || []).map(e => e.id);
        
        // If no active employers, return empty array quickly
        if (activeEmployerIds.length === 0) {
            return res.json([]);
        }
        
        // 2. Query jobs with employer_id in active list
        let query = supabase.from('jobs').select('*').order('created_at', { ascending: false });
        
        if (status) query = query.eq('status', status);
        if (employer_id) query = query.eq('employer_id', employer_id);
        if (category) query = query.eq('category', category);
        if (location) query = query.eq('location', location);
        if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
        if (limit) query = query.limit(parseInt(limit));
        
        // Filter by active employer IDs
        if (activeEmployerIds.length > 0) {
            query = query.in('employer_id', activeEmployerIds);
        } else {
            // Should not reach here because we already checked empty, but just in case:
            return res.json([]);
        }
        
        const { data, error } = await query;
        if (error) return res.status(400).json({ error: error.message });
        
        const enriched = await enrichJobsWithEmployerName(data);
        res.json(enriched);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});




// MODIFIED POST ROUTE: added required_experience, education, technical_skills, and vacancies
router.post('/', async (req, res) => {
    // Destructure existing + new fields
    const { 
        title, category, salary, location, description, employer_id, job_type,
        required_experience, education, technical_skills, vacancies
    } = req.body;
    
    if (!title || !employer_id) {
        return res.status(400).json({ error: 'Title and employer_id are required' });
    }
    try {
        // Properly handle vacancies: convert empty string, null, undefined, or NaN to 1
        let vacanciesValue = 1;
        if (vacancies !== undefined && vacancies !== null && vacancies !== '') {
            const parsed = parseInt(vacancies);
            vacanciesValue = isNaN(parsed) ? 1 : parsed;
        }

        const { data, error } = await supabase
            .from('jobs')
            .insert([{ 
                title, 
                category, 
                salary, 
                location, 
                description: description || 'No description provided.', 
                employer_id,
                job_type: job_type || 'Full-time',   // <-- job_type is accepted
                status: 'pending',
                is_active: true,
                required_experience: required_experience || null,
                education: education || null,
                technical_skills: technical_skills || null,
                vacancies: vacanciesValue
            }])
            .select()
            .single();

        if (error) {
            console.error("Supabase insert error details:", error);
            return res.status(400).json({ error: error.message, details: error.details, code: error.code });
        }
        res.status(201).json({ message: 'Job posted successfully', job: data });
    } catch (err) {
        console.error("Unexpected error:", err);
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

// Get single job details (with employer name from all possible tables)
// router.get('/:id', async (req, res) => {
//     try {
//         const { data, error } = await supabase
//             .from('jobs')
//             .select('*')
//             .eq('id', req.params.id)
//             .single();
//         if (error) return res.status(400).json({ error: error.message });
        
//         // Get employer name - try in order: employers_users -> employer_profiles -> users
//         if (data.employer_id) {
//             let employerName = null;
            
//             // 1. Try new employers_users table (used by your auth)
//             const { data: employerFromNew } = await supabase
//                 .from('employers_users')
//                 .select('company_name')
//                 .eq('id', data.employer_id)
//                 .single();
//             if (employerFromNew?.company_name) {
//                 employerName = employerFromNew.company_name;
//             } else {
//                 // 2. Fallback to old employer_profiles
//                 const { data: profile } = await supabase
//                     .from('employer_profiles')
//                     .select('company_name')
//                     .eq('user_id', data.employer_id)
//                     .single();
//                 if (profile?.company_name) {
//                     employerName = profile.company_name;
//                 } else {
//                     // 3. Final fallback to legacy users table
//                     const { data: user } = await supabase
//                         .from('users')
//                         .select('name')
//                         .eq('id', data.employer_id)
//                         .single();
//                     employerName = user?.name || 'Unknown Employer';
//                 }
//             }
//             data.employer_name = employerName;
//         }
        
//         res.json(data);
//     } catch (err) {
//         res.status(500).json({ error: err.message });
//     }
// });

router.get('/:id', async (req, res) => {
    try {
        const { data: job, error } = await supabase
            .from('jobs')
            .select('*')
            .eq('id', req.params.id)
            .single();
        if (error) return res.status(400).json({ error: error.message });
        
        // Check if employer exists and is active
        const { data: employer, error: empError } = await supabase
            .from('employers_users')
            .select('account_status')
            .eq('id', job.employer_id)
            .single();
        
        if (empError || !employer || employer.account_status !== 'active') {
            return res.status(404).json({ error: 'Job not found or employer is inactive' });
        }
        
        // Get employer name for display
        if (job.employer_id) {
            let employerName = null;
            const { data: employerFromNew } = await supabase
                .from('employers_users')
                .select('company_name')
                .eq('id', job.employer_id)
                .single();
            if (employerFromNew?.company_name) {
                employerName = employerFromNew.company_name;
            } else {
                const { data: profile } = await supabase
                    .from('employer_profiles')
                    .select('company_name')
                    .eq('user_id', job.employer_id)
                    .single();
                if (profile?.company_name) {
                    employerName = profile.company_name;
                } else {
                    const { data: user } = await supabase
                        .from('users')
                        .select('name')
                        .eq('id', job.employer_id)
                        .single();
                    employerName = user?.name || 'Unknown Employer';
                }
            }
            job.employer_name = employerName;
        }
        
        res.json(job);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;