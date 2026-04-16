const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Login endpoint supporting both Password and Mock-OTP flows
router.post('/login', async (req, res) => {
    const { loginId, password, otp, type } = req.body;
    
    try {
        // Find user by either phone or email, joining profile tables
        let query = supabase.from('users').select(`
            *,
            applicant_profiles(*),
            employer_profiles(*)
        `);

        if (loginId.includes('@')) {
            query = query.eq('email', loginId);
        } else {
            query = query.eq('phone', loginId);
        }

        const { data: userData, error } = await query.single();
        
        if (error || !userData) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (type === 'password') {
            if (userData.password && userData.password !== password) {
                return res.status(401).json({ message: 'Incorrect password' });
            }
        } else if (type === 'otp') {
            if (otp !== '123456') {
                 return res.status(401).json({ message: 'Invalid OTP entered' });
            }
        }

        // Flatten the response so the frontend gets a clean user object
        const profileData = userData.role === 'employee' 
            ? (Array.isArray(userData.applicant_profiles) ? userData.applicant_profiles[0] : userData.applicant_profiles || {}) 
            : (Array.isArray(userData.employer_profiles) ? userData.employer_profiles[0] : userData.employer_profiles || {});
            
        // Remove nested objects to keep it clean
        delete userData.applicant_profiles;
        delete userData.employer_profiles;

        // Profile data first, then basic user data (so ID from users table wins)
        const flattenedUser = { ...profileData, ...userData, id: userData.id }; 
        console.log(`User logged in: ${flattenedUser.name} (UUID: ${flattenedUser.id})`);

        res.json({ message: 'Login successful', user: flattenedUser });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mock sending OTP
router.post('/send-otp', async (req, res) => {
    const { phone } = req.body;
    try {
        const { data, error } = await supabase.from('users').select('*').eq('phone', phone).single();
        if (error) return res.status(404).json({ message: 'User not found. Please register first.' });
        res.json({ message: 'OTP Sent successfully (Use 123456 for testing)' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// Register: creates a new user and matching profile
router.post('/register', async (req, res) => {
    const { phone, email, password, role, name, skills, location, experience, salary } = req.body;
    try {
        // 1. Insert into users table
        const userPayload = { phone, role, name };
        if (email) userPayload.email = email;
        if (password) userPayload.password = password;

        const { data: newUser, error: userError } = await supabase
            .from('users')
            .insert([userPayload])
            .select()
            .single();

        if (userError) return res.status(400).json({ error: userError.message });

        // 2. Insert into appropriate profile table
        let profileData = {};
        if (role === 'employee') {
            const parsedSkills = skills ? skills.split(',').map(s => s.trim()) : [];
            const { data: newProfile, error: profileError } = await supabase
                .from('applicant_profiles')
                .insert([{ 
                    user_id: newUser.id, 
                    location, 
                    skills: parsedSkills,
                    expected_salary: salary,
                    experience: experience ? JSON.parse(experience) : []
                }])
                .select().single();
            if (!profileError) profileData = newProfile;
        } else if (role === 'employer') {
            const { data: newProfile, error: profileError } = await supabase
                .from('employer_profiles')
                .insert([{ user_id: newUser.id, location, company_name: name }])
                .select().single();
            if (!profileError) profileData = newProfile;
        }

        const flattenedUser = { ...newUser, ...profileData, id: newUser.id };
        res.status(201).json({ message: 'User created successfully', user: flattenedUser });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update profile details - Splits updates between tables
router.put('/profile/:id', async (req, res) => {
    const { id } = req.params;
    const body = req.body;
    
    // Determine which fields belong to users table
    const userFields = {};
    if (body.name !== undefined) userFields.name = body.name;
    if (body.email !== undefined) userFields.email = body.email;
    if (body.phone !== undefined) userFields.phone = body.phone;
    
    // First figure out the user's role to know which profile table to update
    try {
        const { data: currentUser, error: userErr } = await supabase
            .from('users').select('role').eq('id', id).single();
            
        if (userErr) return res.status(404).json({ error: 'User not found' });
        
        let updatedUser = {};
        
        // 1. Update users table if needed
        if (Object.keys(userFields).length > 0) {
            const { data: uData, error: uErr } = await supabase
                .from('users').update(userFields).eq('id', id).select().single();
            if (uErr) return res.status(400).json({ error: uErr.message });
            updatedUser = { ...updatedUser, ...uData };
        } else {
            const { data: uData } = await supabase.from('users').select('*').eq('id', id).single();
            updatedUser = { ...updatedUser, ...uData };
        }
        
        // 2. Update profile table
        let updatedProfile = {};
        if (currentUser.role === 'employee') {
            const profileFields = {};
            if (body.location !== undefined) profileFields.location = body.location;
            if (body.bio !== undefined) profileFields.bio = body.bio;
            if (body.skills !== undefined) {
                // frontend might send as string or array
                profileFields.skills = typeof body.skills === 'string' ? body.skills.split(',').map(s=>s.trim()) : body.skills;
            }
            if (body.experience !== undefined) profileFields.experience = body.experience;
            if (body.job_type !== undefined) profileFields.job_type = body.job_type;
            if (body.preferred_location !== undefined) profileFields.preferred_location = body.preferred_location;
            if (body.expected_salary !== undefined) profileFields.expected_salary = body.expected_salary;
            if (body.photo_url !== undefined) profileFields.photo_url = body.photo_url;
            
            if (Object.keys(profileFields).length > 0) {
                const { data: pData, error: pErr } = await supabase
                    .from('applicant_profiles').update(profileFields).eq('user_id', id).select().single();
                if (pErr && pErr.code !== 'PGRST116') { // Ignore missing row err, just means profile doesn't exist yet
                    // If no profile exists, let's insert one
                    const { data: insData } = await supabase.from('applicant_profiles')
                        .insert([{ user_id: id, ...profileFields }]).select().single();
                    if(insData) updatedProfile = insData;
                } else if(pData) {
                    updatedProfile = pData;
                }
            }
        } else if (currentUser.role === 'employer') {
            const profileFields = {};
            if (body.location !== undefined) profileFields.location = body.location;
            if (body.company_name !== undefined) profileFields.company_name = body.company_name;
            if (body.company_description !== undefined) profileFields.company_description = body.company_description;
            if (body.photo_url !== undefined) profileFields.company_logo = body.photo_url;
            
            if (Object.keys(profileFields).length > 0) {
                const { data: pData, error: pErr } = await supabase
                    .from('employer_profiles').update(profileFields).eq('user_id', id).select().single();
                if (pErr && pErr.code !== 'PGRST116') {
                    const { data: insData } = await supabase.from('employer_profiles')
                        .insert([{ user_id: id, ...profileFields }]).select().single();
                    if(insData) updatedProfile = insData;
                } else if(pData) {
                    updatedProfile = pData;
                }
            }
        }

        const flattenedUser = { ...updatedUser, ...updatedProfile, id: updatedUser.id };
        res.json({ message: 'Profile updated', user: flattenedUser });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch all users for admin management
router.get('/users', async (req, res) => {
    try {
        const { data, error } = await supabase.from('users').select('*');
        if (error) return res.status(400).json({ error: error.message });
        res.json(data);
    } catch (err) {
         res.status(500).json({ error: err.message });
    }
});

module.exports = router;
