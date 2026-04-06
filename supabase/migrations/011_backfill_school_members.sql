-- Migration 011: Backfill school_members from profiles.school_id
--
-- For existing users who were assigned to a school via the legacy
-- profiles.school_id column but never got a school_members row,
-- insert them now so useSchool.ts picks them up correctly.

INSERT INTO school_members (school_id, user_id, role, status, joined_at)
SELECT
  p.school_id,
  p.id,
  COALESCE(p.role, 'school_admin'),
  'active',
  now()
FROM profiles p
WHERE p.school_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM school_members sm
    WHERE sm.user_id = p.id
      AND sm.school_id = p.school_id
  );
