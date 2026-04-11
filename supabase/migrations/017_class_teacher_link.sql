-- ─────────────────────────────────────────────────────────────────────────────
-- 017_class_teacher_link.sql
-- Ensure classes.teacher_id exists and references profiles(id).
-- The column was introduced in 012 but may be absent on older instances.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES profiles(id);

-- Index for fast lookup of classes by teacher
CREATE INDEX IF NOT EXISTS classes_teacher_id_idx ON classes (teacher_id);
