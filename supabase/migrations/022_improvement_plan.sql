-- ─────────────────────────────────────────────────────────────────────────────
-- 022_improvement_plan.sql
-- Adds missing columns to action_items and creates action_tasks + impact_notes
-- tables per PSD §2.6 / §4.1 / FR-IMP-01–09.
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS and CREATE TABLE IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Extend action_items ────────────────────────────────────────────────

ALTER TABLE action_items
  ADD COLUMN IF NOT EXISTS expected_impact  TEXT,
  ADD COLUMN IF NOT EXISTS completion_date  DATE,
  ADD COLUMN IF NOT EXISTS actual_impact    TEXT
    CHECK (actual_impact IN ('not_met','partially_met','met','exceeded')),
  ADD COLUMN IF NOT EXISTS is_archived      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Re-apply the most permissive RLS policy so the new columns are writable
-- (prior migrations may have left a stricter policy in place)
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "actions_school_access"       ON action_items;
DROP POLICY IF EXISTS "Schools manage own actions"   ON action_items;
DROP POLICY IF EXISTS "School data isolation"        ON action_items;

CREATE POLICY "action_items_school_access" ON action_items
  FOR ALL USING (school_id = ANY(get_my_school_ids()))
  WITH CHECK (school_id = ANY(get_my_school_ids()));

-- ─── 2. action_tasks ──────────────────────────────────────────────────────
-- One row per task within an AFI. Tasks must be completed before the AFI
-- can be marked complete (FR-IMP-05).

CREATE TABLE IF NOT EXISTS action_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_item_id  UUID NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  owner_id        UUID REFERENCES profiles(id),
  due_date        DATE,
  completion_date TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','completed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE action_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "action_tasks_school_access" ON action_tasks;
CREATE POLICY "action_tasks_school_access" ON action_tasks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM action_items ai
      WHERE ai.id = action_tasks.action_item_id
        AND ai.school_id = ANY(get_my_school_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM action_items ai
      WHERE ai.id = action_tasks.action_item_id
        AND ai.school_id = ANY(get_my_school_ids())
    )
  );

-- ─── 3. impact_notes ──────────────────────────────────────────────────────
-- Timestamped progress notes per AFI with a current impact selector
-- (Not Met / Partially Met / Met / Exceeded) per FR-IMP-06.

CREATE TABLE IF NOT EXISTS impact_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_item_id  UUID NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  current_impact  TEXT
    CHECK (current_impact IN ('not_met','partially_met','met','exceeded')),
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE impact_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "impact_notes_school_access" ON impact_notes;
CREATE POLICY "impact_notes_school_access" ON impact_notes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM action_items ai
      WHERE ai.id = impact_notes.action_item_id
        AND ai.school_id = ANY(get_my_school_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM action_items ai
      WHERE ai.id = impact_notes.action_item_id
        AND ai.school_id = ANY(get_my_school_ids())
    )
  );
