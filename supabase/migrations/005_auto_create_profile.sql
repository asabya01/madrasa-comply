-- Migration 005: Auto-create profile row on new auth user signup
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/qfrvyeuzhobacdhqyjcw/sql
--
-- This prevents the silent failure when a user signs up via the Supabase
-- dashboard, magic link, or OAuth and lands in the app with no profile row.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (new.id, 'principal')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop first in case it already exists from a previous attempt
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
