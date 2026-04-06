-- Migration 010: Explicit super-admin RLS bypass
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/qfrvyeuzhobacdhqyjcw/sql
--
-- Confirms and hardens the is_admin() SECURITY DEFINER function used by
-- all RLS policies. Super admins bypass every school-scoped policy via
-- OR is_admin() which reads profiles.is_super_admin.
--
-- Also adds missing is_admin() bypass to school_members UPDATE/DELETE
-- so super admins can approve/reject join requests across all schools.

-- ── Re-confirm is_admin() reads is_super_admin ────────────────────────────────
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── Ensure get_my_school_ids() is correct ────────────────────────────────────
CREATE OR REPLACE FUNCTION get_my_school_ids()
RETURNS uuid[] AS $$
  SELECT ARRAY(
    SELECT school_id FROM school_members
    WHERE  user_id = auth.uid()
      AND  status  = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── school_members: super admin can manage members across all schools ─────────
-- Drop existing policies and recreate with explicit is_admin() bypass

DROP POLICY IF EXISTS "sm_select" ON school_members;
DROP POLICY IF EXISTS "sm_insert" ON school_members;
DROP POLICY IF EXISTS "sm_update" ON school_members;
DROP POLICY IF EXISTS "sm_delete" ON school_members;

CREATE POLICY "sm_select" ON school_members
  FOR SELECT USING (school_id = ANY(get_my_school_ids()) OR is_admin());

CREATE POLICY "sm_insert" ON school_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR school_id = ANY(get_my_school_ids())
    OR is_admin()
  );

CREATE POLICY "sm_update" ON school_members
  FOR UPDATE USING (school_id = ANY(get_my_school_ids()) OR is_admin());

CREATE POLICY "sm_delete" ON school_members
  FOR DELETE USING (school_id = ANY(get_my_school_ids()) OR is_admin());

-- ── profiles: super admin can read/write all profiles ────────────────────────
DROP POLICY IF EXISTS "profiles_self_or_admin"  ON profiles;
DROP POLICY IF EXISTS "profiles_self_insert"    ON profiles;
DROP POLICY IF EXISTS "profiles_self_update"    ON profiles;
DROP POLICY IF EXISTS "profiles_admin_delete"   ON profiles;

CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR is_admin()
    OR id = ANY(
      SELECT user_id FROM school_members
      WHERE  school_id = ANY(get_my_school_ids())
        AND  status = 'active'
    )
  );

CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid() OR is_admin());

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING  (id = auth.uid() OR is_admin())
  WITH CHECK        (id = auth.uid() OR is_admin());

CREATE POLICY "profiles_delete" ON profiles
  FOR DELETE USING (is_admin());

-- ── schools: super admin can manage all schools ───────────────────────────────
DROP POLICY IF EXISTS "schools_read_authenticated"    ON schools;
DROP POLICY IF EXISTS "schools_insert_authenticated"  ON schools;
DROP POLICY IF EXISTS "schools_update_member_or_admin" ON schools;
DROP POLICY IF EXISTS "schools_delete_admin"          ON schools;

CREATE POLICY "schools_select" ON schools
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "schools_insert" ON schools
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "schools_update" ON schools
  FOR UPDATE USING (id = ANY(get_my_school_ids()) OR is_admin());

CREATE POLICY "schools_delete" ON schools
  FOR DELETE USING (is_admin());
