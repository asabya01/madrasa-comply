-- 044_appraisal_cycle.sql
-- Teacher Professional Development Review (PDR / Appraisal) cycle

CREATE TABLE IF NOT EXISTS appraisal_cycles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reviewer_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  academic_year  TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','targets_set','midyear_done','complete')),
  overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 4),
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (school_id, teacher_id, academic_year)
);

CREATE TABLE IF NOT EXISTS appraisal_targets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id         UUID NOT NULL REFERENCES appraisal_cycles(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  success_criteria TEXT,
  target_date      DATE,
  category         TEXT CHECK (category IN (
    'teaching_quality','student_outcomes','professional_development',
    'leadership','safeguarding','other'
  )),
  midyear_progress TEXT,
  midyear_rating   INTEGER CHECK (midyear_rating BETWEEN 1 AND 4),
  endyear_evidence TEXT,
  endyear_rating   INTEGER CHECK (endyear_rating BETWEEN 1 AND 4),
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appraisal_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id   UUID NOT NULL REFERENCES appraisal_cycles(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  stage      TEXT CHECK (stage IN ('initial','midyear','endyear')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE appraisal_cycles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE appraisal_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE appraisal_notes   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school members access appraisal_cycles"
  ON appraisal_cycles FOR ALL
  USING (school_id = ANY(get_my_school_ids()));

CREATE POLICY "school members access appraisal_targets"
  ON appraisal_targets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM appraisal_cycles ac
      WHERE ac.id = appraisal_targets.cycle_id
        AND ac.school_id = ANY(get_my_school_ids())
    )
  );

CREATE POLICY "school members access appraisal_notes"
  ON appraisal_notes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM appraisal_cycles ac
      WHERE ac.id = appraisal_notes.cycle_id
        AND ac.school_id = ANY(get_my_school_ids())
    )
  );

CREATE INDEX IF NOT EXISTS idx_appraisal_cycles_school_year
  ON appraisal_cycles(school_id, academic_year);
CREATE INDEX IF NOT EXISTS idx_appraisal_targets_cycle
  ON appraisal_targets(cycle_id);
