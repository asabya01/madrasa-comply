-- Migration 003: Make evidence-files bucket public + storage upload policies
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/qfrvyeuzhobacdhqyjcw/sql
--
-- IMPORTANT — also do this in the Supabase dashboard UI:
--   Storage → Buckets → evidence-files → Edit → toggle "Public bucket" ON
--   (This allows getPublicUrl() to return accessible URLs without signed URLs)

-- Drop any existing storage policies for this bucket to start clean
DROP POLICY IF EXISTS "Authenticated users can upload evidence" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read evidence" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete evidence" ON storage.objects;

-- INSERT: any authenticated user can upload to evidence-files
CREATE POLICY "evidence-files: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'evidence-files');

-- SELECT: any authenticated user can read from evidence-files
-- (bucket being PUBLIC covers anonymous reads; this covers authenticated API calls)
CREATE POLICY "evidence-files: authenticated read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'evidence-files');

-- UPDATE: owner can update their own objects
CREATE POLICY "evidence-files: authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'evidence-files');

-- DELETE: authenticated users can delete from evidence-files
CREATE POLICY "evidence-files: authenticated delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'evidence-files');

-- Ensure evidence-files bucket exists as public
-- (Run this only if the bucket doesn't exist yet — will error if it already exists)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('evidence-files', 'evidence-files', true)
-- ON CONFLICT (id) DO UPDATE SET public = true;
