-- Migration to add role, credits, free_attempts, RLS policies, and database protection triggers to profiles table in Supabase

-- 1. Add role column to profiles table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'role'
    ) THEN
        ALTER TABLE profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));
    END IF;
END $$;

-- 2. Add credits column to profiles table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'credits'
    ) THEN
        ALTER TABLE profiles ADD COLUMN credits INTEGER NOT NULL DEFAULT 0;
    END IF;
END $$;

-- 3. Add free_attempts column to profiles table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'free_attempts'
    ) THEN
        ALTER TABLE profiles ADD COLUMN free_attempts INTEGER NOT NULL DEFAULT 1;
    END IF;
END $$;

-- 4. Enable Row Level Security (RLS) on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Allow users to update their own profile (non-sensitive fields only)
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 5. Database-level protection: Prevent regular users from modifying role, credits, or free_attempts.
-- Modifications to these sensitive fields can only be performed by service_role (server-side API path) or direct SQL Editor execution.

CREATE OR REPLACE FUNCTION protect_profile_sensitive_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- If invoked by an authenticated or anon client user, block changes to role, credits, or free_attempts
  IF (auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Users are not allowed to modify their own role.';
    END IF;

    IF NEW.credits IS DISTINCT FROM OLD.credits THEN
      RAISE EXCEPTION 'Users are not allowed to modify their own credits.';
    END IF;

    IF NEW.free_attempts IS DISTINCT FROM OLD.free_attempts THEN
      RAISE EXCEPTION 'Users are not allowed to modify their free_attempts.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on profiles table
DROP TRIGGER IF EXISTS tr_protect_profile_role ON profiles;
DROP TRIGGER IF EXISTS tr_protect_profile_sensitive_fields ON profiles;
CREATE TRIGGER tr_protect_profile_sensitive_fields
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION protect_profile_sensitive_fields();

-- Example query to set a user as admin or add credits in Supabase SQL Editor (replace with actual user ID):
-- UPDATE profiles SET role = 'admin', credits = 100 WHERE id = 'user-uuid-here';
