-- 047: Add subscription_expires_at column to schools
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

-- Back-fill: give all existing trial schools a 90-day expiry from now
UPDATE schools
SET subscription_expires_at = now() + interval '90 days'
WHERE subscription_tier = 'trial'
  AND subscription_expires_at IS NULL;
