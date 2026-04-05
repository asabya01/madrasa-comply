-- ============================================
-- MIGRATION 001: FRAMEWORK STRUCTURE (READ-ONLY SEED DATA)
-- ============================================

CREATE TABLE IF NOT EXISTS domains (
  id TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_ar TEXT,
  weight TEXT CHECK (weight IN ('high','medium')) NOT NULL,
  key_category TEXT NOT NULL,
  order_num INT NOT NULL
);

CREATE TABLE IF NOT EXISTS standards (
  id TEXT PRIMARY KEY,
  domain_id TEXT REFERENCES domains(id),
  name_en TEXT NOT NULL,
  name_ar TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  order_num INT NOT NULL
);

CREATE TABLE IF NOT EXISTS indicators (
  id TEXT PRIMARY KEY,
  standard_id TEXT REFERENCES standards(id),
  domain_id TEXT REFERENCES domains(id),
  description_en TEXT NOT NULL,
  description_ar TEXT,
  outstanding_descriptor TEXT,
  satisfactory_descriptor TEXT,
  key_evidence TEXT[],
  order_num INT NOT NULL
);

-- ============================================
-- MIGRATION 002: MULTI-TENANT SCHOOL MANAGEMENT
-- ============================================

CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en TEXT NOT NULL,
  name_ar TEXT,
  school_type TEXT CHECK (school_type IN ('public','private')) NOT NULL,
  governorate TEXT,
  wilayat TEXT,
  principal_name TEXT,
  total_students_male INT DEFAULT 0,
  total_students_female INT DEFAULT 0,
  total_teachers INT DEFAULT 0,
  school_levels TEXT[],
  vision_statement TEXT,
  mission_statement TEXT,
  logo_url TEXT,
  subscription_tier TEXT CHECK (subscription_tier IN ('trial','basic','premium')) DEFAULT 'trial',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id UUID REFERENCES schools(id),
  full_name TEXT,
  role TEXT CHECK (role IN ('super_admin','principal','vice_principal','quality_coordinator','teacher')) NOT NULL,
  department TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MIGRATION 003: SELF-EVALUATION & RATINGS
-- ============================================

CREATE TABLE IF NOT EXISTS indicator_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  indicator_id TEXT REFERENCES indicators(id),
  academic_year TEXT NOT NULL,
  rating INT CHECK (rating BETWEEN 1 AND 5),
  strengths TEXT,
  improvement_areas TEXT,
  self_eval_notes TEXT,
  rated_by UUID REFERENCES profiles(id),
  rated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, indicator_id, academic_year)
);

CREATE TABLE IF NOT EXISTS standard_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  standard_id TEXT REFERENCES standards(id),
  academic_year TEXT NOT NULL,
  calculated_rating INT,
  override_rating INT,
  override_reason TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, standard_id, academic_year)
);

CREATE TABLE IF NOT EXISTS domain_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  domain_id TEXT REFERENCES domains(id),
  academic_year TEXT NOT NULL,
  calculated_rating INT,
  calculated_judgement TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, domain_id, academic_year)
);

-- ============================================
-- MIGRATION 004: EVIDENCE MANAGEMENT
-- ============================================

CREATE TABLE IF NOT EXISTS evidence_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size_bytes BIGINT,
  description TEXT,
  evidence_date DATE,
  tags TEXT[],
  uploaded_by UUID REFERENCES profiles(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence_indicator_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_file_id UUID REFERENCES evidence_files(id) ON DELETE CASCADE,
  indicator_id TEXT REFERENCES indicators(id),
  standard_id TEXT REFERENCES standards(id),
  domain_id TEXT REFERENCES domains(id),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(evidence_file_id, indicator_id)
);

-- ============================================
-- MIGRATION 005: IMPROVEMENT PLANNING
-- ============================================

CREATE TABLE IF NOT EXISTS action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  indicator_id TEXT REFERENCES indicators(id),
  standard_id TEXT REFERENCES standards(id),
  domain_id TEXT REFERENCES domains(id),
  owner_id UUID REFERENCES profiles(id),
  due_date DATE,
  status TEXT CHECK (status IN ('not_started','in_progress','completed','overdue')) DEFAULT 'not_started',
  priority TEXT CHECK (priority IN ('critical','high','medium','low')) DEFAULT 'medium',
  success_metric TEXT,
  source TEXT CHECK (source IN ('manual','ai_generated','audit_recommendation')) DEFAULT 'manual',
  academic_year TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================
-- MIGRATION 006: AI FEEDBACK
-- ============================================

CREATE TABLE IF NOT EXISTS ai_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  feedback_scope TEXT CHECK (feedback_scope IN ('indicator','standard','domain','overall')),
  scope_id TEXT,
  academic_year TEXT,
  rating_context JSONB,
  feedback_text TEXT,
  recommendations JSONB,
  reviewer_expectations TEXT,
  priority TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  model_used TEXT DEFAULT 'claude-3-5-sonnet-20241022'
);

-- ============================================
-- MIGRATION 007: KPI TRACKING & AUDIT
-- ============================================

CREATE TABLE IF NOT EXISTS kpi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  snapshot_date DATE DEFAULT CURRENT_DATE,
  academic_year TEXT,
  domain_scores JSONB,
  domain_judgements JSONB,
  overall_score NUMERIC(3,2),
  overall_judgement TEXT,
  indicators_rated INT,
  indicators_total INT,
  evidence_count INT,
  actions_completed INT,
  actions_total INT
);

CREATE TABLE IF NOT EXISTS audit_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE UNIQUE,
  expected_audit_date DATE,
  last_audit_date DATE,
  last_audit_judgement TEXT,
  follow_up_required BOOLEAN DEFAULT FALSE,
  follow_up_deadline DATE,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  category TEXT,
  item_text TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  notes TEXT,
  completed_by UUID REFERENCES profiles(id),
  completed_at TIMESTAMPTZ,
  is_custom BOOLEAN DEFAULT FALSE
);

-- ============================================
-- MIGRATION 008: ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicator_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_indicator_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own school" ON schools
  FOR ALL USING (id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users see own school profiles" ON profiles
  FOR ALL USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "School data isolation" ON indicator_ratings
  FOR ALL USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "School data isolation" ON evidence_files
  FOR ALL USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "School data isolation" ON evidence_indicator_links
  FOR ALL USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "School data isolation" ON action_items
  FOR ALL USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "School data isolation" ON ai_feedback
  FOR ALL USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "School data isolation" ON kpi_snapshots
  FOR ALL USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "School data isolation" ON audit_settings
  FOR ALL USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "School data isolation" ON audit_checklist_items
  FOR ALL USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

ALTER TABLE domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Framework readable by all" ON domains FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Framework readable by all" ON standards FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Framework readable by all" ON indicators FOR SELECT USING (auth.role() = 'authenticated');
