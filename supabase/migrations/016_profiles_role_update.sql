-- ─────────────────────────────────────────────────────────────────────────────
-- 016_profiles_role_update.sql
-- Extend profiles.role constraint to include the full role set used by
-- school_members (school_admin, head_of_department, auditor, etc.)
-- so that School Admins can be assigned via the Users settings panel.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (
    role IS NULL
    OR role IN (
      'admin',
      'super_admin',
      'school_admin',
      'principal',
      'vice_principal',
      'senior_management',
      'head_of_department',
      'quality_coordinator',
      'teacher',
      'auditor'
    )
  );
