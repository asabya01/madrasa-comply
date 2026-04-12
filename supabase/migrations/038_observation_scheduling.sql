-- 038_observation_scheduling.sql
-- Add scheduling fields to classroom_observations

ALTER TABLE classroom_observations
  ADD COLUMN IF NOT EXISTS scheduled_date    DATE,
  ADD COLUMN IF NOT EXISTS assigned_observer UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS obs_status        TEXT NOT NULL DEFAULT 'completed'
    CHECK (obs_status IN ('scheduled', 'completed', 'cancelled'));

-- Partial index — only useful when a scheduled date is present
CREATE INDEX IF NOT EXISTS idx_observations_scheduled_date
  ON classroom_observations (school_id, scheduled_date)
  WHERE scheduled_date IS NOT NULL;
