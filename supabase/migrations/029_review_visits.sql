-- review_visits already exists (025_review_governance.sql).
-- This migration adds progress_reports and the progress-reports storage bucket.

-- ─── progress_reports ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS progress_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id),
  review_visit_id  UUID REFERENCES review_visits(id),
  academic_year    TEXT,
  content_json     JSONB,
  generated_at     TIMESTAMPTZ,
  submitted_at     TIMESTAMPTZ,
  file_path        TEXT,
  UNIQUE (review_visit_id)
);

ALTER TABLE progress_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School members" ON progress_reports;
CREATE POLICY "School members" ON progress_reports
  FOR ALL USING (school_id = ANY(get_my_school_ids()));

-- ─── Progress reports storage bucket ─────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'progress-reports',
  'progress-reports',
  FALSE,
  52428800,
  ARRAY['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "progress_objects_select" ON storage.objects;
CREATE POLICY "progress_objects_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'progress-reports'
    AND EXISTS (
      SELECT 1 FROM school_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.status = 'active'
        AND (storage.foldername(name))[1] = sm.school_id::text
    )
  );
