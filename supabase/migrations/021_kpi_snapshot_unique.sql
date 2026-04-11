-- ─────────────────────────────────────────────────────────────────────────────
-- 021_kpi_snapshot_unique.sql
-- Add unique constraint on kpi_snapshots(school_id, snapshot_date) so we
-- can upsert one row per school per day instead of accumulating duplicates.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE kpi_snapshots
  ADD CONSTRAINT kpi_snapshots_school_date_unique
  UNIQUE (school_id, snapshot_date);
