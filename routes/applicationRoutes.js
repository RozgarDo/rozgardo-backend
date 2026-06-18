const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Allowed statuses (must match database constraint)
const ALLOWED_STATUSES = ['applied', 'shortlisted', 'interview', 'selected', 'rejected'];

// Apply for a job
router.post('/', async (req, res) => {
    let { job_id, employee_id } = req.body;
    // console.log(`Apply request received - Job: ${job_id}, Employee: ${employee_id}`);
    
    try {
        const { data: employee, error: empError } = await supabase
            .from('employees_users')
            .select('id, full_name')
            .eq('id', employee_id)
            .maybeSingle();

        if (empError || !employee) {
            return res.status(404).json({ error: 'Valid employee account not found. Please log out and log back in.' });
        }

        const { data: job, error: jobErr } = await supabase
            .from('jobs')
            .select('status, is_active')
            .eq('id', job_id)
            .single();

        if (jobErr || !job) return res.status(404).json({ error: 'Job not found.' });
        if (job.status !== 'approved' || job.is_active === false) {
            return res.status(400).json({ error: 'This job is no longer accepting applications.' });
        }

        const { data: existing } = await supabase
            .from('applications')
            .select('id')
            .eq('job_id', job_id)
            .eq('employee_id', employee_id)
            .maybeSingle();

        if (existing) {
            return res.status(400).json({ error: 'You have already applied for this job.' });
        }

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
        const { data: apps, error } = await supabase
            .from('applications')
            .select('*')
            .eq('employee_id', req.params.id)
            .order('applied_at', { ascending: false });

        if (error) return res.status(400).json({ error: error.message });
        if (!apps || apps.length === 0) return res.json([]);

        const enriched = await Promise.all(apps.map(async (app) => {
            // ✅ INCLUDING jobs_serial_number
            const { data: job } = await supabase
                .from('jobs')
                .select('title, salary, location, job_type, employer_id, description, category, jobs_serial_number')
                .eq('id', app.job_id)
                .single();

            let employerName = 'Unknown Employer';
            if (job?.employer_id) {
                const { data: newEmp } = await supabase
                    .from('employers_users')
                    .select('company_name')
                    .eq('id', job.employer_id)
                    .single();
                if (newEmp?.company_name) {
                    employerName = newEmp.company_name;
                } else {
                    const { data: profile } = await supabase
                        .from('employer_profiles')
                        .select('company_name')
                        .eq('user_id', job.employer_id)
                        .single();
                    employerName = profile?.company_name || 'Unknown Employer';
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

        const enriched = await Promise.all(apps.map(async (app) => {
            const { data: newEmployee, error: newEmpError } = await supabase
                .from('employees_users')
                .select('id, full_name, phone_number, email, current_location, highest_qualification, job_types, preferred_languages')
                .eq('id', app.employee_id)
                .single();

            if (!newEmpError && newEmployee) {
                return {
                    ...app,
                    users: {
                        name: newEmployee.full_name,
                        phone: newEmployee.phone_number,
                        email: newEmployee.email,
                        location: newEmployee.current_location,
                        skills: newEmployee.job_types?.join(',') || '',
                        experience: newEmployee.highest_qualification,
                        ...newEmployee
                    }
                };
            }

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

            if (userErr || !userData) return { ...app, users: { name: 'Unknown Applicant' } };

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

// Employer Action: Update application status and interview_date
router.patch('/:id/status', async (req, res) => {
    const { status, interview_date } = req.body;
    
    if (status && !ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}` });
    }

    try {
        const updateData = { status };
        if (interview_date !== undefined) {
            updateData.interview_date = interview_date || null;
        }

        const { data, error } = await supabase
            .from('applications')
            .update(updateData)
            .eq('id', req.params.id)
            .select()
            .single();
            
        if (error) {
            console.error('Update error:', error);
            return res.status(400).json({ error: error.message });
        }
        res.json({ message: `Application ${status}`, application: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Withdraw an application (employee only)
router.delete('/:id', async (req, res) => {
    const { employee_id } = req.body; // employee_id must be sent in request body
    const applicationId = req.params.id;

    if (!employee_id) {
        return res.status(400).json({ error: 'employee_id is required' });
    }

    try {
        // First verify the application belongs to this employee
        const { data: app, error: findError } = await supabase
            .from('applications')
            .select('id, employee_id')
            .eq('id', applicationId)
            .single();

        if (findError || !app) {
            return res.status(404).json({ error: 'Application not found' });
        }

        if (app.employee_id !== employee_id) {
            return res.status(403).json({ error: 'You can only withdraw your own applications' });
        }

        // Delete the application
        const { error: deleteError } = await supabase
            .from('applications')
            .delete()
            .eq('id', applicationId);

        if (deleteError) {
            console.error('Delete error:', deleteError);
            return res.status(400).json({ error: deleteError.message });
        }

        res.json({ message: 'Application withdrawn successfully' });
    } catch (err) {
        console.error('Server error during withdraw:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;