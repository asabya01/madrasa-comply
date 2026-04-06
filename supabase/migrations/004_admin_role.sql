-- Migration 004: Admin role, email column, and admin-bypass RLS policies
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/qfrvyeuzhobacdhqyjcw/sql

-- ── 1. Add admin to role constraint ──────────────────────────────────────────
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'super_admin', 'principal', 'vice_principal', 'quality_coordinator', 'teacher'));

-- ── 2. Add email column to profiles (synced at registration) ─────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;

-- ── 3. SECURITY DEFINER function to check admin without RLS recursion ─────────
-- Uses SECURITY DEFINER so it runs as postgres (bypasses RLS on the profiles
-- table itself) — avoids the infinite-recursion bug from self-referential policies.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ── 4. Profiles: replace narrow own-row policies with admin-aware ones ────────
DROP POLICY IF EXISTS "Users read own profile"   ON profiles;
DROP POLICY IF EXISTS "Users update own profile" ON profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON profiles;
DROP POLICY IF EXISTS "Profiles access"          ON profiles;

CREATE POLICY "Profiles access" ON profiles
  FOR ALL
  USING  (id = auth.uid() OR is_admin())
  WITH CHECK (id = auth.uid() OR is_admin());

-- ── 5. Schools: admin sees / manages all ─────────────────────────────────────
DROP POLICY IF EXISTS "Schools manage own school" ON schools;
DROP POLICY IF EXISTS "Schools read all"          ON schools;
DROP POLICY IF EXISTS "Schools access"            ON schools;
DROP POLICY IF EXISTS "Principal can update own school" ON schools;

CREATE POLICY "Schools access" ON schools
  FOR ALL
  USING (
    id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_admin()
  );

-- ── 6. All school-scoped tables: admin sees everything ───────────────────────
-- indicator_ratings
DROP POLICY IF EXISTS "Schools manage own ratings" ON indicator_ratings;
CREATE POLICY "Schools manage own ratings" ON indicator_ratings
  FOR ALL
  USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_admin()
  );

-- action_items
DROP POLICY IF EXISTS "Schools manage own actions" ON action_items;
CREATE POLICY "Schools manage own actions" ON action_items
  FOR ALL
  USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_admin()
  );

-- evidence_files
DROP POLICY IF EXISTS "Schools manage own evidence" ON evidence_files;
CREATE POLICY "Schools manage own evidence" ON evidence_files
  FOR ALL
  USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_admin()
  );

-- evidence_indicator_links
DROP POLICY IF EXISTS "Schools manage own evidence links" ON evidence_indicator_links;
CREATE POLICY "Schools manage own evidence links" ON evidence_indicator_links
  FOR ALL
  USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_admin()
  );

-- audit_settings
DROP POLICY IF EXISTS "Schools manage own audit settings" ON audit_settings;
CREATE POLICY "Schools manage own audit settings" ON audit_settings
  FOR ALL
  USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_admin()
  );

-- audit_checklist_items
DROP POLICY IF EXISTS "Schools manage own checklist" ON audit_checklist_items;
CREATE POLICY "Schools manage own checklist" ON audit_checklist_items
  FOR ALL
  USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_admin()
  );

-- ── 7. Promote an existing user to admin ─────────────────────────────────────
-- Replace the email below with your admin account email, then run this line:
-- UPDATE profiles SET role = 'admin' WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@example.com');
