-- ─────────────────────────────────────────────────────────────────────────────
-- 025_review_governance.sql
-- Review governance columns + review_visits table.
-- FR-GOV-01, FR-GOV-02, FR-GOV-04, FR-FUP-01, FR-FUP-02
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. academic_years — external review mode + training date ────────────────

ALTER TABLE academic_years
  ADD COLUMN IF NOT EXISTS external_review_mode  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS review_training_date  DATE;

-- ─── 2. schools — social media URLs ─────────────────────────────────────────

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS social_media_urls JSONB;

-- ─── 3. review_visits ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS review_visits (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id                UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  visit_date               DATE NOT NULL,
  visit_type               TEXT NOT NULL CHECK (visit_type IN ('external_review','follow_up_1','follow_up_2')),
  overall_judgement        INT  CHECK (overall_judgement BETWEEN 1 AND 5),
  domain_judgements_json   JSONB,
  reviewer_recommendations TEXT,
  followup_deadline        DATE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE review_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "review_visits_school_access" ON review_visits;
CREATE POLICY "review_visits_school_access" ON review_visits
  FOR ALL USING (school_id = ANY(get_my_school_ids()));
