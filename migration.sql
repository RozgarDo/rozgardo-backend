-- ============================================
-- RozgarDo: Supabase Schema Migration
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================

-- 1. Ensure users table has required columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Create applicant_profiles table
CREATE TABLE IF NOT EXISTS applicant_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  skills TEXT[] DEFAULT '{}',
  experience JSONB DEFAULT '[]',
  resume_url TEXT,
  location TEXT,
  bio TEXT,
  preferred_location TEXT,
  expected_salary TEXT,
  job_type TEXT DEFAULT 'Full-time',
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create employer_profiles table
CREATE TABLE IF NOT EXISTS employer_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  company_name TEXT,
  company_logo TEXT,
  company_description TEXT,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Add missing columns to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_type TEXT DEFAULT 'Full-time';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 5. Add applied_at to applications
ALTER TABLE applications ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ DEFAULT NOW();

-- 6. Migrate existing applicant data into applicant_profiles
INSERT INTO applicant_profiles (user_id, skills, location)
SELECT id, 
  CASE WHEN skills IS NOT NULL AND skills != '' THEN string_to_array(skills, ', ') ELSE '{}' END,
  location
FROM users WHERE role = 'employee'
ON CONFLICT (user_id) DO NOTHING;

-- 7. Migrate existing employer data into employer_profiles
INSERT INTO employer_profiles (user_id, company_name, location)
SELECT id, name, location
FROM users WHERE role = 'employer'
ON CONFLICT (user_id) DO NOTHING;

-- 8. Enable Row Level Security on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE applicant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- 9. RLS Policies (Permissive for anon key — tighten when Supabase Auth is added)

-- Users
CREATE POLICY "Users are viewable by everyone" ON users FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (true);
CREATE POLICY "Allow inserts for registration" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow delete for admin" ON users FOR DELETE USING (true);

-- Applicant Profiles
CREATE POLICY "Applicant profiles viewable" ON applicant_profiles FOR SELECT USING (true);
CREATE POLICY "Applicant can update own profile" ON applicant_profiles FOR UPDATE USING (true);
CREATE POLICY "Allow insert applicant profile" ON applicant_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow delete applicant profile" ON applicant_profiles FOR DELETE USING (true);

-- Employer Profiles
CREATE POLICY "Employer profiles viewable" ON employer_profiles FOR SELECT USING (true);
CREATE POLICY "Employer can update own profile" ON employer_profiles FOR UPDATE USING (true);
CREATE POLICY "Allow insert employer profile" ON employer_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow delete employer profile" ON employer_profiles FOR DELETE USING (true);

-- Jobs
CREATE POLICY "Jobs viewable by everyone" ON jobs FOR SELECT USING (true);
CREATE POLICY "Employers can insert jobs" ON jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "Jobs updatable" ON jobs FOR UPDATE USING (true);
CREATE POLICY "Jobs deletable" ON jobs FOR DELETE USING (true);

-- Applications
CREATE POLICY "Applications viewable" ON applications FOR SELECT USING (true);
CREATE POLICY "Applicants can apply" ON applications FOR INSERT WITH CHECK (true);
CREATE POLICY "Applications updatable" ON applications FOR UPDATE USING (true);
CREATE POLICY "Applications deletable" ON applications FOR DELETE USING (true);

-- Done!
-- Verify by running: SELECT tablename FROM pg_tables WHERE schemaname = 'public';
