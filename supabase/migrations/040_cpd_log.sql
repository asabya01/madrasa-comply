-- 040_cpd_log.sql
-- Teacher CPD log

CREATE TABLE IF NOT EXISTS cpd_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  title         TEXT NOT NULL,
  provider      TEXT,
  cpd_date      DATE NOT NULL,
  hours         NUMERIC(4,1) NOT NULL DEFAULT 1,
  category      TEXT CHECK (category IN (
    'subject_knowledge','pedagogy','leadership',
    'safeguarding','digital','assessment','other'
  )),
  notes         TEXT,
  evidence_path TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cpd_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school members" ON cpd_entries
  FOR ALL USING (school_id = ANY(get_my_school_ids()));

CREATE INDEX IF NOT EXISTS idx_cpd_entries_teacher
  ON cpd_entries (school_id, teacher_id, academic_year);

-- Storage bucket for CPD evidence files
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('cpd-evidence', 'cpd-evidence', false, 10485760)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "cpd-evidence: authenticated upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cpd-evidence');

CREATE POLICY "cpd-evidence: authenticated read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'cpd-evidence');

CREATE POLICY "cpd-evidence: authenticated delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'cpd-evidence');
