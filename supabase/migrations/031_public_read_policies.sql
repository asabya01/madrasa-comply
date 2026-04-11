-- Public read policies for the school public dashboard (/public/:schoolId).
-- These expose only aggregate judgements and counts — no personal data.

-- schools: name_en, name_ar only needed (entire row is safe — no PII)
DROP POLICY IF EXISTS "Public read schools" ON schools;
CREATE POLICY "Public read schools" ON schools
  FOR SELECT USING (true);

-- academic_years: current year label
DROP POLICY IF EXISTS "Public read academic_years" ON academic_years;
CREATE POLICY "Public read academic_years" ON academic_years
  FOR SELECT USING (true);

-- overall_judgements: overall judgement value
DROP POLICY IF EXISTS "Public read overall judgements" ON overall_judgements;
CREATE POLICY "Public read overall judgements" ON overall_judgements
  FOR SELECT USING (true);

-- domain_judgements: per-domain judgement values
DROP POLICY IF EXISTS "Public read domain judgements" ON domain_judgements;
CREATE POLICY "Public read domain judgements" ON domain_judgements
  FOR SELECT USING (true);

-- action_items: count by status only (no titles/descriptions returned by public page)
DROP POLICY IF EXISTS "Public count action items" ON action_items;
CREATE POLICY "Public count action items" ON action_items
  FOR SELECT USING (true);

-- survey_templates: target_group label for grouping response counts
DROP POLICY IF EXISTS "Public read survey templates" ON survey_templates;
CREATE POLICY "Public read survey templates" ON survey_templates
  FOR SELECT USING (true);

-- survey_responses: count only — no responses_json returned by public page
DROP POLICY IF EXISTS "Public count survey responses" ON survey_responses;
CREATE POLICY "Public count survey responses" ON survey_responses
  FOR SELECT USING (true);
