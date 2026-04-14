-- Migration 055: profiles_with_email view
-- Joins profiles with auth.users to surface the real email address.
-- profiles.email may be null for users created before the column existed;
-- auth.users.email is always the authoritative source.
-- The view runs as SECURITY DEFINER (default for views owned by postgres)
-- so it can read auth.users even though authenticated users cannot.

CREATE OR REPLACE VIEW profiles_with_email AS
SELECT
  p.id,
  p.full_name,
  u.email,
  p.role,
  p.is_super_admin,
  p.is_sed_team,
  p.is_active,
  p.created_at
FROM profiles p
JOIN auth.users u ON u.id = p.id;

-- Grant read access to authenticated users (super admin panel query)
GRANT SELECT ON profiles_with_email TO authenticated;
