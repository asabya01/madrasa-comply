-- Migration 035: Governance registers
-- staff_roles already exists from 030; add updated_at + create school_policies.

ALTER TABLE staff_roles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS school_policies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID REFERENCES schools(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  last_review_date DATE,
  file_path       TEXT,
  file_name       TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE school_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "school owns school_policies" ON school_policies;
CREATE POLICY "school owns school_policies" ON school_policies
  USING (school_id = ANY(get_my_school_ids()))
  WITH CHECK (school_id = ANY(get_my_school_ids()));

-- Storage policies for policy-documents bucket (bucket already exists from 030)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('policies', 'policies', false, 52428800, ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "school policies upload" ON storage.objects;
CREATE POLICY "school policies upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'policies' AND
    (storage.foldername(name))[1] = ANY(
      SELECT id::text FROM schools WHERE id = ANY(get_my_school_ids())
    )
  );

DROP POLICY IF EXISTS "school policies select" ON storage.objects;
CREATE POLICY "school policies select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'policies' AND
    (storage.foldername(name))[1] = ANY(
      SELECT id::text FROM schools WHERE id = ANY(get_my_school_ids())
    )
  );
