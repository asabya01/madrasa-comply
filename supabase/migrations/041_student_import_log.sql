-- Student CSV import audit log
CREATE TABLE student_import_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  imported_by   UUID REFERENCES profiles(id),
  row_count     INTEGER NOT NULL DEFAULT 0,
  error_count   INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','done','failed')),
  error_summary JSONB,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE student_import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school members" ON student_import_logs
  FOR ALL USING (school_id = ANY(get_my_school_ids()));
