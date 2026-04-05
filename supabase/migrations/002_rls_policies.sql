-- Migration 002: RLS policies for all write tables + storage
-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/qfrvyeuzhobacdhqyjcw/sql

-- ============================================================
-- STORAGE: evidence-files bucket
-- ============================================================
CREATE POLICY "Authenticated users can upload evidence"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'evidence-files');

CREATE POLICY "Authenticated users can read evidence"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'evidence-files');

CREATE POLICY "Authenticated users can delete evidence"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'evidence-files');

-- ============================================================
-- audit_settings
-- ============================================================
CREATE POLICY "Schools manage own audit settings"
  ON audit_settings FOR ALL
  USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

-- ============================================================
-- indicator_ratings
-- ============================================================
CREATE POLICY "Schools manage own ratings"
  ON indicator_ratings FOR ALL
  USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

-- ============================================================
-- action_items
-- ============================================================
CREATE POLICY "Schools manage own actions"
  ON action_items FOR ALL
  USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

-- ============================================================
-- evidence_files
-- ============================================================
CREATE POLICY "Schools manage own evidence"
  ON evidence_files FOR ALL
  USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

-- ============================================================
-- evidence_indicator_links
-- ============================================================
CREATE POLICY "Schools manage own evidence links"
  ON evidence_indicator_links FOR ALL
  USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

-- ============================================================
-- audit_checklist_items
-- ============================================================
CREATE POLICY "Schools manage own checklist"
  ON audit_checklist_items FOR ALL
  USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

-- ============================================================
-- self_evaluation_narratives (if table exists)
-- ============================================================
CREATE POLICY "Schools manage own narratives"
  ON self_evaluation_narratives FOR ALL
  USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

-- ============================================================
-- schools (allow principal to update own school)
-- ============================================================
CREATE POLICY "Principal can update own school"
  ON schools FOR UPDATE
  USING (
    id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

-- ============================================================
-- profiles: fix self-referential RLS (drop recursive policy,
-- add simple own-row policies)
-- ============================================================
DROP POLICY IF EXISTS "Users see own school profiles" ON profiles;

CREATE POLICY "Users read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow onboarding to insert new profile row
CREATE POLICY "Users insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
