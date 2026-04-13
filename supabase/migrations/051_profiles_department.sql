-- ─────────────────────────────────────────────────────────────────────────────
-- 051: Ensure profiles.department column exists (already in 001, safe to re-run).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS department TEXT;
