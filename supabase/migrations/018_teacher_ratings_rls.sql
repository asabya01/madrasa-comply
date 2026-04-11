-- ─────────────────────────────────────────────────────────────────────────────
-- 018_teacher_ratings_rls.sql
-- Replace the broad FOR ALL policy on teacher_indicator_ratings with
-- fine-grained per-operation policies:
--
--   teachers  → SELECT / INSERT / UPDATE their own rows (teacher_id = auth.uid())
--   HODs+     → SELECT any row whose class belongs to one of their schools
--
-- Note: the ownership column is teacher_id (not rated_by — no such column).
-- Teachers cannot DELETE their own ratings; that requires admin/HOD action.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop existing catch-all policy (created in migrations 012 and 014)
DROP POLICY IF EXISTS "Teacher ratings isolation" ON teacher_indicator_ratings;

-- ── Teachers: read their own ratings ─────────────────────────────────────────
CREATE POLICY "tir_teacher_select"
  ON teacher_indicator_ratings
  FOR SELECT
  USING (teacher_id = auth.uid());

-- ── Teachers: insert new ratings for themselves only ─────────────────────────
CREATE POLICY "tir_teacher_insert"
  ON teacher_indicator_ratings
  FOR INSERT
  WITH CHECK (teacher_id = auth.uid());

-- ── Teachers: update their own ratings (draft → submitted) ───────────────────
CREATE POLICY "tir_teacher_update"
  ON teacher_indicator_ratings
  FOR UPDATE
  USING  (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- ── HODs / school admins: read all ratings for classes in their school ────────
-- Roles covered: head_of_department, school_admin, principal,
--                vice_principal, quality_coordinator
CREATE POLICY "tir_hod_select"
  ON teacher_indicator_ratings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM   school_members sm
      JOIN   classes        c  ON c.id = teacher_indicator_ratings.class_id
      WHERE  sm.user_id   = auth.uid()
        AND  sm.school_id = c.school_id
        AND  sm.role IN (
               'head_of_department',
               'school_admin',
               'principal',
               'vice_principal',
               'quality_coordinator'
             )
    )
  );

-- ── HODs: update status to 'reviewed' (review workflow) ──────────────────────
CREATE POLICY "tir_hod_update"
  ON teacher_indicator_ratings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM   school_members sm
      JOIN   classes        c  ON c.id = teacher_indicator_ratings.class_id
      WHERE  sm.user_id   = auth.uid()
        AND  sm.school_id = c.school_id
        AND  sm.role IN (
               'head_of_department',
               'school_admin',
               'principal',
               'vice_principal',
               'quality_coordinator'
             )
    )
  );
