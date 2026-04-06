-- Migration 006: Multi-tenant schema
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/qfrvyeuzhobacdhqyjcw/sql
--
-- What this does:
--   1. Extends schools table (slug, subscription_status, invite_mode)
--   2. Extends profiles table (is_super_admin)
--   3. Creates school_members, school_invitations, audit_log, tasks, notifications
--   4. Migrates profiles.school_id + profiles.role → school_members
--   5. Replaces is_admin() (was role='admin') with is_super_admin boolean
--   6. Adds get_my_school_ids() SECURITY DEFINER helper for RLS
--   7. Replaces all subquery-based RLS policies with get_my_school_ids() versions
--   8. Allows all authenticated users to read schools table (for join-school search)

-- ── 1. ALTER schools ──────────────────────────────────────────────────────────

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'trial'
    CHECK (subscription_status IN ('trial','active','suspended','cancelled')),
  ADD COLUMN IF NOT EXISTS invite_mode text NOT NULL DEFAULT 'invite_only'
    CHECK (invite_mode IN ('open','invite_only')),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Populate slugs from name_en + short id suffix to guarantee uniqueness
UPDATE schools
  SET slug = lower(regexp_replace(trim(name_en), '[^a-zA-Z0-9]+', '-', 'g'))
             || '-' || substr(id::text, 1, 8)
  WHERE slug IS NULL;

ALTER TABLE schools ADD CONSTRAINT schools_slug_unique UNIQUE (slug);

-- Extend subscription_tier to include new values
ALTER TABLE schools DROP CONSTRAINT IF EXISTS schools_subscription_tier_check;
ALTER TABLE schools ADD CONSTRAINT schools_subscription_tier_check
  CHECK (subscription_tier IN ('trial','basic','premium','starter','school'));

-- ── 2. ALTER profiles ─────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

-- Mark existing admin/super_admin users as super admin
UPDATE profiles SET is_super_admin = true WHERE role IN ('admin', 'super_admin');

-- ── 3. CREATE school_members ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS school_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES schools(id)    ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'teacher'
    CHECK (role IN (
      'school_admin','principal','vice_principal','senior_management',
      'head_of_department','quality_coordinator','teacher','auditor'
    )),
  status     text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','pending','suspended')),
  invited_by uuid REFERENCES auth.users(id),
  joined_at  timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE (school_id, user_id)
);

-- ── 4. Migrate existing profiles → school_members ────────────────────────────

INSERT INTO school_members (school_id, user_id, role, status)
SELECT
  school_id,
  id AS user_id,
  CASE role
    WHEN 'admin'               THEN 'school_admin'
    WHEN 'super_admin'         THEN 'school_admin'
    WHEN 'principal'           THEN 'principal'
    WHEN 'vice_principal'      THEN 'vice_principal'
    WHEN 'quality_coordinator' THEN 'quality_coordinator'
    WHEN 'teacher'             THEN 'teacher'
    ELSE 'teacher'
  END,
  'active'
FROM profiles
WHERE school_id IS NOT NULL
ON CONFLICT (school_id, user_id) DO NOTHING;

-- ── 5. CREATE school_invitations ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS school_invitations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  email      text,
  role       text NOT NULL DEFAULT 'teacher'
    CHECK (role IN (
      'school_admin','principal','vice_principal','senior_management',
      'head_of_department','quality_coordinator','teacher','auditor'
    )),
  invited_by uuid REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at    timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ── 6. CREATE audit_log ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid REFERENCES schools(id)    ON DELETE SET NULL,
  user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action     text NOT NULL,
  table_name text,
  record_id  text,
  old_data   jsonb,
  new_data   jsonb,
  created_at timestamptz DEFAULT now()
);

-- ── 7. CREATE tasks ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  created_by   uuid REFERENCES auth.users(id),
  assigned_to  uuid REFERENCES auth.users(id),
  title        text NOT NULL,
  description  text,
  indicator_id text,  -- string IDs like "1.1.1", no FK constraint
  due_date     date,
  priority     text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('critical','high','medium','low')),
  status       text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','completed','overdue')),
  is_broadcast boolean NOT NULL DEFAULT false,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- ── 8. CREATE notifications ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES schools(id)    ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  body       text,
  type       text NOT NULL DEFAULT 'info'
    CHECK (type IN ('info','warning','error','success','task','audit')),
  related_id text,
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ── 9. Helper functions ───────────────────────────────────────────────────────

-- Returns array of school_ids the current user is an active member of.
-- SECURITY DEFINER so it runs as postgres, bypassing RLS on school_members.
CREATE OR REPLACE FUNCTION get_my_school_ids()
RETURNS uuid[] AS $$
  SELECT ARRAY(
    SELECT school_id
    FROM   school_members
    WHERE  user_id = auth.uid()
      AND  status  = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Updated is_admin() — now reads is_super_admin boolean instead of role column.
-- Existing SECURITY DEFINER wrapper is preserved; only the body changes.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── 10. Enable RLS on new tables ──────────────────────────────────────────────

ALTER TABLE school_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_invitations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications       ENABLE ROW LEVEL SECURITY;

-- school_members
CREATE POLICY "sm_select" ON school_members
  FOR SELECT USING (school_id = ANY(get_my_school_ids()) OR is_admin());

-- Any user can insert a membership for themselves (onboarding create/join)
-- Existing members can also add others to their school
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

-- school_invitations
CREATE POLICY "inv_select" ON school_invitations
  FOR SELECT USING (
    school_id = ANY(get_my_school_ids())
    OR is_admin()
    OR (used_at IS NULL AND expires_at > now())   -- allow reading a valid invite by token
  );

CREATE POLICY "inv_insert" ON school_invitations
  FOR INSERT WITH CHECK (school_id = ANY(get_my_school_ids()) OR is_admin());

CREATE POLICY "inv_update" ON school_invitations
  FOR UPDATE USING (
    school_id = ANY(get_my_school_ids())
    OR is_admin()
    OR (used_at IS NULL AND expires_at > now())   -- allow claiming an invite
  );

-- audit_log
CREATE POLICY "al_select" ON audit_log
  FOR SELECT USING (school_id = ANY(get_my_school_ids()) OR is_admin());

CREATE POLICY "al_insert" ON audit_log
  FOR INSERT WITH CHECK (school_id = ANY(get_my_school_ids()) OR is_admin());

-- tasks
CREATE POLICY "tasks_select" ON tasks
  FOR SELECT USING (school_id = ANY(get_my_school_ids()) OR is_admin());

CREATE POLICY "tasks_insert" ON tasks
  FOR INSERT WITH CHECK (school_id = ANY(get_my_school_ids()) OR is_admin());

CREATE POLICY "tasks_update" ON tasks
  FOR UPDATE USING (school_id = ANY(get_my_school_ids()) OR is_admin());

CREATE POLICY "tasks_delete" ON tasks
  FOR DELETE USING (school_id = ANY(get_my_school_ids()) OR is_admin());

-- notifications
CREATE POLICY "notif_select" ON notifications
  FOR SELECT USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "notif_insert" ON notifications
  FOR INSERT WITH CHECK (school_id = ANY(get_my_school_ids()) OR is_admin());

CREATE POLICY "notif_update" ON notifications
  FOR UPDATE USING (user_id = auth.uid() OR is_admin());

-- ── 11. Replace subquery-based RLS on all existing tables ─────────────────────

-- profiles
DROP POLICY IF EXISTS "Profiles access" ON profiles;

CREATE POLICY "profiles_self_or_admin" ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR is_admin()
    -- co-members of the same school can see each other's profiles
    OR id = ANY(
      SELECT user_id FROM school_members WHERE school_id = ANY(get_my_school_ids()) AND status = 'active'
    )
  );

CREATE POLICY "profiles_self_insert" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid() OR is_admin());

CREATE POLICY "profiles_self_update" ON profiles
  FOR UPDATE USING (id = auth.uid() OR is_admin())
  WITH CHECK (id = auth.uid() OR is_admin());

CREATE POLICY "profiles_admin_delete" ON profiles
  FOR DELETE USING (is_admin());

-- schools — all authenticated can read (needed for join-school search)
DROP POLICY IF EXISTS "Schools access" ON schools;

CREATE POLICY "schools_read_authenticated" ON schools
  FOR SELECT USING (auth.role() = 'authenticated');

-- Any authenticated user can create a school (new school during onboarding)
CREATE POLICY "schools_insert_authenticated" ON schools
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "schools_update_member_or_admin" ON schools
  FOR UPDATE USING (id = ANY(get_my_school_ids()) OR is_admin());

CREATE POLICY "schools_delete_admin" ON schools
  FOR DELETE USING (is_admin());

-- indicator_ratings
DROP POLICY IF EXISTS "Schools manage own ratings" ON indicator_ratings;

CREATE POLICY "ratings_school_access" ON indicator_ratings
  FOR ALL
  USING  (school_id = ANY(get_my_school_ids()) OR is_admin())
  WITH CHECK (school_id = ANY(get_my_school_ids()) OR is_admin());

-- action_items
DROP POLICY IF EXISTS "Schools manage own actions" ON action_items;

CREATE POLICY "actions_school_access" ON action_items
  FOR ALL
  USING  (school_id = ANY(get_my_school_ids()) OR is_admin())
  WITH CHECK (school_id = ANY(get_my_school_ids()) OR is_admin());

-- evidence_files
DROP POLICY IF EXISTS "Schools manage own evidence" ON evidence_files;

CREATE POLICY "evidence_school_access" ON evidence_files
  FOR ALL
  USING  (school_id = ANY(get_my_school_ids()) OR is_admin())
  WITH CHECK (school_id = ANY(get_my_school_ids()) OR is_admin());

-- evidence_indicator_links
DROP POLICY IF EXISTS "Schools manage own evidence links" ON evidence_indicator_links;

CREATE POLICY "evidence_links_school_access" ON evidence_indicator_links
  FOR ALL
  USING  (school_id = ANY(get_my_school_ids()) OR is_admin())
  WITH CHECK (school_id = ANY(get_my_school_ids()) OR is_admin());

-- audit_settings
DROP POLICY IF EXISTS "Schools manage own audit settings" ON audit_settings;

CREATE POLICY "audit_settings_school_access" ON audit_settings
  FOR ALL
  USING  (school_id = ANY(get_my_school_ids()) OR is_admin())
  WITH CHECK (school_id = ANY(get_my_school_ids()) OR is_admin());

-- audit_checklist_items
DROP POLICY IF EXISTS "Schools manage own checklist" ON audit_checklist_items;

CREATE POLICY "checklist_school_access" ON audit_checklist_items
  FOR ALL
  USING  (school_id = ANY(get_my_school_ids()) OR is_admin())
  WITH CHECK (school_id = ANY(get_my_school_ids()) OR is_admin());

-- self_evaluation_narratives (may not exist — wrapped in DO block)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'self_evaluation_narratives'
  ) THEN
    DROP POLICY IF EXISTS "Schools manage own narratives" ON self_evaluation_narratives;
    EXECUTE $pol$
      CREATE POLICY "narratives_school_access" ON self_evaluation_narratives
        FOR ALL
        USING  (school_id = ANY(get_my_school_ids()) OR is_admin())
        WITH CHECK (school_id = ANY(get_my_school_ids()) OR is_admin());
    $pol$;
  END IF;
END $$;

-- kpi_snapshots (may not exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'kpi_snapshots'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "kpi_school_access" ON kpi_snapshots
        FOR ALL
        USING  (school_id = ANY(get_my_school_ids()) OR is_admin())
        WITH CHECK (school_id = ANY(get_my_school_ids()) OR is_admin());
    $pol$;
  END IF;
END $$;

-- ai_feedback (may not exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ai_feedback'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "ai_feedback_school_access" ON ai_feedback
        FOR ALL
        USING  (school_id = ANY(get_my_school_ids()) OR is_admin())
        WITH CHECK (school_id = ANY(get_my_school_ids()) OR is_admin());
    $pol$;
  END IF;
END $$;
