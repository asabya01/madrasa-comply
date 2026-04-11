-- ─────────────────────────────────────────────────────────────────────────────
-- 019_schools_oaaaqa_fields.sql
-- Add oaaaqa_code and education_cycle columns to schools.
-- Extend school_type constraint to include 'government' (Omani context).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE schools ADD COLUMN IF NOT EXISTS oaaaqa_code    TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS education_cycle TEXT;

-- Extend school_type to include 'government' alongside existing public/private
ALTER TABLE schools DROP CONSTRAINT IF EXISTS schools_school_type_check;
ALTER TABLE schools ADD CONSTRAINT schools_school_type_check
  CHECK (school_type IN ('public', 'private', 'government'));
