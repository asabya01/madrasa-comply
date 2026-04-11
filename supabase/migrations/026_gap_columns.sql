-- Grade descriptors per indicator (from Ofsted/Derventio inter-rater reliability pattern)
ALTER TABLE indicators
  ADD COLUMN IF NOT EXISTS descriptor_outstanding_en TEXT,
  ADD COLUMN IF NOT EXISTS descriptor_good_en TEXT,
  ADD COLUMN IF NOT EXISTS descriptor_satisfactory_en TEXT,
  ADD COLUMN IF NOT EXISTS descriptor_unsatisfactory_en TEXT,
  ADD COLUMN IF NOT EXISTS descriptor_nui_en TEXT,
  ADD COLUMN IF NOT EXISTS descriptor_outstanding_ar TEXT,
  ADD COLUMN IF NOT EXISTS descriptor_good_ar TEXT,
  ADD COLUMN IF NOT EXISTS descriptor_satisfactory_ar TEXT,
  ADD COLUMN IF NOT EXISTS descriptor_unsatisfactory_ar TEXT,
  ADD COLUMN IF NOT EXISTS descriptor_nui_ar TEXT;

-- Next Steps field per indicator rating (Derventio model — feeds into improvement plan)
ALTER TABLE indicator_ratings
  ADD COLUMN IF NOT EXISTS next_steps TEXT;

-- Self-Evaluation Team designation (OAAAQA Section 7.6 / FR-GOV-14)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_sed_team BOOLEAN DEFAULT false;
