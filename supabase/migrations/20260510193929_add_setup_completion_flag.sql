-- Add setup completion timestamp to profiles table
ALTER TABLE profiles
ADD COLUMN first_time_setup_completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Mark existing users as setup complete (backward compatibility)
UPDATE profiles
SET first_time_setup_completed_at = COALESCE(updated_at, created_at)
WHERE full_name IS NOT NULL;

-- Create index for faster queries
CREATE INDEX idx_profiles_setup_completed
ON profiles(first_time_setup_completed_at);

-- Add comment for documentation
COMMENT ON COLUMN profiles.first_time_setup_completed_at IS
'Timestamp when user first completed setup. NULL means never completed. Set only once and never updated again.';