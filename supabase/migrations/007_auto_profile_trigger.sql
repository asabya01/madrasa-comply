-- Migration 007: Auto-create profile row on new auth user signup
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/qfrvyeuzhobacdhqyjcw/sql
--
-- Replaces migration 005's trigger with an improved version that also
-- populates full_name and email from user metadata so the profile row
-- is immediately useful without a separate UPDATE call.

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
