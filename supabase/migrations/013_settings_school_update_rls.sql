-- 013_settings_school_update_rls.sql
-- Drop the broad update policy from migration 010
-- and replace with role-restricted policy for school settings

DROP POLICY IF EXISTS "schools_update_member_or_admin" ON schools;
DROP POLICY IF EXISTS "schools_update" ON schools;

-- Allow only school_admin and principal to update their school
CREATE POLICY "school_admin_principal_can_update_school"
  ON schools
  FOR UPDATE
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM school_members
      WHERE school_members.school_id = schools.id
        AND school_members.user_id = auth.uid()
        AND school_members.role IN ('school_admin', 'principal')
        AND school_members.status = 'active'
    )
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM school_members
      WHERE school_members.school_id = schools.id
        AND school_members.user_id = auth.uid()
        AND school_members.role IN ('school_admin', 'principal')
        AND school_members.status = 'active'
    )
  );
