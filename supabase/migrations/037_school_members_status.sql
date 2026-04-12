-- 036_school_members_status.sql
-- Add status column to school_members for account suspension

ALTER TABLE school_members
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'suspended', 'pending'));

-- Index for filtering active members
CREATE INDEX IF NOT EXISTS idx_school_members_status
  ON school_members (school_id, status);
