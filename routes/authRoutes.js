const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { createClient } = require('@supabase/supabase-js');
const supabase = require('../supabaseClient'); // regular (anon) client

// Create admin client using service role key (for auth.admin operations and to bypass RLS)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Helper: Normalize Indian phone numbers to E.164 format (+91xxxxxxxxxx)
function normalizePhone(phone) {
  if (!phone) return phone;
  let cleaned = phone.trim().replace(/^\+?91/, ''); // remove any existing +91 or 91
  cleaned = cleaned.replace(/^0+/, '');            // remove leading zeros
  return `+91${cleaned}`;
}

// ------------------- Existing routes (unchanged, but employee registration is now blocked in /register) -------------------

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

// // Register: creates a new user and matching profile (NOW ONLY FOR EMPLOYERS)
// // If role === 'employee', we block and suggest the new endpoint.
// router.post('/register', async (req, res) => {
//     const { phone, email, password, role, name, skills, location, experience, salary } = req.body;
    
//     // Block employee registrations - they must use /employee-register
//     if (role === 'employee') {
//         return res.status(400).json({ error: 'Employee registrations must use /api/auth/employee-register' });
//     }
    
//     try {
//         // 1. Insert into users table
//         const userPayload = { phone, role, name };
//         if (email) userPayload.email = email;
//         if (password) userPayload.password = password;

//         const { data: newUser, error: userError } = await supabase
//             .from('users')
//             .insert([userPayload])
//             .select()
//             .single();

//         if (userError) return res.status(400).json({ error: userError.message });

//         // 2. Insert into appropriate profile table (only employer now)
//         let profileData = {};
//         if (role === 'employer') {
//             const { data: newProfile, error: profileError } = await supabase
//                 .from('employer_profiles')
//                 .insert([{ user_id: newUser.id, location, company_name: name }])
//                 .select().single();
//             if (!profileError) profileData = newProfile;
//         }

//         const flattenedUser = { ...newUser, ...profileData, id: newUser.id };
//         res.status(201).json({ message: 'User created successfully', user: flattenedUser });
//     } catch (err) {
//         res.status(500).json({ error: err.message });
//     }
// });

// Update profile details - Splits updates between tables
router.put('/profile/:id', async (req, res) => {
    const { id } = req.params;
    const body = req.body;
    
    // Determine which fields belong to users table
    const userFields = {};
    if (body.name !== undefined) userFields.name = body.name;
    if (body.email !== undefined) userFields.email = body.email;
    if (body.phone !== undefined) userFields.phone = body.phone;
    
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
                if (pErr && pErr.code !== 'PGRST116') {
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

// ------------------- NEW: Employee Registration (with bcrypt + Supabase Auth, using supabaseAdmin to bypass RLS) -------------------
router.post('/employee-register', async (req, res) => {
    const {
        fullName,
        phoneNumber,
        email,
        currentLocation,
        highestQualification,
        jobTypes,
        preferredLanguages,
        password
    } = req.body;

    // Basic validation
    if (!fullName || !phoneNumber || !password) {
        return res.status(400).json({ error: 'Missing required fields: fullName, phoneNumber, password' });
    }

    // Format phone number to E.164 (assume India +91)
    let formattedPhone = phoneNumber.trim();
    if (!formattedPhone.startsWith('+')) {
        formattedPhone = formattedPhone.replace(/^0+/, '');
        formattedPhone = `+91${formattedPhone}`;
    }

    try {
        // 1. Check if phone number already exists in employees_users (use admin client to bypass RLS)
        const { data: existingUser, error: checkError } = await supabaseAdmin
            .from('employees_users')
            .select('phone_number')
            .eq('phone_number', formattedPhone)
            .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') {
            console.error('Error checking existing user:', checkError);
            return res.status(500).json({ error: 'Database error during duplicate check' });
        }

        if (existingUser) {
            return res.status(409).json({ error: 'Phone number already registered' });
        }

        // If email provided, check uniqueness (use admin client)
        if (email) {
            const { data: existingEmail, error: emailCheckError } = await supabaseAdmin
                .from('employees_users')
                .select('email')
                .eq('email', email)
                .maybeSingle();
            
            if (existingEmail) {
                return res.status(409).json({ error: 'Email already registered' });
            }
        }

        // 2. Create user in Supabase Auth (requires service_role key)
        const crypto = require('crypto');
        const randomPassword = crypto.randomBytes(16).toString('hex'); // won't be used for login

        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            phone: formattedPhone,
            password: randomPassword,
            email: email || undefined,
            email_confirm: true,
            phone_confirm: true,
        });

        if (authError) {
            console.error('Supabase Auth creation error:', authError);
            if (authError.message.includes('already been registered')) {
                return res.status(409).json({ error: 'Phone number already registered in Auth system.' });
            }
            return res.status(500).json({ error: `Auth creation failed: ${authError.message}` });
        }

        // 3. Hash the provided password for internal login
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // 4. Insert into employees_users using supabaseAdmin to bypass RLS
        const insertData = {
            id: authUser.user.id,
            full_name: fullName,
            phone_number: formattedPhone,
            email: email || null,
            current_location: currentLocation || null,
            highest_qualification: highestQualification || null,
            job_types: jobTypes || [],
            preferred_languages: preferredLanguages || [],
            password_hash: passwordHash
        };

        console.log('Inserting employee:', { ...insertData, password_hash: '[HIDDEN]' });

        const { data: newEmployee, error: insertError } = await supabaseAdmin
            .from('employees_users')
            .insert([insertData])
            .select()
            .single();

        if (insertError) {
            console.error('Supabase insert error:', insertError);
            // Rollback: delete the Auth user if DB insert fails
            await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
            return res.status(500).json({ 
                error: `Database insert failed: ${insertError.message}`,
                details: insertError.details,
                code: insertError.code
            });
        }

        // Return user object without sensitive fields
        const { password_hash, ...safeUser } = newEmployee;
        console.log(`Employee registered successfully: ${safeUser.id}`);
        
        res.status(201).json({
            message: 'Employee registration successful',
            user: safeUser
        });
    } catch (err) {
        console.error('Unexpected error in employee-register:', err);
        res.status(500).json({ error: 'Internal server error: ' + err.message });
    }
});

router.post('/employer-register', async (req, res) => {
  try {
    const { companyName, officeLocation, hrFirstName, hrLastName, officialEmail, contactNumber, password } = req.body;

    // Validation
    if (!companyName || !hrFirstName || !hrLastName || !contactNumber || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Hash password
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert
    const { data, error } = await supabase
      .from('employers_users')
      .insert([{
        company_name: companyName,
        office_location: officeLocation,
        hr_first_name: hrFirstName,
        hr_last_name: hrLastName,
        official_email: officialEmail,
        contact_number: contactNumber,
        password_hash: hashedPassword
      }])
      .select()
      .single();

    if (error) {
      console.error(error);
      return res.status(500).json({ error: error.message });
    }

    delete data.password_hash;
    res.status(201).json({ message: 'Registration successful', user: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// ------------------- FIXED: Employee Password Login (with phone normalization) -------------------
router.post('/employee-login', async (req, res) => {
  let { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ error: 'Phone number and password are required' });
  }

  // Normalize phone number to stored format
  phone = normalizePhone(phone);

  try {
    const { data: employee, error } = await supabase
      .from('employees_users')
      .select('*')
      .eq('phone_number', phone)
      .single();

    if (error || !employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const isValid = await bcrypt.compare(password, employee.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const { password_hash, ...safeEmployee } = employee;
    const user = {
      ...safeEmployee,
      name: safeEmployee.full_name,
      phone: safeEmployee.phone_number,
      role: 'employee',
      id: safeEmployee.id,
    };
    delete user.full_name;
    delete user.phone_number;

    res.json({ message: 'Login successful', user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post('/employer-login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ error: 'Phone number and password required' });
  }

  try {
    const bcrypt = require('bcrypt');
    const supabase = require('../supabaseClient');

    // Find employer by contact_number
    const { data: employer, error } = await supabase
      .from('employers_users')
      .select('*')
      .eq('contact_number', phone)
      .single();

    if (error || !employer) {
      return res.status(404).json({ error: 'Employer not found' });
    }

    const isValid = await bcrypt.compare(password, employer.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const { password_hash, ...safeEmployer } = employer;

    // Map fields to match navbar expectations
    const user = {
      ...safeEmployer,
      name: safeEmployer.company_name,
      phone: safeEmployer.contact_number,
      role: 'employer',
      id: safeEmployer.id,
    };

    res.json({ message: 'Login successful', user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------- FIXED: OTP Routes (with phone normalization) -------------------
// Send OTP to employee’s phone
router.post('/employee/send-otp', async (req, res) => {
  let { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  phone = normalizePhone(phone);

  try {
    // Check if employee exists in employees_users
    const { data: employee, error: findError } = await supabase
      .from('employees_users')
      .select('id')
      .eq('phone_number', phone)
      .single();

    if (findError || !employee) {
      return res.status(404).json({ error: 'Employee not found. Please register first.' });
    }

    // Send OTP via Supabase Auth (Twilio)
    const { error: otpError } = await supabase.auth.signInWithOtp({
      phone,
    });

    if (otpError) {
      console.error('Supabase OTP error:', otpError);
      return res.status(500).json({ error: 'Failed to send OTP. Please try again later.' });
    }

    res.json({ message: 'OTP sent successfully to your mobile number.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify OTP and log the employee in
router.post('/employee/verify-otp', async (req, res) => {
  let { phone, otp } = req.body;
  if (!phone || !otp) {
    return res.status(400).json({ error: 'Phone and OTP are required' });
  }

  phone = normalizePhone(phone);

  try {
    // Verify OTP with Supabase Auth
    const { data: authData, error: verifyError } = await supabase.auth.verifyOtp({
      phone,
      token: otp,
      type: 'sms',
    });

    if (verifyError) {
      return res.status(401).json({ error: 'Invalid or expired OTP' });
    }

    // Fetch employee details from employees_users
    const { data: employee, error: userError } = await supabase
      .from('employees_users')
      .select('*')
      .eq('phone_number', phone)
      .single();

    if (userError || !employee) {
      return res.status(404).json({ error: 'Employee profile not found' });
    }

    const { password_hash, ...safeEmployee } = employee;
    const user = {
      ...safeEmployee,
      name: safeEmployee.full_name,
      phone: safeEmployee.phone_number,
      role: 'employee',
      id: safeEmployee.id,
    };
    delete user.full_name;
    delete user.phone_number;

    res.json({ user, message: 'Login successful' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;