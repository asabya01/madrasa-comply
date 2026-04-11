-- Governance: staff roles register and policy register
-- (User requested 019_ but 019_schools_oaaaqa_fields.sql already exists — numbered 030.)

CREATE TABLE IF NOT EXISTS staff_roles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  job_title        TEXT NOT NULL,
  responsibilities TEXT,
  assigned_user_id UUID REFERENCES profiles(id),
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_register (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  last_review_date DATE,
  file_url         TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE staff_roles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_register ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School members" ON staff_roles
  FOR ALL USING (school_id = ANY(get_my_school_ids()));

CREATE POLICY "School members" ON policy_register
  FOR ALL USING (school_id = ANY(get_my_school_ids()));

-- Policy documents storage bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('policy-documents', 'policy-documents', FALSE, 52428800)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "policy_docs_select" ON storage.objects;
CREATE POLICY "policy_docs_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'policy-documents'
    AND EXISTS (
      SELECT 1 FROM school_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.status  = 'active'
        AND (storage.foldername(name))[1] = sm.school_id::text
    )
  );

DROP POLICY IF EXISTS "policy_docs_insert" ON storage.objects;
CREATE POLICY "policy_docs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'policy-documents');

DROP POLICY IF EXISTS "policy_docs_delete" ON storage.objects;
CREATE POLICY "policy_docs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'policy-documents');
