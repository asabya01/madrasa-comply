-- ─────────────────────────────────────────────────────────────────────────────
-- 015_judgement_tables.sql
-- Adds missing columns to the judgement tables created in 012.
-- standard_judgements, domain_judgements, overall_judgements already exist;
-- this migration brings them to the schema specified in BuildReference.md §4.1.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── domain_judgements: add trace_json and limiting_standard ──────────────────
ALTER TABLE domain_judgements
  ADD COLUMN IF NOT EXISTS trace_json       JSONB,
  ADD COLUMN IF NOT EXISTS limiting_standard TEXT;

-- ── overall_judgements: add trace_json ───────────────────────────────────────
ALTER TABLE overall_judgements
  ADD COLUMN IF NOT EXISTS trace_json JSONB;

-- ── indexes for common query patterns ────────────────────────────────────────
-- standard_judgements: school + year lookups
CREATE INDEX IF NOT EXISTS idx_standard_judgements_school_year
  ON standard_judgements (school_id, academic_year);

-- domain_judgements: school + year lookups
CREATE INDEX IF NOT EXISTS idx_domain_judgements_school_year
  ON domain_judgements (school_id, academic_year);

-- overall_judgements: school + year lookups
CREATE INDEX IF NOT EXISTS idx_overall_judgements_school_year
  ON overall_judgements (school_id, academic_year);
