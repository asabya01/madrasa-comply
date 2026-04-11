-- ─────────────────────────────────────────────────────────────────────────────
-- 024_ai_feedback_update.sql
-- Adds rate-limiting / acceptance tracking columns to ai_feedback.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ai_feedback
  ADD COLUMN IF NOT EXISTS accepted      BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_by    UUID      REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS prompt_text   TEXT,
  ADD COLUMN IF NOT EXISTS response_text TEXT;

-- Index for per-user rate-limit query (count by user + day)
-- NB: the timestamp column in ai_feedback is generated_at (not created_at)
CREATE INDEX IF NOT EXISTS idx_ai_feedback_created_by_at
  ON ai_feedback (created_by, generated_at);
