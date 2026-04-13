-- 045_ai_benchmarking.sql
-- AI Benchmarking: snapshots and AI-generated insights

CREATE TABLE IF NOT EXISTS benchmark_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year   TEXT NOT NULL,
  domain_scores   JSONB NOT NULL DEFAULT '{}',
  overall_score   NUMERIC(4,2),
  obs_avg_rating  NUMERIC(4,2),
  cpd_hours_total NUMERIC(6,1),
  appraisal_avg   NUMERIC(4,2),
  snapshot_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (school_id, academic_year, snapshot_date)
);

CREATE TABLE IF NOT EXISTS ai_insights (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  insight_type  TEXT NOT NULL CHECK (insight_type IN (
    'strengths','improvement_areas','peer_comparison','recommended_actions'
  )),
  content       TEXT NOT NULL,
  generated_at  TIMESTAMPTZ DEFAULT now(),
  model_version TEXT DEFAULT 'gpt-4o-mini'
);

ALTER TABLE benchmark_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school members access benchmark_snapshots"
  ON benchmark_snapshots FOR ALL
  USING (school_id = ANY(get_my_school_ids()));

CREATE POLICY "school members access ai_insights"
  ON ai_insights FOR ALL
  USING (school_id = ANY(get_my_school_ids()));

CREATE INDEX IF NOT EXISTS idx_benchmark_school_year
  ON benchmark_snapshots(school_id, academic_year);
