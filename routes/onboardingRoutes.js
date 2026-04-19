const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Employee - always insert new row
router.post('/employee-profile', async (req, res) => {
  try {
    const {
      fullName,
      phone,
      email,
      currentLocation,
      highestQualification,
      selectedJobTypes,
      preferredLanguages
    } = req.body;

    // Validation
    if (!fullName || !phone || !currentLocation || !highestQualification) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!selectedJobTypes?.length) {
      return res.status(400).json({ error: 'At least one job type is required' });
    }
    if (!preferredLanguages?.length) {
      return res.status(400).json({ error: 'At least one language is required' });
    }

    // Always insert (no check for existing)
    const { error } = await supabase
      .from('registered_applicant_profiles')
      .insert([{
        full_name: fullName,
        phone,
        email: email || null,
        current_location: currentLocation,
        highest_qualification: highestQualification,
        preferred_job_types: selectedJobTypes,
        preferred_languages: preferredLanguages,
        created_at: new Date().toISOString()
      }]);

    if (error) throw error;

    res.status(201).json({ message: 'Employee profile saved successfully' });
  } catch (err) {
    console.error('Employee profile error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Employer - always insert new row
router.post('/employer-profile', async (req, res) => {
  try {
    const {
      companyName,
      officeLocation,
      hrFirstName,
      hrLastName,
      hrEmail,
      hrPhone,
      linkedinProfile,
      totalCandidatesRequired,
      jobLocation,
      selectedJobCategories
    } = req.body;

    // Validation
    if (!companyName || !officeLocation || !hrFirstName || !hrLastName || !hrEmail || !hrPhone) {
      return res.status(400).json({ error: 'Missing required company/HR fields' });
    }
    if (!totalCandidatesRequired || !jobLocation) {
      return res.status(400).json({ error: 'Missing job requirements' });
    }
    if (!selectedJobCategories?.length) {
      return res.status(400).json({ error: 'At least one job category is required' });
    }

    // Always insert (no check for existing)
    const { error } = await supabase
      .from('registered_employer_profiles')
      .insert([{
        company_name: companyName,
        office_location: officeLocation,
        hr_first_name: hrFirstName,
        hr_last_name: hrLastName,
        hr_email: hrEmail,
        hr_phone: hrPhone,
        linkedin_profile: linkedinProfile || null,
        total_candidates_required: parseInt(totalCandidatesRequired),
        job_location: jobLocation,
        selected_job_categories: selectedJobCategories,
        created_at: new Date().toISOString()
      }]);

    if (error) throw error;

    res.status(201).json({ message: 'Employer profile saved successfully' });
  } catch (err) {
    console.error('Employer profile error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;