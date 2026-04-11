-- Survey Tables: templates, questions, responses
-- Note: uses TEXT academic_year to match existing codebase pattern

CREATE TABLE survey_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID REFERENCES schools(id) ON DELETE CASCADE,
  academic_year  TEXT,
  name_en        TEXT NOT NULL,
  name_ar        TEXT,
  target_group   TEXT NOT NULL CHECK (target_group IN ('staff','parents','students')),
  share_token    TEXT UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE survey_questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL REFERENCES survey_templates(id) ON DELETE CASCADE,
  question_en   TEXT NOT NULL,
  question_ar   TEXT,
  question_type TEXT NOT NULL CHECK (question_type IN ('scale5','yesno','text')),
  domain_id     TEXT REFERENCES domains(id),
  standard_id   TEXT REFERENCES standards(id),
  sort_order    INTEGER DEFAULT 0
);

CREATE TABLE survey_responses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    UUID NOT NULL REFERENCES survey_templates(id) ON DELETE CASCADE,
  school_id      UUID NOT NULL,
  academic_year  TEXT NOT NULL,
  responses_json JSONB NOT NULL,
  submitted_at   TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE survey_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_questions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School members view templates"
  ON survey_templates FOR SELECT
  USING (school_id IS NULL OR school_id = ANY(get_my_school_ids()));

CREATE POLICY "School admins manage templates"
  ON survey_templates FOR ALL
  USING (school_id = ANY(get_my_school_ids()));

CREATE POLICY "School members view questions"
  ON survey_questions FOR SELECT
  USING (template_id IN (
    SELECT id FROM survey_templates
    WHERE school_id IS NULL OR school_id = ANY(get_my_school_ids())
  ));

CREATE POLICY "School members view responses"
  ON survey_responses FOR SELECT
  USING (school_id = ANY(get_my_school_ids()));
