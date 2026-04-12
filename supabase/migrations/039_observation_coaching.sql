-- 039_observation_coaching.sql
-- Add post-observation coaching workflow fields to classroom_observations

ALTER TABLE classroom_observations
  ADD COLUMN IF NOT EXISTS coaching_notes    TEXT,
  ADD COLUMN IF NOT EXISTS teacher_response  TEXT,
  ADD COLUMN IF NOT EXISTS reobserve_date    DATE,
  ADD COLUMN IF NOT EXISTS coaching_status   TEXT NOT NULL DEFAULT 'none'
    CHECK (coaching_status IN ('none','feedback_given','teacher_responded','closed'));

CREATE INDEX IF NOT EXISTS idx_observations_coaching_status
  ON classroom_observations (school_id, coaching_status)
  WHERE coaching_status <> 'none';
