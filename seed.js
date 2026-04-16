const supabase = require('./supabaseClient');

async function clearOldData() {
    console.log('Clearing old data...');
    await supabase.from('applications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('jobs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('applicant_profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('employer_profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    console.log('Old data cleared.');
}

async function seedData() {
    try {
        console.log('\nStarting seed process...');
        await clearOldData();

        // ─── 1. USERS ────────────────────────────────────────────────────────────
        console.log('\n1. Creating Users...');
        const usersToCreate = [
            { phone: '9999999999', name: 'Admin Master',   role: 'admin',    email: 'admin@rozgardo.com' },
            { phone: '8888888888', name: 'HR Tata Motors', role: 'employer', email: 'hr@tatamotors.com' },
            { phone: '7777777777', name: 'Ramesh Singh',   role: 'employee', email: 'ramesh@gmail.com' },
            { phone: '6666666666', name: 'Suresh Kumar',   role: 'employee', email: 'suresh@gmail.com' },
        ];

        const { data: users, error: userErr } = await supabase.from('users').insert(usersToCreate).select();
        if (userErr) throw userErr;
        console.log(`  ✓ Created ${users.length} users`);

        const adminUser    = users.find(u => u.role === 'admin');
        const employerUser = users.find(u => u.role === 'employer');
        const ramesh       = users.find(u => u.phone === '7777777777');
        const suresh       = users.find(u => u.phone === '6666666666');

        // ─── 2. EMPLOYER PROFILE ─────────────────────────────────────────────────
        console.log('\n2. Creating Employer Profile...');
        const { error: epErr } = await supabase.from('employer_profiles').insert([{
            user_id:             employerUser.id,
            company_name:        'Tata Motors Ltd.',
            company_description: 'One of India\'s largest automobile manufacturers.',
            location:            'Mumbai',
        }]);
        if (epErr) throw epErr;
        console.log('  ✓ Employer profile created');

        // ─── 3. APPLICANT PROFILES ───────────────────────────────────────────────
        console.log('\n3. Creating Applicant Profiles...');
        const applicantProfiles = [
            {
                user_id:           ramesh.id,
                skills:            ['Driving', 'Vehicle Maintenance', 'Navigation'],
                experience:        [{ title: 'Commercial Driver', company: 'DHL Logistics', duration: '3 years' }],
                location:          'Mumbai',
                bio:               'Experienced commercial driver with a clean record.',
                preferred_location: 'Mumbai',
                expected_salary:   '25000',
                job_type:          'Full-time',
            },
            {
                user_id:           suresh.id,
                skills:            ['Security', 'Night Watch', 'CCTV Monitoring'],
                experience:        [{ title: 'Security Guard', company: 'SecureZone Pvt.', duration: '2 years' }],
                location:          'Pune',
                bio:               'Reliable security professional with night-shift experience.',
                preferred_location: 'Pune',
                expected_salary:   '18000',
                job_type:          'Full-time',
            },
        ];

        const { error: apErr } = await supabase.from('applicant_profiles').insert(applicantProfiles);
        if (apErr) throw apErr;
        console.log('  ✓ Applicant profiles created');

        // ─── 4. JOBS ─────────────────────────────────────────────────────────────
        console.log('\n4. Creating Jobs...');
        const jobsToCreate = [
            {
                title:       'Experienced Commercial Driver',
                category:    'Driver',
                salary:      25000,
                location:    'Mumbai',
                description: 'Looking for a verified commercial driver with 5+ years experience. Must have valid commercial licence.',
                job_type:    'Full-time',
                status:      'approved',
                is_active:   true,
                employer_id: employerUser.id,
            },
            {
                title:       'Night Security Guard',
                category:    'Security',
                salary:      18000,
                location:    'Pune',
                description: 'Need a watchful night guard for a private apartment complex. 12-hour night shifts.',
                job_type:    'Full-time',
                status:      'pending',
                is_active:   true,
                employer_id: employerUser.id,
            },
            {
                title:       'House Cook (Veg Only)',
                category:    'Cook',
                salary:      15000,
                location:    'Delhi',
                description: 'Required a cook for a joint family of 6. Must know North Indian and South Indian cuisine.',
                job_type:    'Full-time',
                status:      'approved',
                is_active:   true,
                employer_id: employerUser.id,
            },
            {
                title:       'Office Peon / Helper',
                category:    'Helper',
                salary:      12000,
                location:    'Mumbai',
                description: 'General office helper duties including file management, refreshments, and errands.',
                job_type:    'Part-time',
                status:      'approved',
                is_active:   true,
                employer_id: employerUser.id,
            },
            {
                title:       'Warehouse Loader',
                category:    'Helper',
                salary:      14000,
                location:    'Navi Mumbai',
                description: 'Loading and unloading of goods in a large warehouse. Day shift only.',
                job_type:    'Full-time',
                status:      'approved',
                is_active:   true,
                employer_id: employerUser.id,
            },
        ];

        const { data: jobs, error: jobErr } = await supabase.from('jobs').insert(jobsToCreate).select();
        if (jobErr) throw jobErr;
        console.log(`  ✓ Created ${jobs.length} jobs`);

        // ─── 5. APPLICATIONS ─────────────────────────────────────────────────────
        console.log('\n5. Creating Applications...');
        const approvedJob = jobs.find(j => j.title === 'Experienced Commercial Driver');
        const cookJob     = jobs.find(j => j.category === 'Cook');

        const appsToCreate = [
            { job_id: approvedJob.id, employee_id: ramesh.id,  status: 'shortlisted', applied_at: new Date() },
            { job_id: cookJob.id,     employee_id: suresh.id,  status: 'applied',     applied_at: new Date() },
        ];

        const { error: appErr } = await supabase.from('applications').insert(appsToCreate);
        if (appErr) throw appErr;
        console.log('  ✓ Applications created');

        // ─── DONE ─────────────────────────────────────────────────────────────────
        console.log('\n==================================');
        console.log('Database Seeded Successfully!');
        console.log('\nLogin credentials:');
        console.log('  Admin    → 9999999999  (OTP: 123456)');
        console.log('  Employer → 8888888888  (OTP: 123456)');
        console.log('  Ramesh   → 7777777777  (OTP: 123456)');
        console.log('  Suresh   → 6666666666  (OTP: 123456)');
        console.log('==================================\n');

    } catch (err) {
        console.error('\nERROR SEEDING DATABASE:');
        console.error(err.message || err);
        process.exit(1);
    }
}

seedData();
