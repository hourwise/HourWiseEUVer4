-- Add durable completion timestamp for last-shift onboarding.
ALTER TABLE profiles
ADD COLUMN last_shift_onboarding_completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Backfill users who already have historical work sessions so they do not get
-- redirected into onboarding again after the app starts using the explicit flag.
UPDATE profiles
SET last_shift_onboarding_completed_at = COALESCE(updated_at, created_at, NOW())
WHERE last_shift_onboarding_completed_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM work_sessions
    WHERE work_sessions.user_id = profiles.id
  );

CREATE INDEX idx_profiles_last_shift_onboarding_completed
ON profiles(last_shift_onboarding_completed_at);

COMMENT ON COLUMN profiles.last_shift_onboarding_completed_at IS
'Timestamp when the driver completed the last-shift onboarding step. NULL means it is still required.';
