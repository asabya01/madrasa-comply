-- 048: Add education_cycle column to schools with valid check constraint
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS education_cycle TEXT
    CHECK (education_cycle IN (
      'primary', 'middle', 'secondary', 'primary_middle',
      'middle_secondary', 'full_cycle'
    ));
