-- ─────────────────────────────────────────────────────────────────────────────
-- 020_fix_profile_fk.sql
-- Re-create school_members_user_id_fkey to point explicitly to profiles(id)
-- with ON DELETE CASCADE so PostgREST resolves the join unambiguously.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE school_members DROP CONSTRAINT IF EXISTS school_members_user_id_fkey;
ALTER TABLE school_members ADD CONSTRAINT school_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
