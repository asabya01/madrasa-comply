-- ============================================================
-- MIGRATION 014: PHASE 2 SELF-EVALUATION TABLES
-- Ensures all 5 core self-evaluation tables exist with the
-- correct schema. Most already exist from earlier migrations;
-- CREATE TABLE IF NOT EXISTS makes all blocks safe to re-run.
-- New addition: evidence_folders + folder_id on evidence_files.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. INDICATOR RATINGS  (school-level self-evaluation)
--    Already created in migration 001. Listed here for
--    completeness; the IF NOT EXISTS guard makes it a no-op.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS indicator_ratings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  indicator_id     TEXT NOT NULL REFERENCES indicators(id),
  academic_year    TEXT NOT NULL,
  rating           INT CHECK (rating BETWEEN 1 AND 5),
  strengths        TEXT,
  improvement_areas TEXT,
  self_eval_notes  TEXT,
  rated_by         UUID REFERENCES profiles(id),
  rated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, indicator_id, academic_year)
);

ALTER TABLE indicator_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School data isolation" ON indicator_ratings;
CREATE POLICY "School data isolation" ON indicator_ratings
  FOR ALL USING (school_id = ANY(get_my_school_ids()));

-- ─────────────────────────────────────────────────────────────
-- 2. TEACHER INDICATOR RATINGS  (Domain 3 — teacher level)
--    Already created in migration 012. No-op guard included.
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
-- 3. CLASSROOM OBSERVATIONS
--    Already created in migration 012. No-op guard included.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classroom_observations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  observer_id      UUID NOT NULL REFERENCES profiles(id),
  teacher_id       UUID NOT NULL REFERENCES profiles(id),
  class_id         UUID REFERENCES classes(id),
  academic_year_id UUID REFERENCES academic_years(id),
  observed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  domain3_ratings  JSONB NOT NULL DEFAULT '{}',  -- {"3.1.1": 2, "3.2.1": 3, ...}
  qualitative_notes TEXT,
  evidence_files   TEXT[],                        -- storage paths
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE classroom_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School data isolation" ON classroom_observations;
CREATE POLICY "School data isolation" ON classroom_observations
  FOR ALL USING (school_id = ANY(get_my_school_ids()));

-- ─────────────────────────────────────────────────────────────
-- 4. EVIDENCE FOLDERS  (NEW)
--    Organises evidence_files into named folders scoped to a
--    domain, standard, indicator, or free-form category.
--    One folder can span multiple indicators (e.g. "Term 1 Docs").
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evidence_folders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES academic_years(id),
  name             TEXT NOT NULL,
  description      TEXT,
  -- Optional scope — folder may be pinned to a domain/standard/indicator
  domain_id        TEXT REFERENCES domains(id),
  standard_id      TEXT REFERENCES standards(id),
  indicator_id     TEXT REFERENCES indicators(id),
  color            TEXT,                          -- UI colour hex, e.g. '#01696f'
  created_by       UUID REFERENCES profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE evidence_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School data isolation" ON evidence_folders;
CREATE POLICY "School data isolation" ON evidence_folders
  FOR ALL USING (school_id = ANY(get_my_school_ids()));

-- ─────────────────────────────────────────────────────────────
-- 5. EVIDENCE FILES  (already exists — add folder_id column)
--    Already created in migration 001. Adding folder_id FK so
--    files can be optionally organised into a folder.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evidence_files (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  file_name        TEXT NOT NULL,
  file_path        TEXT NOT NULL,
  file_type        TEXT,
  file_size_bytes  BIGINT,
  description      TEXT,
  evidence_date    DATE,
  tags             TEXT[],
  uploaded_by      UUID REFERENCES profiles(id),
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add folder_id if not already present
ALTER TABLE evidence_files
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES evidence_folders(id) ON DELETE SET NULL;

ALTER TABLE evidence_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School data isolation" ON evidence_files;
CREATE POLICY "School data isolation" ON evidence_files
  FOR ALL USING (school_id = ANY(get_my_school_ids()));

-- ─────────────────────────────────────────────────────────────
-- 6. INDEXES for common query patterns
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_indicator_ratings_school_year
  ON indicator_ratings (school_id, academic_year);

CREATE INDEX IF NOT EXISTS idx_evidence_files_school
  ON evidence_files (school_id);

CREATE INDEX IF NOT EXISTS idx_evidence_files_folder
  ON evidence_files (folder_id)
  WHERE folder_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_evidence_folders_school
  ON evidence_folders (school_id);

CREATE INDEX IF NOT EXISTS idx_classroom_observations_school
  ON classroom_observations (school_id);

CREATE INDEX IF NOT EXISTS idx_teacher_ratings_teacher
  ON teacher_indicator_ratings (teacher_id);
