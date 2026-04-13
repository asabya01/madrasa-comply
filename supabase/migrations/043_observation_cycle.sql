-- 043_observation_cycle.sql
-- Add cycle tracking and observer FK to classroom_observations

ALTER TABLE classroom_observations
  ADD COLUMN IF NOT EXISTS cycle_number    INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_obs_id   UUID REFERENCES classroom_observations(id)
                                           ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS observer_id     UUID REFERENCES profiles(id)
                                           ON DELETE SET NULL;

-- Index for chaining observations
CREATE INDEX IF NOT EXISTS idx_obs_parent
  ON classroom_observations(parent_obs_id)
  WHERE parent_obs_id IS NOT NULL;
