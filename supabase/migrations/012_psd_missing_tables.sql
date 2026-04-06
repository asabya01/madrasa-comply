-- ============================================================
-- MIGRATION 012: PSD-REQUIRED TABLES
-- Adds all tables required by OAAAQA PSD Section 6 that are
-- not yet present. Uses CREATE TABLE IF NOT EXISTS throughout —
-- safe to re-run, will never drop existing data.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. ACADEMIC YEARS
--    Multi-year tracking per school. One row = one school year.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academic_years (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  label            TEXT NOT NULL,          -- e.g. '2024-2025'
  start_date       DATE,
  end_date         DATE,
  is_current       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, label)
);

-- Only one current year per school
CREATE UNIQUE INDEX IF NOT EXISTS academic_years_one_current
  ON academic_years (school_id)
  WHERE is_current = TRUE;

ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School data isolation" ON academic_years;
CREATE POLICY "School data isolation" ON academic_years
  FOR ALL USING (school_id = ANY(get_my_school_ids()));

-- ─────────────────────────────────────────────────────────────
-- 2. GRADES
--    Grade structure per school (Grade 1 – Grade 12 etc.)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grades (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,               -- e.g. 'Grade 5'
  cycle       TEXT CHECK (cycle IN ('primary','intermediate','secondary')),
  sort_order  INT NOT NULL DEFAULT 0,
  UNIQUE (school_id, label)
);

ALTER TABLE grades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School data isolation" ON grades;
CREATE POLICY "School data isolation" ON grades
  FOR ALL USING (school_id = ANY(get_my_school_ids()));

-- ─────────────────────────────────────────────────────────────
-- 3. CLASSES
--    Teacher-subject-class assignments per academic year.
--    Foundation for Domain 3 teacher-level ratings.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES academic_years(id),
  grade_id         UUID REFERENCES grades(id),
  label            TEXT NOT NULL,           -- e.g. '5-A'
  teacher_id       UUID REFERENCES profiles(id),
  subject          TEXT NOT NULL,           -- e.g. 'Mathematics'
  student_count    INT DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School data isolation" ON classes;
CREATE POLICY "School data isolation" ON classes
  FOR ALL USING (school_id = ANY(get_my_school_ids()));

-- ─────────────────────────────────────────────────────────────
-- 4. TEACHER INDICATOR RATINGS (Domain 3 — teacher level)
--    Each teacher rates all 20 Domain 3 indicators per class,
--    per term. Submitted → reviewed by HOD.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_indicator_ratings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  class_id         UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  indicator_id     TEXT NOT NULL REFERENCES indicators(id),
  academic_year_id UUID REFERENCES academic_years(id),
  term             TEXT CHECK (term IN ('term_1','term_2','term_3','annual')) NOT NULL DEFAULT 'annual',
  rating           INT CHECK (rating BETWEEN 1 AND 5),
  self_assessment  TEXT,
  submitted_at     TIMESTAMPTZ,
  reviewed_by      UUID REFERENCES profiles(id),
  reviewed_at      TIMESTAMPTZ,
  status           TEXT CHECK (status IN ('draft','submitted','reviewed')) NOT NULL DEFAULT 'draft',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (teacher_id, class_id, indicator_id, term)
);

ALTER TABLE teacher_indicator_ratings ENABLE ROW LEVEL SECURITY;

-- Teachers see their own; HOD/Admin see all in their school
DROP POLICY IF EXISTS "Teacher ratings isolation" ON teacher_indicator_ratings;
CREATE POLICY "Teacher ratings isolation" ON teacher_indicator_ratings
  FOR ALL USING (
    teacher_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM school_members sm
      JOIN classes c ON c.id = teacher_indicator_ratings.class_id
      WHERE sm.user_id = auth.uid()
        AND sm.school_id = c.school_id
        AND sm.role IN ('school_admin','principal','vice_principal','head_of_department','quality_coordinator')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 5. CLASSROOM OBSERVATIONS
--    HOD or Admin records a formal observation against a
--    specific teacher + class. Ratings stored as JSONB.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classroom_observations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  observer_id      UUID NOT NULL REFERENCES profiles(id),
  teacher_id       UUID NOT NULL REFERENCES profiles(id),
  class_id         UUID REFERENCES classes(id),
  academic_year_id UUID REFERENCES academic_years(id),
  observed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  domain3_ratings  JSONB NOT NULL DEFAULT '{}', -- {"3.1.1": 2, "3.2.1": 3, ...}
  qualitative_notes TEXT,
  evidence_files   TEXT[],                      -- storage paths
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE classroom_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School data isolation" ON classroom_observations;
CREATE POLICY "School data isolation" ON classroom_observations
  FOR ALL USING (school_id = ANY(get_my_school_ids()));

-- ─────────────────────────────────────────────────────────────
-- 6. STUDENT PERFORMANCE
--    Proficiency rate data (PSD Section 4.3, Table 8).
--    proficiency_rate is auto-calculated from total_students
--    and students_at_75.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_performance (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES academic_years(id),
  academic_year    TEXT,                    -- fallback text label
  grade_id         UUID REFERENCES grades(id),
  grade_label      TEXT,                    -- fallback text label
  subject          TEXT NOT NULL
    CHECK (subject IN (
      'Islamic Education',
      'Arabic Language',
      'English Language',
      'Mathematics',
      'Science',
      'Social Studies'
    )),
  total_students   INT NOT NULL CHECK (total_students >= 0),
  students_at_75   INT NOT NULL CHECK (students_at_75 >= 0),
  national_average NUMERIC(5,2),           -- school's national exam avg (optional)
  national_benchmark NUMERIC(5,2),         -- system-wide avg for Table 7 comparison
  entered_by       UUID REFERENCES profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, academic_year, grade_label, subject)
);

-- Computed proficiency rate as a generated column
-- (PostgreSQL 12+ required; Supabase supports this)
ALTER TABLE student_performance
  ADD COLUMN IF NOT EXISTS proficiency_rate NUMERIC(5,2)
  GENERATED ALWAYS AS (
    CASE WHEN total_students > 0
      THEN ROUND((students_at_75::NUMERIC / total_students) * 100, 2)
      ELSE 0
    END
  ) STORED;

ALTER TABLE student_performance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School data isolation" ON student_performance;
CREATE POLICY "School data isolation" ON student_performance
  FOR ALL USING (school_id = ANY(get_my_school_ids()));

-- ─────────────────────────────────────────────────────────────
-- 7. ATTENDANCE RECORDS
--    School-wide attendance per grade per year (Table 11).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id      UUID REFERENCES academic_years(id),
  academic_year         TEXT,
  grade_id              UUID REFERENCES grades(id),
  grade_label           TEXT,
  total_possible_days   INT NOT NULL CHECK (total_possible_days > 0),
  total_attended_days   INT NOT NULL CHECK (total_attended_days >= 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, academic_year, grade_label)
);

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS attendance_rate NUMERIC(5,2)
  GENERATED ALWAYS AS (
    CASE WHEN total_possible_days > 0
      THEN ROUND((total_attended_days::NUMERIC / total_possible_days) * 100, 2)
      ELSE 0
    END
  ) STORED;

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School data isolation" ON attendance_records;
CREATE POLICY "School data isolation" ON attendance_records
  FOR ALL USING (school_id = ANY(get_my_school_ids()));

-- ─────────────────────────────────────────────────────────────
-- 8. STORED JUDGEMENTS
--    Standard, domain, and overall judgements stored for
--    reporting and 3-year trend tracking.
--    Still computed client-side; these are cached snapshots.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS standard_judgements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year     TEXT NOT NULL,
  standard_id       TEXT NOT NULL REFERENCES standards(id),
  judgement         INT CHECK (judgement BETWEEN 1 AND 5),
  calculated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  calculation_notes TEXT,
  UNIQUE (school_id, academic_year, standard_id)
);

ALTER TABLE standard_judgements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "School data isolation" ON standard_judgements;
CREATE POLICY "School data isolation" ON standard_judgements
  FOR ALL USING (school_id = ANY(get_my_school_ids()));

CREATE TABLE IF NOT EXISTS domain_judgements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  domain_id     TEXT NOT NULL REFERENCES domains(id),
  judgement     INT CHECK (judgement BETWEEN 1 AND 5),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, academic_year, domain_id)
);

ALTER TABLE domain_judgements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "School data isolation" ON domain_judgements;
CREATE POLICY "School data isolation" ON domain_judgements
  FOR ALL USING (school_id = ANY(get_my_school_ids()));

CREATE TABLE IF NOT EXISTS overall_judgements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  judgement     INT CHECK (judgement BETWEEN 1 AND 5),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes         TEXT,
  UNIQUE (school_id, academic_year)
);

ALTER TABLE overall_judgements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "School data isolation" ON overall_judgements;
CREATE POLICY "School data isolation" ON overall_judgements
  FOR ALL USING (school_id = ANY(get_my_school_ids()));

-- ─────────────────────────────────────────────────────────────
-- 9. HELPER: seed a default academic year for existing schools
--    that do not yet have one. Uses '2024-2025' as default.
-- ─────────────────────────────────────────────────────────────
INSERT INTO academic_years (school_id, label, is_current)
SELECT s.id, '2024-2025', TRUE
FROM schools s
WHERE NOT EXISTS (
  SELECT 1 FROM academic_years ay WHERE ay.school_id = s.id
);
