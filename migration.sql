-- Migration to add role and free_attempts to profiles table in Supabase

-- Add role column to profiles table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'role'
    ) THEN
        ALTER TABLE profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));
    END IF;
END $$;

-- Add credits column to profiles table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'credits'
    ) THEN
        ALTER TABLE profiles ADD COLUMN credits INTEGER NOT NULL DEFAULT 0;
    END IF;
END $$;

-- Add free_attempts column to profiles table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'free_attempts'
    ) THEN
        ALTER TABLE profiles ADD COLUMN free_attempts INTEGER NOT NULL DEFAULT 1;
    END IF;
END $$;

-- Database-level protection: Prevent regular users from updating their own role column
-- Role updates can only be performed by service_role (server-side admin key) or direct SQL Editor execution.

CREATE OR REPLACE FUNCTION protect_profile_role()
RETURNS TRIGGER AS $$
BEGIN
  -- If role is being changed by an authenticated or anon client user, block the change
  IF NEW.role IS DISTINCT FROM OLD.role AND (auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Users are not allowed to modify their own role.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger if it does not exist
DROP TRIGGER IF EXISTS tr_protect_profile_role ON profiles;
CREATE TRIGGER tr_protect_profile_role
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION protect_profile_role();

-- Example query to set a user as admin (replace with actual user ID):
-- UPDATE profiles SET role = 'admin' WHERE id = 'user-uuid-here';
