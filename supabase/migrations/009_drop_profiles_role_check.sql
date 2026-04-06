-- Migration 009: Remove role CHECK constraint from profiles
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/qfrvyeuzhobacdhqyjcw/sql
--
-- Role is now stored in school_members, not profiles.
-- The profiles table should not enforce role values at all.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
