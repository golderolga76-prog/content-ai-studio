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

-- Example query to set a user as admin (replace with actual user ID or email):
-- UPDATE profiles SET role = 'admin' WHERE id = 'user-uuid-here';
