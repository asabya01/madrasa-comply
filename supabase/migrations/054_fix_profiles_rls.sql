-- Migration 054: Fix recursive profiles UPDATE policy introduced in 053
--
-- The "super_admin_update_profiles" policy added in 053 queried the
-- profiles table from within a profiles RLS policy — causing infinite
-- recursion on every profile upsert, breaking signup.
--
-- The existing "profiles_update" policy (migration 010) already grants
-- super admins full UPDATE access via is_admin(), which is a SECURITY
-- DEFINER function that bypasses RLS and is therefore safe to call from
-- within a profiles policy. No new policy is needed.

DROP POLICY IF EXISTS "super_admin_update_profiles" ON profiles;
DROP POLICY IF EXISTS "super_admin_toggle_active"   ON profiles;
