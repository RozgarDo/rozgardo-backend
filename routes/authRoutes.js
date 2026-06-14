const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { createClient } = require('@supabase/supabase-js');
const supabase = require('../supabaseClient');
const jwt = require('jsonwebtoken');


const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Helper: Normalise Indian phone numbers to E.164 format (+91xxxxxxxxxx)
function normalizePhone(phone) {
  if (!phone) return phone;
  let cleaned = phone.trim().replace(/^\+?91/, '');
  cleaned = cleaned.replace(/^0+/, '');
  return `+91${cleaned}`;
}

// Helper: Remove sensitive fields
function stripPassword(obj) {
  if (!obj) return obj;
  const { password, password_hash, ...rest } = obj;
  return rest;
}

// Helper: update employee profile (handles all fields)
async function updateEmployeeProfile(userId, fields) {
  const allowed = [
    'email', 'bio', 'photo_url', 'location', 'job_type',
    'preferred_location', 'expected_salary',
    'highest_qualification', 'job_types', 'preferred_languages'
  ];
  const updateData = {};
  for (let key of allowed) {
    if (fields[key] !== undefined) {
      updateData[key] = fields[key];
    }
  }
  // Handle skills (string -> array)
  if (fields.skills !== undefined) {
    if (typeof fields.skills === 'string') {
      updateData.skills = fields.skills.split(',').map(s => s.trim());
    } else {
      updateData.skills = fields.skills;
    }
  }
  // Handle experience (string -> JSON)
  if (fields.experience !== undefined) {
    if (typeof fields.experience === 'string') {
      updateData.experience = JSON.parse(fields.experience);
    } else {
      updateData.experience = fields.experience;
    }
  }
  if (Object.keys(updateData).length === 0) return null;

  const { data, error } = await supabaseAdmin
    .from('employees_users')
    .update(updateData)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// Helper: update employer profile
async function updateEmployerProfile(userId, fields) {
  const allowed = [
    'office_location', 'company_description', 'photo_url', 
    'website', 'industry', 'employee_count', 'hr_linkedin'
  ];
  const updateData = {};
  if (fields.location !== undefined) updateData.office_location = fields.location;
  if (fields.company_description !== undefined) updateData.company_description = fields.company_description;
  if (fields.photo_url !== undefined) updateData.photo_url = fields.photo_url;
  if (fields.website !== undefined) updateData.website = fields.website;
  if (fields.industry !== undefined) updateData.industry = fields.industry;
  if (fields.employee_count !== undefined) updateData.employee_count = fields.employee_count;
  if (fields.hr_linkedin !== undefined) updateData.hr_linkedin = fields.hr_linkedin;
  if (Object.keys(updateData).length === 0) return null;
  const { data, error } = await supabaseAdmin
    .from('employers_users')
    .update(updateData)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ------------------- GET PROFILE (fetch latest user data) -------------------
router.get('/profile/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Try employee first
    let { data: employee, error } = await supabaseAdmin
      .from('employees_users')
      .select('*')
      .eq('id', id)
      .single();
    if (employee) {
      const userResponse = {
        id: employee.id,
        name: employee.full_name,
        phone: employee.phone_number,
        role: 'employee',
        first_name: employee.full_name?.split(' ')[0] || '',
        last_name: employee.full_name?.split(' ').slice(1).join(' ') || '',
        email: employee.email,
        bio: employee.bio,
        photo_url: employee.photo_url,
        location: employee.location,
        skills: employee.skills || [],
        experience: employee.experience || [],
        job_type: employee.job_type || 'Full-time',
        preferred_location: employee.preferred_location,
        expected_salary: employee.expected_salary,
        highest_qualification: employee.highest_qualification,
        job_types: employee.job_types || [],
        preferred_languages: employee.preferred_languages || [],
      };
      return res.json({ user: userResponse });
    }
    // Try employer
    let { data: employer, error: empError } = await supabaseAdmin
      .from('employers_users')
      .select('*')
      .eq('id', id)
      .single();
    if (employer) {
      const userResponse = {
        id: employer.id,
        name: employer.company_name,
        phone: employer.contact_number,
        role: 'employer',
        email: employer.official_email,
        company_name: employer.company_name,
        company_description: employer.company_description,
        photo_url: employer.photo_url,
        location: employer.office_location,
        hr_first_name: employer.hr_first_name,
        hr_last_name: employer.hr_last_name,
        hr_linkedin: employer.hr_linkedin,  // ✅ added
        website: employer.website,
        industry: employer.industry,
        employee_count: employer.employee_count,
      };
      return res.json({ user: userResponse });
    }
    return res.status(404).json({ error: 'User not found' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------- PROFILE UPDATE (generic) -------------------
router.put('/profile/:id', async (req, res) => {
  const { id } = req.params;
  const body = req.body;
  try {
    // Determine role
    let role = null;
    let { data: empData } = await supabaseAdmin.from('employees_users').select('id').eq('id', id).single();
    if (empData) role = 'employee';
    else {
      let { data: empData2 } = await supabaseAdmin.from('employers_users').select('id').eq('id', id).single();
      if (empData2) role = 'employer';
    }
    if (!role) return res.status(404).json({ error: 'User not found' });

    if (role === 'employee') {
      // Update common fields (name, email, phone)
      const common = {};
      if (body.name !== undefined) common.full_name = body.name;
      if (body.email !== undefined) common.email = body.email;
      if (body.phone !== undefined) common.phone_number = body.phone;
      if (Object.keys(common).length > 0) {
        const { error: commonErr } = await supabaseAdmin
          .from('employees_users')
          .update(common)
          .eq('id', id);
        if (commonErr) throw commonErr;
      }
      // Update profile fields (including new ones)
      await updateEmployeeProfile(id, body);

      // Fetch final user
      const { data: finalUser, error: fetchErr } = await supabaseAdmin
        .from('employees_users')
        .select('*')
        .eq('id', id)
        .single();
      if (fetchErr) throw fetchErr;

      const userResponse = {
        id: finalUser.id,
        name: finalUser.full_name,
        phone: finalUser.phone_number,
        role: 'employee',
        first_name: finalUser.full_name?.split(' ')[0] || '',
        last_name: finalUser.full_name?.split(' ').slice(1).join(' ') || '',
        email: finalUser.email,
        bio: finalUser.bio,
        photo_url: finalUser.photo_url,
        location: finalUser.location,
        skills: finalUser.skills || [],
        experience: finalUser.experience || [],
        job_type: finalUser.job_type || 'Full-time',
        preferred_location: finalUser.preferred_location,
        expected_salary: finalUser.expected_salary,
        highest_qualification: finalUser.highest_qualification,
        job_types: finalUser.job_types || [],
        preferred_languages: finalUser.preferred_languages || [],
      };
      return res.json({ message: 'Profile updated', user: userResponse });
    }
    else { // employer
      // Update common fields (name, email, phone) - map to employer columns
      const common = {};
      if (body.name !== undefined) common.company_name = body.name;
      if (body.email !== undefined) common.official_email = body.email;
      if (body.phone !== undefined) common.contact_number = body.phone;
      if (Object.keys(common).length > 0) {
        const { error: commonErr } = await supabaseAdmin
          .from('employers_users')
          .update(common)
          .eq('id', id);
        if (commonErr) throw commonErr;
      }
      // Update HR names if provided
      const hrData = {};
      if (body.hr_first_name !== undefined) hrData.hr_first_name = body.hr_first_name;
      if (body.hr_last_name !== undefined) hrData.hr_last_name = body.hr_last_name;
      if (Object.keys(hrData).length > 0) {
        await supabaseAdmin.from('employers_users').update(hrData).eq('id', id);
      }
      // Update other profile fields
      await updateEmployerProfile(id, body);

      // Fetch final user
      const { data: finalUser, error: fetchErr } = await supabaseAdmin
        .from('employers_users')
        .select('*')
        .eq('id', id)
        .single();
      if (fetchErr) throw fetchErr;

      const userResponse = {
        id: finalUser.id,
        name: finalUser.company_name,
        phone: finalUser.contact_number,
        role: 'employer',
        email: finalUser.official_email,
        company_name: finalUser.company_name,
        company_description: finalUser.company_description,
        photo_url: finalUser.photo_url,
        location: finalUser.office_location,
        hr_first_name: finalUser.hr_first_name,
        hr_last_name: finalUser.hr_last_name,
        hr_linkedin: finalUser.hr_linkedin,  // ✅ added
        website: finalUser.website,
        industry: finalUser.industry,
        employee_count: finalUser.employee_count,
      };
      return res.json({ message: 'Profile updated', user: userResponse });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});



router.post('/employee-login', async (req, res) => {
  let { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ error: 'Phone and password required' });
  phone = normalizePhone(phone);
  try {
    const { data: employee, error } = await supabaseAdmin
      .from('employees_users')
      .select('*')
      .eq('phone_number', phone)
      .single();
    if (error || !employee) return res.status(404).json({ error: 'Employee not found' });

    // **** ADD THIS STATUS CHECK ****
    if (employee.account_status === 'deactivated') {
      return res.status(403).json({ code: 'account_deactivated', error: 'Account is deactivated. Please reactivate.' });
    }

    if (employee.account_status === 'suspended') {
  return res.status(403).json({ code: 'account_suspended', error: 'Account suspended. Contact support.' });
}

    const isValid = await bcrypt.compare(password, employee.password_hash);
    if (!isValid) return res.status(401).json({ error: 'Invalid password' });
    const safe = stripPassword(employee);
    const user = {
      ...safe,
      name: safe.full_name,
      phone: safe.phone_number,
      role: 'employee',
      id: safe.id,
      first_name: safe.full_name?.split(' ')[0] || '',
      last_name: safe.full_name?.split(' ').slice(1).join(' ') || '',
      email: safe.email,
      bio: safe.bio,
      photo_url: safe.photo_url,
      location: safe.location,
      skills: safe.skills || [],
      experience: safe.experience || [],
      job_type: safe.job_type || 'Full-time',
      preferred_location: safe.preferred_location,
      expected_salary: safe.expected_salary,
      highest_qualification: safe.highest_qualification,
      job_types: safe.job_types || [],
      preferred_languages: safe.preferred_languages || [],
      phoneVerified: safe.phone_verified || false,
    };
    delete user.full_name;
    delete user.phone_number;
    res.json({ message: 'Login successful', user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



router.post('/employee/send-otp', async (req, res) => {
  let { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });
  phone = normalizePhone(phone);
  try {
    const { data: employee, error: findError } = await supabaseAdmin
      .from('employees_users')
      .select('id, account_status')
      .eq('phone_number', phone)
      .single();
    if (findError || !employee) {
      return res.status(404).json({ error: 'Employee not found. Please register first.' });
    }
    // Block OTP sending only if account is suspended
    if (employee.account_status === 'suspended') {
      return res.status(403).json({ code: 'account_suspended', error: 'Account suspended. Contact support.' });
    }
    // Deactivated accounts can still receive OTP (reactivation will be handled later)
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone });
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

router.post('/employee/verify-otp', async (req, res) => {
  let { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP required' });
  phone = normalizePhone(phone);
  try {
    // First, check if the employee exists and get account status
    const { data: employee, error: findError } = await supabaseAdmin
      .from('employees_users')
      .select('*')
      .eq('phone_number', phone)
      .single();
    if (findError || !employee) return res.status(404).json({ error: 'Employee profile not found' });

    // **** ADD STATUS CHECK BEFORE OTP VERIFICATION ****
    if (employee.account_status === 'deactivated') {
      return res.status(403).json({ code: 'account_deactivated', error: 'Account is deactivated. Please reactivate.' });
    }

    // Verify OTP
    const { error: verifyError } = await supabase.auth.verifyOtp({ phone, token: otp, type: 'sms' });
    if (verifyError) return res.status(401).json({ error: 'Invalid or expired OTP' });

    const safe = stripPassword(employee);
    const user = {
      id: safe.id,
      name: safe.full_name,
      phone: safe.phone_number,
      role: 'employee',
      first_name: safe.full_name?.split(' ')[0] || '',
      last_name: safe.full_name?.split(' ').slice(1).join(' ') || '',
      email: safe.email,
      bio: safe.bio,
      photo_url: safe.photo_url,
      location: safe.location,
      skills: safe.skills || [],
      experience: safe.experience || [],
      job_type: safe.job_type || 'Full-time',
      preferred_location: safe.preferred_location,
      expected_salary: safe.expected_salary,
      highest_qualification: safe.highest_qualification,
      job_types: safe.job_types || [],
      preferred_languages: safe.preferred_languages || [],
      phoneVerified: safe.phone_verified || false
    };
    delete user.full_name;
    delete user.phone_number;
    res.json({ user, message: 'Login successful' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post('/employer-login', async (req, res) => {
  let { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ error: 'Phone and password required' });
  phone = normalizePhone(phone);
  try {
    const { data: employer, error } = await supabaseAdmin
      .from('employers_users')
      .select('*')
      .eq('contact_number', phone)
      .single();
    if (error || !employer) return res.status(404).json({ error: 'Employer not found' });

    // **** ADD THIS STATUS CHECK ****
    if (employer.account_status === 'deactivated') {
      return res.status(403).json({ code: 'account_deactivated', error: 'Account is deactivated. Please reactivate.' });
    }

    if (employer.account_status === 'suspended') {
  return res.status(403).json({ code: 'account_suspended', error: 'Account suspended. Contact support.' });
}

    const isValid = await bcrypt.compare(password, employer.password_hash);
    if (!isValid) return res.status(401).json({ error: 'Invalid password' });
    const safe = stripPassword(employer);
    const user = {
      id: safe.id,
      name: safe.company_name,
      phone: safe.contact_number,
      role: 'employer',
      email: safe.official_email,
      company_name: safe.company_name,
      company_description: safe.company_description,
      photo_url: safe.photo_url,
      location: safe.office_location,
      hr_first_name: safe.hr_first_name,
      hr_last_name: safe.hr_last_name,
      hr_linkedin: safe.hr_linkedin,
      website: safe.website,
      industry: safe.industry,
      employee_count: safe.employee_count,
      phoneVerified: safe.phone_verified || false,
    };
    res.json({ message: 'Login successful', user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



router.post('/employer/send-otp', async (req, res) => {
  let { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });
  phone = normalizePhone(phone);
  try {
    const { data: employer, error: findError } = await supabaseAdmin
      .from('employers_users')
      .select('id, account_status')
      .eq('contact_number', phone)
      .single();
    if (findError || !employer) {
      return res.status(404).json({ error: 'Employer not found. Please register first.' });
    }
    if (employer.account_status === 'suspended') {
      return res.status(403).json({ code: 'account_suspended', error: 'Account suspended. Contact support.' });
    }
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone });
    if (otpError) {
      console.error('Supabase OTP error:', otpError);
      return res.status(500).json({ error: 'Failed to send OTP' });
    }
    res.json({ message: 'OTP sent successfully to your mobile number.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post('/employer/verify-otp', async (req, res) => {
  let { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP are required' });
  phone = normalizePhone(phone);
  try {
    // First, check if the employer exists and get their account status
    const { data: employer, error: findError } = await supabaseAdmin
      .from('employers_users')
      .select('*')
      .eq('contact_number', phone)
      .single();
    
    if (findError || !employer) {
      return res.status(404).json({ error: 'Employer profile not found' });
    }

    // Check account status BEFORE OTP verification
    if (employer.account_status === 'deactivated') {
      return res.status(403).json({ code: 'account_deactivated', error: 'Account is deactivated. Please reactivate.' });
    }

    // Now verify OTP
    const { error: verifyError } = await supabase.auth.verifyOtp({ phone, token: otp, type: 'sms' });
    if (verifyError) {
      console.error('OTP verification error:', verifyError);
      return res.status(401).json({ error: 'Invalid or expired OTP' });
    }

    const safe = stripPassword(employer);
    const user = {
      id: safe.id,
      name: safe.company_name,
      phone: safe.contact_number,
      role: 'employer',
      email: safe.official_email,
      company_name: safe.company_name,
      company_description: safe.company_description,
      photo_url: safe.photo_url,
      location: safe.office_location,
      hr_first_name: safe.hr_first_name,
      hr_last_name: safe.hr_last_name,
      hr_linkedin: safe.hr_linkedin,
      website: safe.website,
      industry: safe.industry,
      employee_count: safe.employee_count,
      phoneVerified: safe.phone_verified || false
    };
    res.json({ user, message: 'Login successful' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// ------------------- EMPLOYEE REGISTRATION -------------------
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
  if (!fullName || !phoneNumber || !password) {
    return res.status(400).json({ error: 'Missing required fields: fullName, phoneNumber, password' });
  }
  let formattedPhone = normalizePhone(phoneNumber);
  try {
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
    const crypto = require('crypto');
    const randomPassword = crypto.randomBytes(16).toString('hex');
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
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    const insertData = {
      id: authUser.user.id,
      full_name: fullName,
      phone_number: formattedPhone,
      email: email || null,
      current_location: currentLocation || null,
      location: currentLocation || null,
      highest_qualification: highestQualification || null,
      job_types: jobTypes || [],
      preferred_languages: preferredLanguages || [],
      password_hash: passwordHash
    };
    const { data: newEmployee, error: insertError } = await supabaseAdmin
      .from('employees_users')
      .insert([insertData])
      .select()
      .single();
    if (insertError) {
      console.error('Supabase insert error:', insertError);
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return res.status(500).json({ 
        error: `Database insert failed: ${insertError.message}`,
        details: insertError.details,
        code: insertError.code
      });
    }
    const { password_hash, ...safeUser } = newEmployee;
    res.status(201).json({
      message: 'Employee registration successful',
      user: safeUser
    });
  } catch (err) {
    console.error('Unexpected error in employee-register:', err);
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
});

// ------------------- EMPLOYER REGISTRATION -------------------
router.post('/employer-register', async (req, res) => {
  try {
    const { companyName, officeLocation, hrFirstName, hrLastName, officialEmail, contactNumber, password } = req.body;
    if (!companyName || !hrFirstName || !hrLastName || !contactNumber || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    let formattedPhone = normalizePhone(contactNumber);
    const { data: existingUser, error: checkError } = await supabaseAdmin
      .from('employers_users')
      .select('contact_number')
      .eq('contact_number', formattedPhone)
      .maybeSingle();
    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing employer:', checkError);
      return res.status(500).json({ error: 'Database error during duplicate check' });
    }
    if (existingUser) {
      return res.status(409).json({ error: 'Phone number already registered' });
    }
    const crypto = require('crypto');
    const randomPassword = crypto.randomBytes(16).toString('hex');
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      phone: formattedPhone,
      password: randomPassword,
      email: officialEmail || undefined,
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
    const hashedPassword = await bcrypt.hash(password, 10);
    const insertData = {
      id: authUser.user.id,
      company_name: companyName,
      office_location: officeLocation,
      hr_first_name: hrFirstName,
      hr_last_name: hrLastName,
      official_email: officialEmail,
      contact_number: formattedPhone,
      password_hash: hashedPassword
    };
    const { data, error } = await supabaseAdmin
      .from('employers_users')
      .insert([insertData])
      .select()
      .single();
    if (error) {
      console.error(error);
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return res.status(500).json({ error: error.message });
    }
    res.status(201).json({ message: 'Registration successful', user: stripPassword(data) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------- ADMIN LOGIN -------------------
router.post('/admin/login', async (req, res) => {
    const { loginId, password } = req.body;
    if (!loginId || !password) {
        return res.status(400).json({ error: 'Login ID and password are required' });
    }
    try {
        const { data: admin, error } = await supabaseAdmin
            .from('admin_users')
            .select('*')
            .eq('login_id', loginId)
            .single();
        if (error || !admin) return res.status(404).json({ error: 'Admin not found' });
        
        const isValid = await bcrypt.compare(password, admin.password_hash);
        if (!isValid) return res.status(401).json({ error: 'Invalid password' });
        
        // Generate JWT token
        const token = jwt.sign(
            { id: admin.id, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        const { password_hash, ...safeAdmin } = admin;
        res.json({ message: 'Login successful', user: safeAdmin, token });
    } catch (err) {
        console.error('Admin login error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/employees', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('employees_users')
      .select('*')
      .eq('account_status', 'active')   // <-- Only active employees
      .order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    const safeData = data.map(emp => {
      const { password_hash, ...rest } = emp;
      return {
        ...rest,
        id: emp.id,
        name: emp.full_name,
        phone: emp.phone_number,
        role: 'employee'
      };
    });
    res.json(safeData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



router.get('/employers', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('employers_users')
      .select('*')
      .eq('account_status', 'active')   // Only show active employers
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    const safeData = data.map(emp => {
      const { password_hash, ...rest } = emp;
      return {
        ...rest,
        id: emp.id,
        name: emp.company_name,
        phone: emp.contact_number,
        role: 'employer'
      };
    });
    res.json(safeData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ------------------- LEGACY LOGIN ROUTES (unchanged) -------------------
router.post('/login', async (req, res) => {
    const { loginId, password, otp, type } = req.body;
    try {
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
        const profileData = userData.role === 'employee' 
            ? (Array.isArray(userData.applicant_profiles) ? userData.applicant_profiles[0] : userData.applicant_profiles || {}) 
            : (Array.isArray(userData.employer_profiles) ? userData.employer_profiles[0] : userData.employer_profiles || {});
        delete userData.applicant_profiles;
        delete userData.employer_profiles;
        const flattenedUser = { ...profileData, ...userData, id: userData.id };
        console.log(`User logged in: ${flattenedUser.name} (UUID: ${flattenedUser.id})`);
        res.json({ message: 'Login successful', user: stripPassword(flattenedUser) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

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


// ------------------- CHANGE PASSWORD (employee) -------------------
router.put('/change-password', async (req, res) => {
  const { userId, currentPassword, newPassword } = req.body;
  if (!userId || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  try {
    // 1. Fetch the employee from the database
    const { data: employee, error: fetchError } = await supabaseAdmin
      .from('employees_users')
      .select('password_hash')
      .eq('id', userId)
      .single();

    if (fetchError || !employee) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 2. Verify current password
    const isValid = await bcrypt.compare(currentPassword, employee.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // 3. Hash the new password
    const saltRounds = 10;
    const newHashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // 4. Update the database
    const { error: updateError } = await supabaseAdmin
      .from('employees_users')
      .update({ password_hash: newHashedPassword })
      .eq('id', userId);

    if (updateError) {
      console.error('Update error:', updateError);
      return res.status(500).json({ error: 'Failed to update password' });
    }

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// ------------------- CHANGE PASSWORD (employer) -------------------
router.put('/employer/change-password', async (req, res) => {
  const { userId, currentPassword, newPassword } = req.body;
  if (!userId || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  try {
    // 1. Fetch the employer from the database
    const { data: employer, error: fetchError } = await supabaseAdmin
      .from('employers_users')
      .select('password_hash')
      .eq('id', userId)
      .single();

    if (fetchError || !employer) {
      return res.status(404).json({ error: 'Employer not found' });
    }

    // 2. Verify current password
    const isValid = await bcrypt.compare(currentPassword, employer.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // 3. Hash the new password
    const saltRounds = 10;
    const newHashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // 4. Update the database
    const { error: updateError } = await supabaseAdmin
      .from('employers_users')
      .update({ password_hash: newHashedPassword })
      .eq('id', userId);

    if (updateError) {
      console.error('Update error:', updateError);
      return res.status(500).json({ error: 'Failed to update password' });
    }

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});




// ------------------- EMPLOYER RESET PASSWORD (after OTP verification) -------------------
router.post('/employer/reset-password', async (req, res) => {
  let { phone, newPassword } = req.body;
  if (!phone || !newPassword) {
    return res.status(400).json({ error: 'Phone and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  // Normalize phone number to match database format
  phone = normalizePhone(phone);
  console.log('Reset password for normalized phone:', phone);

  try {
    // Find employer by normalized phone number
    const { data: employer, error: findError } = await supabaseAdmin
      .from('employers_users')
      .select('id')
      .eq('contact_number', phone)
      .single();

    if (findError || !employer) {
      console.error('Employer not found for phone:', phone, findError);
      return res.status(404).json({ error: 'Employer not found' });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password in database
    const { error: updateError } = await supabaseAdmin
      .from('employers_users')
      .update({ password_hash: hashedPassword })
      .eq('id', employer.id);

    if (updateError) {
      console.error('Reset password update error:', updateError);
      return res.status(500).json({ error: 'Failed to reset password' });
    }

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// ------------------- EMPLOYEE RESET PASSWORD (after OTP verification) -------------------
router.post('/employee/reset-password', async (req, res) => {
  let { phone, newPassword } = req.body;
  if (!phone || !newPassword) {
    return res.status(400).json({ error: 'Phone and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  // Normalize phone number
  phone = normalizePhone(phone);
  console.log('Reset password for employee normalized phone:', phone);

  try {
    // Find employee by normalized phone number
    const { data: employee, error: findError } = await supabaseAdmin
      .from('employees_users')
      .select('id')
      .eq('phone_number', phone)
      .single();

    if (findError || !employee) {
      console.error('Employee not found for phone:', phone, findError);
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password in database
    const { error: updateError } = await supabaseAdmin
      .from('employees_users')
      .update({ password_hash: hashedPassword })
      .eq('id', employee.id);

    if (updateError) {
      console.error('Reset password update error:', updateError);
      return res.status(500).json({ error: 'Failed to reset password' });
    }

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});




// ------------------- DEACTIVATE EMPLOYEE ACCOUNT (soft) -------------------
router.put('/employee/deactivate-account', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const { error: updateError } = await supabaseAdmin
      .from('employees_users')
      .update({ account_status: 'deactivated' })
      .eq('id', userId);
    if (updateError) {
      console.error('Deactivation error:', updateError);
      return res.status(500).json({ error: 'Failed to deactivate account' });
    }
    res.json({ message: 'Account deactivated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------- REACTIVATE EMPLOYEE ACCOUNT -------------------
router.put('/employee/reactivate-account', async (req, res) => {
  let { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });
  phone = normalizePhone(phone);
  try {
    const { error: updateError } = await supabaseAdmin
      .from('employees_users')
      .update({ account_status: 'active' })
      .eq('phone_number', phone);
    if (updateError) {
      console.error('Reactivation error:', updateError);
      return res.status(500).json({ error: 'Failed to reactivate account' });
    }
    res.json({ message: 'Account reactivated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// ------------------- DELETE EMPLOYEE ACCOUNT (hard delete) -------------------
router.delete('/employee/delete-account', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    // 1. Delete all applications
    await supabaseAdmin.from('applications').delete().eq('employee_id', userId);
    // 2. Delete employee profile
    await supabaseAdmin.from('employees_users').delete().eq('id', userId);
    // 3. Delete Supabase Auth user
    await supabaseAdmin.auth.admin.deleteUser(userId);
    res.json({ message: 'Account deleted permanently' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});




// ------------------- DEACTIVATE EMPLOYER ACCOUNT -------------------
router.put('/employer/deactivate-account', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'User ID is required' });
  try {
    const { error: updateError } = await supabaseAdmin
      .from('employers_users')
      .update({ account_status: 'deactivated' })
      .eq('id', userId);
    if (updateError) {
      console.error('Deactivation error:', updateError);
      return res.status(500).json({ error: 'Failed to deactivate account' });
    }
    res.json({ message: 'Account deactivated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------- REACTIVATE EMPLOYER ACCOUNT -------------------
router.put('/employer/reactivate-account', async (req, res) => {
  let { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });
  phone = normalizePhone(phone);
  try {
    const { error: updateError } = await supabaseAdmin
      .from('employers_users')
      .update({ account_status: 'active' })
      .eq('contact_number', phone);
    if (updateError) {
      console.error('Reactivation error:', updateError);
      return res.status(500).json({ error: 'Failed to reactivate account' });
    }
    res.json({ message: 'Account reactivated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------- DELETE EMPLOYER ACCOUNT (hard delete) -------------------
router.delete('/employer/delete-account', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'User ID is required' });
  try {
    // 1. Find all jobs posted by this employer
    const { data: jobs } = await supabaseAdmin.from('jobs').select('id').eq('employer_id', userId);
    if (jobs && jobs.length > 0) {
      const jobIds = jobs.map(j => j.id);
      // Delete all applications for those jobs
      await supabaseAdmin.from('applications').delete().in('job_id', jobIds);
      // Delete all jobs
      await supabaseAdmin.from('jobs').delete().eq('employer_id', userId);
    }
    // 2. Delete employer profile
    await supabaseAdmin.from('employers_users').delete().eq('id', userId);
    // 3. Delete Supabase Auth user
    await supabaseAdmin.auth.admin.deleteUser(userId);
    res.json({ message: 'Account deleted permanently' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});












// ------------------- ADMIN ROUTES -------------------

// ------------------- ADMIN: UPDATE EMPLOYEE ACCOUNT STATUS (active/suspended) -------------------
router.put('/admin/employee-status', async (req, res) => {
  const { userId, status } = req.body;
  if (!userId || !status) return res.status(400).json({ error: 'User ID and status are required' });
  if (!['active', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Use "active" or "suspended".' });
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('employees_users')
      .update({ account_status: status })
      .eq('id', userId)
      .select('id, full_name, account_status')
      .single();
    if (error) throw error;
    res.json({ message: `Employee account ${status}`, user: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------- ADMIN: UPDATE EMPLOYER ACCOUNT STATUS (active/suspended) -------------------
router.put('/admin/employer-status', async (req, res) => {
  const { userId, status } = req.body;
  if (!userId || !status) return res.status(400).json({ error: 'User ID and status are required' });
  if (!['active', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Use "active" or "suspended".' });
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('employers_users')
      .update({ account_status: status })
      .eq('id', userId)
      .select('id, company_name, account_status')
      .single();
    if (error) throw error;
    res.json({ message: `Employer account ${status}`, user: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------- ADMIN: GET SINGLE EMPLOYEE DETAILS -------------------
router.get('/admin/employee/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabaseAdmin
      .from('employees_users')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    const { password_hash, ...safeData } = data;
    res.json(safeData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------- ADMIN: GET SINGLE EMPLOYER DETAILS -------------------
router.get('/admin/employer/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabaseAdmin
      .from('employers_users')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    const { password_hash, ...safeData } = data;
    res.json(safeData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// ------------------- ADMIN: GET ALL EMPLOYEES (including deactivated/suspended) -------------------
router.get('/admin/all-employees', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('employees_users')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    const safeData = data.map(emp => {
      const { password_hash, ...rest } = emp;
      return {
        ...rest,
        id: emp.id,
        name: emp.full_name,
        phone: emp.phone_number,
        role: 'employee'
      };
    });
    res.json(safeData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------- ADMIN: GET ALL EMPLOYERS (including deactivated/suspended) -------------------
router.get('/admin/all-employers', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('employers_users')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    const safeData = data.map(emp => {
      const { password_hash, ...rest } = emp;
      return {
        ...rest,
        id: emp.id,
        name: emp.company_name,
        phone: emp.contact_number,
        role: 'employer'
      };
    });
    res.json(safeData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});









// Add after existing routes, before module.exports

// ------------------- SEND PHONE VERIFICATION OTP (for already logged in employee) -------------------
router.post('/employee/send-phone-verification-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });
  const normalizedPhone = normalizePhone(phone);
  try {
    // Check if employee exists
    const { data: employee, error: findError } = await supabaseAdmin
      .from('employees_users')
      .select('id, phone_verified')
      .eq('phone_number', normalizedPhone)
      .single();
    if (findError || !employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (employee.phone_verified) {
      return res.status(400).json({ error: 'Phone already verified' });
    }
    // Send OTP using Supabase Auth
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: normalizedPhone });
    if (otpError) {
      console.error('Supabase OTP error (phone verification):', otpError);
      return res.status(500).json({ error: 'Failed to send OTP' });
    }
    res.json({ message: 'Verification OTP sent successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------- VERIFY PHONE OTP AND UPDATE FLAG -------------------
router.post('/employee/verify-phone-otp', async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP required' });
  const normalizedPhone = normalizePhone(phone);
  try {
    // Verify OTP with Supabase
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone: normalizedPhone,
      token: otp,
      type: 'sms'
    });
    if (verifyError) return res.status(401).json({ error: 'Invalid or expired OTP' });

    // Update phone_verified to true
    const { data, error: updateError } = await supabaseAdmin
      .from('employees_users')
      .update({ phone_verified: true })
      .eq('phone_number', normalizedPhone)
      .select('id, phone_number, phone_verified, full_name')
      .single();

    if (updateError) throw updateError;

    res.json({
      message: 'Phone verified successfully',
      user: {
        id: data.id,
        phone: data.phone_number,
        phoneVerified: data.phone_verified,
        name: data.full_name
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});







// ------------------- SEND PHONE VERIFICATION OTP (for employer) -------------------
router.post('/employer/send-phone-verification-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });
  const normalizedPhone = normalizePhone(phone);
  try {
    // Check if employer exists
    const { data: employer, error: findError } = await supabaseAdmin
      .from('employers_users')
      .select('id, phone_verified')
      .eq('contact_number', normalizedPhone)
      .single();

    if (findError || !employer) {
      return res.status(404).json({ error: 'Employer not found' });
    }
    if (employer.phone_verified) {
      return res.status(400).json({ error: 'Phone already verified' });
    }

    // Send OTP using Supabase Auth
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: normalizedPhone });
    if (otpError) {
      console.error('Supabase OTP error (employer phone verification):', otpError);
      return res.status(500).json({ error: 'Failed to send OTP' });
    }
    res.json({ message: 'Verification OTP sent successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------- VERIFY PHONE OTP AND UPDATE FLAG (employer) -------------------
router.post('/employer/verify-phone-otp', async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP required' });
  const normalizedPhone = normalizePhone(phone);
  try {
    // Verify OTP with Supabase
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone: normalizedPhone,
      token: otp,
      type: 'sms'
    });
    if (verifyError) return res.status(401).json({ error: 'Invalid or expired OTP' });

    // Update phone_verified to true
    const { data, error: updateError } = await supabaseAdmin
      .from('employers_users')
      .update({ phone_verified: true })
      .eq('contact_number', normalizedPhone)
      .select('id, contact_number, phone_verified, company_name, hr_first_name, hr_last_name')
      .single();

    if (updateError) throw updateError;

    res.json({
      message: 'Phone verified successfully',
      user: {
        id: data.id,
        phone: data.contact_number,
        phoneVerified: data.phone_verified,
        name: `${data.hr_first_name} ${data.hr_last_name}`,
        companyName: data.company_name,
        role: 'employer'
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;

