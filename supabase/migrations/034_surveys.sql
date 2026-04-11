-- Migration 034: align survey question_type values to new spec + add anonymous insert policy
-- Tables already exist from 027/028; this migration is purely additive/corrective.

-- 1. Drop old check constraint FIRST so the UPDATE doesn't violate it
ALTER TABLE survey_questions DROP CONSTRAINT IF EXISTS survey_questions_question_type_check;

-- 2. Update question_type values to new canonical names
UPDATE survey_questions SET question_type = 'scale_1_5' WHERE question_type = 'scale5';
UPDATE survey_questions SET question_type = 'yes_no'    WHERE question_type = 'yesno';

-- 3. Add new check constraint with updated allowed values
ALTER TABLE survey_questions
  ADD CONSTRAINT survey_questions_question_type_check
  CHECK (question_type IN ('scale_1_5', 'yes_no', 'text'));

-- 4. Add anonymous INSERT policy for survey_responses (unauthenticated form submissions)
DROP POLICY IF EXISTS "public submit responses" ON survey_responses;
CREATE POLICY "public submit responses" ON survey_responses
  FOR INSERT WITH CHECK (true);

-- 5. Ensure survey_templates readable by anyone (needed for /survey/:token page)
DROP POLICY IF EXISTS "Public read survey templates" ON survey_templates;
CREATE POLICY "Public read survey templates" ON survey_templates
  FOR SELECT USING (true);

-- 6. Ensure questions readable by anyone (public survey form needs them)
DROP POLICY IF EXISTS "School members view questions" ON survey_questions;
DROP POLICY IF EXISTS "anyone reads questions by template" ON survey_questions;
CREATE POLICY "anyone reads questions by template" ON survey_questions
  FOR SELECT USING (true);
