-- ─────────────────────────────────────────────────────────────────────────────
-- 049: SEF approval workflow, in-app notifications, HOD domain scoping,
--      improvement-loop column
-- Safe to re-run (IF NOT EXISTS / IF NOT EXISTS patterns throughout).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. SEF approval status on academic_years ─────────────────────────────

ALTER TABLE academic_years
  ADD COLUMN IF NOT EXISTS sef_status TEXT
    NOT NULL DEFAULT 'draft'
    CHECK (sef_status IN ('draft', 'submitted', 'approved'));

ALTER TABLE academic_years
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES profiles(id);
ALTER TABLE academic_years
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE academic_years
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id);
ALTER TABLE academic_years
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- ─── 2. In-app notifications ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  -- types: sef_submitted, sef_approved, sef_returned,
  --        observation_scheduled, action_item_overdue,
  --        sed_generated, audit_approaching, appraisal_opened
  title       TEXT NOT NULL,
  body        TEXT,
  link        TEXT,   -- route to navigate to, e.g. /self-evaluation
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see own notifications" ON notifications;
CREATE POLICY "users see own notifications"
  ON notifications FOR ALL
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read, created_at DESC);

-- ─── 3. HOD domain assignments ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hod_domain_assignments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  domain_number    INTEGER NOT NULL CHECK (domain_number BETWEEN 1 AND 5),
  academic_year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, user_id, domain_number, academic_year_id)
);

ALTER TABLE hod_domain_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "school members access hod_domain_assignments" ON hod_domain_assignments;
CREATE POLICY "school members access hod_domain_assignments"
  ON hod_domain_assignments FOR ALL
  USING (school_id = ANY(get_my_school_ids()));

-- ─── 4. Improvement plan — completion prompt flag ─────────────────────────

ALTER TABLE action_items
  ADD COLUMN IF NOT EXISTS completion_prompted BOOLEAN DEFAULT false;
