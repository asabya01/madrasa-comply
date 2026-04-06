-- Migration 008: Fix profiles table schema
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/qfrvyeuzhobacdhqyjcw/sql
--
-- 1. Add missing columns idempotently
-- 2. Make role nullable — role is now authoritative in school_members, not profiles
-- 3. Re-run auto-profile trigger so it no longer inserts a role value

-- ── 1. Add missing columns ────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email      text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name  text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- ── 2. Make role nullable ─────────────────────────────────────────────────────

-- Drop NOT NULL and set default to NULL
-- Role is authoritative in school_members; profiles.role is legacy only
ALTER TABLE profiles ALTER COLUMN role DROP NOT NULL;
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT NULL;

-- Replace the strict role check with one that permits NULL
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (
    role IS NULL
    OR role IN ('admin','super_admin','principal','vice_principal','quality_coordinator','teacher')
  );

-- ── 3. Update trigger — no longer inserts role ────────────────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    new.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
