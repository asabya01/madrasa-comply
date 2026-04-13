-- ============================================================
-- MIGRATION 046: FRAMEWORK VERSIONING
-- Locks SEDs to the OAAAQA framework version active at generation time.
-- ============================================================

CREATE TABLE IF NOT EXISTS framework_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_code  TEXT NOT NULL UNIQUE,  -- e.g. 'OAAAQA-2024'
  label         TEXT NOT NULL,         -- e.g. 'OAAAQA Framework 2024'
  effective_from DATE NOT NULL,
  effective_to   DATE,                 -- NULL = currently active
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Seed the current version
INSERT INTO framework_versions
  (version_code, label, effective_from, is_active)
VALUES
  ('OAAAQA-2024', 'OAAAQA Framework 2024', '2024-01-01', true)
ON CONFLICT (version_code) DO NOTHING;

-- Link academic years to a framework version
ALTER TABLE academic_years
  ADD COLUMN IF NOT EXISTS framework_version_id UUID
    REFERENCES framework_versions(id) ON DELETE SET NULL;

-- Back-fill: assign all existing academic_years to OAAAQA-2024
UPDATE academic_years
SET framework_version_id = (
  SELECT id FROM framework_versions WHERE version_code = 'OAAAQA-2024'
)
WHERE framework_version_id IS NULL;

-- Snapshot of indicators at time of SED generation
CREATE TABLE IF NOT EXISTS sed_indicator_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sed_document_id UUID NOT NULL REFERENCES sed_documents(id) ON DELETE CASCADE,
  indicator_code  TEXT NOT NULL,
  indicator_label_en TEXT,
  indicator_label_ar TEXT,
  standard_code   TEXT NOT NULL,
  domain_number   INTEGER NOT NULL,
  rating          SMALLINT,
  strengths_en    TEXT,
  strengths_ar    TEXT,
  improvements_en TEXT,
  improvements_ar TEXT,
  snapshot_taken_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sed_indicator_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school members access sed_indicator_snapshots"
  ON sed_indicator_snapshots FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sed_documents sd
      WHERE sd.id = sed_indicator_snapshots.sed_document_id
        AND sd.school_id = ANY(get_my_school_ids())
    )
  );

CREATE INDEX IF NOT EXISTS idx_sed_snapshots_document
  ON sed_indicator_snapshots(sed_document_id);

ALTER TABLE framework_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users read framework_versions"
  ON framework_versions FOR SELECT
  TO authenticated
  USING (true);
