-- ─────────────────────────────────────────────────────────────────────────────
-- 050: Cohort breakdown (gender/nationality), survey respondent metadata,
--      chain push source column.
-- Safe to re-run (IF NOT EXISTS throughout).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Student performance — cohort breakdown columns ────────────────────

ALTER TABLE student_performance
  ADD COLUMN IF NOT EXISTS gender TEXT
    CHECK (gender IN ('male', 'female', 'mixed')) DEFAULT 'mixed';
ALTER TABLE student_performance
  ADD COLUMN IF NOT EXISTS nationality TEXT
    CHECK (nationality IN ('omani', 'non_omani', 'mixed')) DEFAULT 'mixed';
ALTER TABLE student_performance
  ADD COLUMN IF NOT EXISTS total_students_male INTEGER;
ALTER TABLE student_performance
  ADD COLUMN IF NOT EXISTS total_students_female INTEGER;
ALTER TABLE student_performance
  ADD COLUMN IF NOT EXISTS students_at_75_male INTEGER;
ALTER TABLE student_performance
  ADD COLUMN IF NOT EXISTS students_at_75_female INTEGER;
ALTER TABLE student_performance
  ADD COLUMN IF NOT EXISTS total_students_omani INTEGER;
ALTER TABLE student_performance
  ADD COLUMN IF NOT EXISTS total_students_non_omani INTEGER;
ALTER TABLE student_performance
  ADD COLUMN IF NOT EXISTS students_at_75_omani INTEGER;
ALTER TABLE student_performance
  ADD COLUMN IF NOT EXISTS students_at_75_non_omani INTEGER;

-- ─── 2. Survey responses — respondent metadata ────────────────────────────

ALTER TABLE survey_responses
  ADD COLUMN IF NOT EXISTS respondent_name TEXT;
ALTER TABLE survey_responses
  ADD COLUMN IF NOT EXISTS respondent_type TEXT
    CHECK (respondent_type IN ('parent', 'student', 'staff', 'other'))
    DEFAULT 'other';
ALTER TABLE survey_responses
  ADD COLUMN IF NOT EXISTS respondent_email TEXT;

-- ─── 3. Action items — push source column ────────────────────────────────

ALTER TABLE action_items
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
