-- Add semester column to student_performance
ALTER TABLE student_performance
  ADD COLUMN IF NOT EXISTS semester TEXT
    CHECK (semester IN ('semester_1', 'semester_2', 'annual'))
    DEFAULT 'semester_1';

-- Update existing rows so they satisfy the new unique constraint
UPDATE student_performance SET semester = 'semester_1' WHERE semester IS NULL;

-- Drop the old unique constraint (actual name from DB)
ALTER TABLE student_performance
  DROP CONSTRAINT IF EXISTS student_performance_school_id_academic_year_grade_label_sub_key;

-- Also try the name specified in the task spec (in case it exists under that name)
ALTER TABLE student_performance
  DROP CONSTRAINT IF EXISTS student_performance_school_year_grade_subject_key;

-- Add new unique constraint that includes semester
ALTER TABLE student_performance
  ADD CONSTRAINT student_performance_school_year_grade_subject_semester_key
  UNIQUE (school_id, academic_year, grade_label, subject, semester);
