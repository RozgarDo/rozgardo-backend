const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Apply for a job
router.post('/', async (req, res) => {
    let { job_id, employee_id } = req.body;
    console.log(`Apply request received - Job: ${job_id}, User: ${employee_id}`);
    
    try {
        // 0. ID Resolution Safety Net: Ensure employee_id is a valid User UUID
        const { data: userCheck } = await supabase.from('users').select('id').eq('id', employee_id).maybeSingle();
        
        if (!userCheck) {
            console.log(`ID ${employee_id} not found in 'users', checking 'applicant_profiles'...`);
            const { data: profileCheck } = await supabase.from('applicant_profiles').select('user_id').eq('id', employee_id).maybeSingle();
            if (profileCheck) {
                console.log(`Resolved Profile ID ${employee_id} to User ID ${profileCheck.user_id}`);
                employee_id = profileCheck.user_id;
            } else {
                return res.status(404).json({ error: 'Valid user account not found. Please log out and log back in.' });
            }
        }

        // 1. Check if job exists and is approved
        const { data: job, error: jobErr } = await supabase
            .from('jobs')
            .select('status, is_active')
            .eq('id', job_id)
            .single();

        if (jobErr || !job) return res.status(404).json({ error: 'Job not found.' });
        if (job.status !== 'approved' || job.is_active === false) {
            return res.status(400).json({ error: 'This job is no longer accepting applications.' });
        }

        // 2. Check if already applied
        const { data: existing } = await supabase
            .from('applications')
            .select('id')
            .eq('job_id', job_id)
            .eq('employee_id', employee_id)
            .maybeSingle();

        if (existing) {
            return res.status(400).json({ error: 'You have already applied for this job.' });
        }

        // 3. Insert application
        const { data, error } = await supabase
            .from('applications')
            .insert([{ 
                job_id, 
                employee_id,
                status: 'applied', 
                applied_at: new Date().toISOString() 
            }])
            .select()
            .single();

        if (error) {
            console.error('Insert Application Error:', error);
            return res.status(400).json({ error: error.message });
        }
        
        res.status(201).json({ message: 'Applied successfully', application: data });
    } catch (err) {
        console.error('Server Catch Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Employee View: Get applications for a specific employee
router.get('/employee/:id', async (req, res) => {
    try {
        // We try a simple select first, then manually enrich to avoid join failures if FKs are missing
        const { data: apps, error } = await supabase
            .from('applications')
            .select('*')
            .eq('employee_id', req.params.id)
            .order('applied_at', { ascending: false });

        console.log(`Fetching apps for employee_id: ${req.params.id}. Found: ${apps?.length || 0}`);

        if (error) {
            console.error('Supabase application fetch error:', error);
            return res.status(400).json({ error: error.message });
        }
        if (!apps || apps.length === 0) return res.json([]);

        // Manually fetch job and employer details for each application
        const enriched = await Promise.all(apps.map(async (app) => {
            const { data: job } = await supabase
                .from('jobs')
                .select('title, salary, location, job_type, employer_id, description, category')
                .eq('id', app.job_id)
                .single();

            let employerName = 'Unknown Employer';
            if (job?.employer_id) {
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

            return {
                ...app,
                jobs: {
                    ...(job || {}),
                    employer_name: employerName
                }
            };
        }));

        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Employer View: Get applications for a specific job
router.get('/job/:id', async (req, res) => {
    try {
        const { data: apps, error } = await supabase
            .from('applications')
            .select('*')
            .eq('job_id', req.params.id)
            .order('applied_at', { ascending: false });

        if (error) return res.status(400).json({ error: error.message });

        // Enrich with applicant details from users + applicant_profiles
        const enriched = await Promise.all(apps.map(async (app) => {
            const { data: userData, error: userErr } = await supabase
                .from('users')
                .select(`
                    name, 
                    phone, 
                    email,
                    applicant_profiles (*)
                `)
                .eq('id', app.employee_id)
                .single();

            if (userErr || !userData) return { ...app, users: { name: 'Unknown' } };

            const profile = userData.applicant_profiles?.[0] || userData.applicant_profiles || {};
            delete userData.applicant_profiles;

            return { 
                ...app, 
                users: { ...userData, ...profile } 
            };
        }));

        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Employer Action: Update application status
router.patch('/:id/status', async (req, res) => {
    const { status } = req.body;
    try {
        const { data, error } = await supabase
            .from('applications')
            .update({ status })
            .eq('id', req.params.id)
            .select()
            .single();
            
        if (error) return res.status(400).json({ error: error.message });
        res.json({ message: `Application ${status}`, application: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
