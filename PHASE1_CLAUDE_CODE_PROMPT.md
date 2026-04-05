# MADRASA COMPLY — Master Build Prompt for Claude Code
# Oman School Compliance Management System
# Governed by: OAAAQA School Evaluation Framework (SEF) 2024

---

## 🎯 WHAT YOU ARE BUILDING

A **multi-tenant SaaS web application** called **"Madrasa Comply"** for Omani schools.

### The Problem It Solves
All public and private schools in Oman are subject to external audits by OAAAQA (Oman Authority for Academic Accreditation and Quality Assurance of Education). The audit framework has 5 domains, 19 standards, and 60+ indicators. Schools must:
1. Continuously self-evaluate against all indicators
2. Collect and organize evidence for each indicator
3. Build improvement plans for weak areas
4. Generate a formal Self-Evaluation Document (SED) for auditors
5. Demonstrate progress between audit cycles

**Madrasa Comply** allows schools to do all of this in one place — staying audit-ready at all times rather than scrambling before a visit.

### Who Uses It
- **School Principal / Vice Principal** — Full access, final approvals
- **Quality Coordinator** — Full access except billing/settings
- **Teachers** — Can rate indicators in their area, upload evidence
- **Super Admin (You)** — Manages all schools on the platform

---

## 🏗️ TECH STACK

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS v3 + shadcn/ui |
| State | Zustand + React Query (TanStack Query v5) |
| Backend/DB | Supabase (PostgreSQL + Auth + Storage + Edge Functions) |
| AI | Anthropic Claude API via Supabase Edge Function |
| Charts | Recharts |
| PDF Export | jsPDF + html2canvas |
| Forms | React Hook Form + Zod |
| Routing | React Router v6 |
| Icons | Lucide React |
| i18n | i18next (English v1, Arabic v2) |
| Deployment | Vercel |

---

## 🗄️ COMPLETE DATABASE SCHEMA

Run these migrations in Supabase SQL Editor in order:

```sql
-- ============================================
-- MIGRATION 001: FRAMEWORK STRUCTURE (READ-ONLY SEED DATA)
-- ============================================

CREATE TABLE domains (
  id TEXT PRIMARY KEY,          -- '1','2','3','4','5'
  name_en TEXT NOT NULL,
  name_ar TEXT,
  weight TEXT CHECK (weight IN ('high','medium')) NOT NULL,
  key_category TEXT NOT NULL,   -- 'learning_outcomes','school_processes','quality_assurance'
  order_num INT NOT NULL
);

CREATE TABLE standards (
  id TEXT PRIMARY KEY,          -- '1.1','1.2','3.5' etc.
  domain_id TEXT REFERENCES domains(id),
  name_en TEXT NOT NULL,
  name_ar TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  order_num INT NOT NULL
);

CREATE TABLE indicators (
  id TEXT PRIMARY KEY,          -- '1.1.1','3.5.4' etc.
  standard_id TEXT REFERENCES standards(id),
  domain_id TEXT REFERENCES domains(id),
  description_en TEXT NOT NULL,
  description_ar TEXT,
  outstanding_descriptor TEXT,
  satisfactory_descriptor TEXT,
  key_evidence TEXT[],          -- list of recommended evidence types
  order_num INT NOT NULL
);

-- ============================================
-- MIGRATION 002: MULTI-TENANT SCHOOL MANAGEMENT
-- ============================================

CREATE TABLE schools (
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
  school_levels TEXT[],         -- ['primary','intermediate','secondary']
  vision_statement TEXT,
  mission_statement TEXT,
  logo_url TEXT,
  subscription_tier TEXT CHECK (subscription_tier IN ('trial','basic','premium')) DEFAULT 'trial',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE profiles (
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

CREATE TABLE indicator_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  indicator_id TEXT REFERENCES indicators(id),
  academic_year TEXT NOT NULL,  -- '2024-2025'
  rating INT CHECK (rating BETWEEN 1 AND 5),
  -- 1=Outstanding, 2=Good, 3=Satisfactory, 4=Unsatisfactory, 5=Needs Urgent Intervention
  strengths TEXT,
  improvement_areas TEXT,
  self_eval_notes TEXT,
  rated_by UUID REFERENCES profiles(id),
  rated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, indicator_id, academic_year)
);

CREATE TABLE standard_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  standard_id TEXT REFERENCES standards(id),
  academic_year TEXT NOT NULL,
  calculated_rating INT,        -- auto-calculated from indicators
  override_rating INT,          -- manual override by principal
  override_reason TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, standard_id, academic_year)
);

CREATE TABLE domain_ratings (
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

CREATE TABLE evidence_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,      -- Supabase storage path
  file_type TEXT,               -- 'pdf','docx','image','spreadsheet','other'
  file_size_bytes BIGINT,
  description TEXT,
  evidence_date DATE,
  tags TEXT[],
  uploaded_by UUID REFERENCES profiles(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Many-to-many: one file can cover multiple indicators
CREATE TABLE evidence_indicator_links (
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

CREATE TABLE action_items (
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

CREATE TABLE ai_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  feedback_scope TEXT CHECK (feedback_scope IN ('indicator','standard','domain','overall')),
  scope_id TEXT,                -- indicator_id, standard_id, domain_id, or 'overall'
  academic_year TEXT,
  rating_context JSONB,         -- snapshot of ratings at time of generation
  feedback_text TEXT,
  recommendations JSONB,        -- array of {action, priority, evidence_needed}
  reviewer_expectations TEXT,
  priority TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  model_used TEXT DEFAULT 'claude-3-5-sonnet-20241022'
);

-- ============================================
-- MIGRATION 007: KPI TRACKING & AUDIT
-- ============================================

CREATE TABLE kpi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  snapshot_date DATE DEFAULT CURRENT_DATE,
  academic_year TEXT,
  domain_scores JSONB,          -- {"1": 2.3, "2": 3.1, "3": 2.8, "4": 2.5, "5": 2.1}
  domain_judgements JSONB,      -- {"1": "Good", "2": "Satisfactory", ...}
  overall_score NUMERIC(3,2),
  overall_judgement TEXT,
  indicators_rated INT,
  indicators_total INT,
  evidence_count INT,
  actions_completed INT,
  actions_total INT
);

CREATE TABLE audit_settings (
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

CREATE TABLE audit_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  category TEXT,                -- 'documentation','evidence','staff','environment'
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

-- Schools: users can only see their own school
CREATE POLICY "Users see own school" ON schools
  FOR ALL USING (id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- Profiles: users see profiles in their school
CREATE POLICY "Users see own school profiles" ON profiles
  FOR ALL USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- All school data: isolate by school_id
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

-- Framework tables: readable by all authenticated users
ALTER TABLE domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Framework readable by all" ON domains FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Framework readable by all" ON standards FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Framework readable by all" ON indicators FOR SELECT USING (auth.role() = 'authenticated');
```

---

## 🌱 COMPLETE SEED DATA

Run this after migrations. This seeds the entire OAAAQA framework — do NOT allow users to edit this data.

```sql
-- DOMAINS
INSERT INTO domains (id, name_en, name_ar, weight, key_category, order_num) VALUES
('1','Academic Achievement','التحصيل الأكاديمي','high','learning_outcomes',1),
('2','Personal Development','التنمية الشخصية','medium','learning_outcomes',2),
('3','Teaching and Assessment','التدريس والتقييم','high','school_processes',3),
('4','School Climate and Learning Environment','المناخ المدرسي وبيئة التعلم','medium','school_processes',4),
('5','Leadership, Management and Governance','القيادة والإدارة والحوكمة','high','quality_assurance',5);

-- STANDARDS
INSERT INTO standards (id, domain_id, name_en, name_ar, is_primary, order_num) VALUES
('1.1','1','Academic Attainment','التحصيل الأكاديمي',true,1),
('1.2','1','Academic Progress','التقدم الأكاديمي',true,2),
('1.3','1','Learning Skills','مهارات التعلم',false,3),
('2.1','2','Values and Behaviour','القيم والسلوك',true,1),
('2.2','2','Identity and Citizenship','الهوية والمواطنة',true,2),
('2.3','2','Health and Environmental Awareness','الوعي الصحي والبيئي',false,3),
('2.4','2','Innovation and Entrepreneurship','الابتكار وريادة الأعمال',false,4),
('3.1','3','Curriculum Planning','تخطيط المنهج',true,1),
('3.2','3','Class Management','إدارة الفصل',true,2),
('3.3','3','Teaching Effectiveness','فاعلية التدريس',true,3),
('3.4','3','Developing Learning Skills','تنمية مهارات التعلم',false,4),
('3.5','3','Assessment and Progress Support','التقييم ودعم التقدم',true,5),
('4.1','4','Quality of the Learning Environment','جودة بيئة التعلم',true,1),
('4.2','4','Fostering Students Talents and Capabilities','تنمية مواهب الطلاب وقدراتهم',true,2),
('4.3','4','Support and Care','الدعم والرعاية',true,3),
('4.4','4','Developing Research Skills','تنمية مهارات البحث العلمي',false,4),
('5.1','5','Leadership of Change','قيادة التغيير',true,1),
('5.2','5','Leadership of Teaching and Learning','قيادة التعليم والتعلم',true,2),
('5.3','5','Managerial Competency','الكفاءة الإدارية',true,3),
('5.4','5','Partnership with Parents and the Community','الشراكة مع أولياء الأمور والمجتمع',false,4),
('5.5','5','Governance','الحوكمة',true,5);

-- INDICATORS (all 60+)
INSERT INTO indicators (id, standard_id, domain_id, description_en, key_evidence, order_num) VALUES
-- Domain 1: Academic Achievement
('1.1.1','1.1','1','Overall levels of students attainment',
 ARRAY['Student test scores and grade data','National exam results','Benchmarking reports'],1),
('1.1.2','1.1','1','Students attainment in classwork and assignments',
 ARRAY['Student workbooks and portfolios','Teacher mark books','Assignment records'],2),
('1.1.3','1.1','1','Equity of attainment for all learners',
 ARRAY['Disaggregated data by gender/SEN/nationality','Attainment gap analysis'],3),
('1.2.1','1.2','1','Students overall attainment levels over time',
 ARRAY['3-year trend data','Progress tracking spreadsheets','Cohort comparison reports'],1),
('1.2.2','1.2','1','Students academic progress in lessons',
 ARRAY['Lesson observation notes','Learning walk records','Student work samples'],2),
('1.2.3','1.2','1','Progress of vulnerable students',
 ARRAY['SEN student progress reports','At-risk student tracking','Intervention records'],3),
('1.3.1','1.3','1','Independent learning skills',
 ARRAY['Student project work','Self-directed learning examples','Teacher observations'],1),
('1.3.2','1.3','1','Collaborative learning skills',
 ARRAY['Group project evidence','Peer assessment records','Collaboration activity photos'],2),
('1.3.3','1.3','1','Higher-order thinking skills',
 ARRAY['Assessment tasks requiring analysis/evaluation','Student work showing critical thinking'],3),
('1.3.4','1.3','1','Application of learning to real-life contexts',
 ARRAY['Real-world project evidence','Community links','Applied learning examples'],4),
('1.3.5','1.3','1','Digital literacy skills',
 ARRAY['Student digital work samples','Technology use records','Digital project portfolios'],5),
('1.3.6','1.3','1','Reading culture',
 ARRAY['Library usage data','Reading logs','Reading programme records'],6),

-- Domain 2: Personal Development
('2.1.1','2.1','2','Upholding shared human values',
 ARRAY['Behaviour policy','Student conduct records','Values education programme'],1),
('2.1.2','2.1','2','Students understanding of their rights and duties',
 ARRAY['Student rights education materials','Student council records'],2),
('2.1.3','2.1','2','Students enthusiasm and motivation towards learning',
 ARRAY['Attendance records','Student surveys','Engagement observation data'],3),
('2.2.1','2.2','2','Pride in Omans identity, history and culture, loyalty to the Sultanate and His Majesty the Sultan',
 ARRAY['National Day activities','Cultural events records','Omani heritage projects'],1),
('2.2.2','2.2','2','Belonging to the Arab and Islamic identity and appreciation of the Arabic language',
 ARRAY['Arabic language programmes','Islamic values activities','Cultural identity projects'],2),
('2.2.3','2.2','2','Participation in voluntary work',
 ARRAY['Community service records','Volunteer activity logs','Photos of volunteer events'],3),
('2.2.4','2.2','2','Consultation practices and election culture',
 ARRAY['Student council election records','School parliament minutes','Consultation meeting notes'],4),
('2.3.1','2.3','2','Commitment to safe and healthy lifestyles',
 ARRAY['Health education programme','Sports participation records','Wellness initiative evidence'],1),
('2.3.2','2.3','2','Students engagement with environmental and climate issues',
 ARRAY['Environmental club records','Sustainability projects','Green initiatives evidence'],2),
('2.4.1','2.4','2','Taking initiative in proposing new ideas and launching projects',
 ARRAY['Student innovation project records','Ideas competition evidence','Startup club records'],1),
('2.4.2','2.4','2','Managing projects to deliver outcomes',
 ARRAY['Student project completion records','Project management evidence','Exhibition records'],2),
('2.4.3','2.4','2','Commitment to work ethics',
 ARRAY['Work experience records','Professional conduct observations','Ethics programme evidence'],3),
('2.4.4','2.4','2','Communication and leading teams',
 ARRAY['Team leadership activity evidence','Presentation records','Communication skill assessments'],4),

-- Domain 3: Teaching and Assessment
('3.1.1','3.1','3','Planning the curriculum to achieve competencies and meet students needs',
 ARRAY['Lesson plans','Scheme of work','Curriculum mapping documents'],1),
('3.1.2','3.1','3','Making links between academic subjects to support integration of the curriculum and Omani culture',
 ARRAY['Cross-curricular project evidence','Cultural integration examples in lesson plans'],2),
('3.1.3','3.1','3','Aligning the curriculum to meet the needs of all students taking account of individual differences',
 ARRAY['Differentiated lesson plans','SEN adaptation records','Gifted and talented provision evidence'],3),
('3.2.1','3.2','3','Management of learning time',
 ARRAY['Lesson observation records','Timetable','Time-on-task evidence'],1),
('3.2.2','3.2','3','Management of student behaviour',
 ARRAY['Behaviour policy','Incident records','Classroom observation notes'],2),
('3.2.3','3.2','3','Stimulating student motivation to learn in accordance with their abilities and levels',
 ARRAY['Motivational strategies evidence','Student engagement records','Reward and recognition schemes'],3),
('3.3.1','3.3','3','Teachers delivery of lesson content and use of learning strategies',
 ARRAY['Lesson observation forms','Lesson plans','Teaching strategy examples'],1),
('3.3.2','3.3','3','Teachers use of language to enhance learning',
 ARRAY['Lesson observation notes','Language use examples','Bilingual teaching evidence'],2),
('3.3.3','3.3','3','Use of educational resources and aids including e-learning programmes and platforms',
 ARRAY['Resource inventory','E-learning platform usage data','Technology integration records'],3),
('3.3.4','3.3','3','Enabling students to express their views apply what they have learnt and learn from their mistakes',
 ARRAY['Student voice records','Feedback practices evidence','Error analysis examples'],4),
('3.3.5','3.3','3','Adaptation of teaching strategies to meet the needs of students with special needs disabilities or other barriers',
 ARRAY['IEP documents','SEN teaching adaptation records','Inclusion policy'],5),
('3.4.1','3.4','3','Linking learning to students real life',
 ARRAY['Real-world learning examples','Community project links','Applied learning records'],1),
('3.4.2','3.4','3','Enhancing the ability to question think and reflect beyond the scope of academic subjects',
 ARRAY['Critical thinking activities','Inquiry-based learning records','Reflection journals'],2),
('3.4.3','3.4','3','Promoting independent learning and collaboration',
 ARRAY['Independent project evidence','Group work records','Self-directed learning examples'],3),
('3.4.4','3.4','3','Developing a spirit of initiative and enhancing students ability to cope with changes',
 ARRAY['Innovation challenges records','Adaptability activities','Initiative-taking examples'],4),
('3.4.5','3.4','3','Developing literacy and numeracy skills and promoting a reading culture',
 ARRAY['Literacy programme records','Numeracy intervention evidence','Reading data'],5),
('3.4.6','3.4','3','Developing students digital skills',
 ARRAY['Digital skills programme','Student digital outputs','Technology curriculum evidence'],6),
('3.5.1','3.5','3','Using assessment methods that take account of individual differences and ensure realisation of learning objectives',
 ARRAY['Assessment plans','Differentiated assessments','Assessment variety examples'],1),
('3.5.2','3.5','3','Implementation of guidance from accrediting bodies',
 ARRAY['Assessment policy','External assessment guidelines compliance evidence','Moderation records'],2),
('3.5.3','3.5','3','Using students assessment results to support student learning and progress',
 ARRAY['Assessment analysis records','Feedback examples','Pupil progress meeting notes'],3),
('3.5.4','3.5','3','Follow-up of students progress in realising learning objectives with due consideration of individual differences',
 ARRAY['Progress tracking spreadsheets','Intervention records','Follow-up meeting minutes'],4),

-- Domain 4: School Climate and Learning Environment
('4.1.1','4.1','4','Security and safety arrangements and their licensing by competent entities',
 ARRAY['Safety license from competent authority','Fire safety certificate','Emergency evacuation plan','Maintenance records'],1),
('4.1.2','4.1','4','Appropriateness of school facilities for all students and teachers including those with disabilities',
 ARRAY['Accessibility audit','Disability access records','Facility inspection reports'],2),
('4.1.3','4.1','4','Cleanliness and attractiveness of the school',
 ARRAY['Cleaning schedule','Maintenance log','Inspection records','Photos'],3),
('4.1.4','4.1','4','Equipping school facilities with safe teaching aids whether during in-person or distance learning',
 ARRAY['Equipment inventory','Safety check records','Distance learning platform evidence'],4),
('4.2.1','4.2','4','A school culture that encourages students to explore their individual capabilities and talents',
 ARRAY['Talent identification records','Extra-curricular activity list','Student capability profiles'],1),
('4.2.2','4.2','4','Enhancing and celebrating students talents and capacities and developing them in line with their desires and needs',
 ARRAY['Competition participation records','Exhibition evidence','Achievement celebration photos','External recognition'],2),
('4.3.1','4.3','4','A culture of promoting childrens rights',
 ARRAY['Child protection policy','Anti-bullying policy','Rights education records'],1),
('4.3.2','4.3','4','Taking care of students psychological and physical wellbeing',
 ARRAY['Counsellor records','Wellbeing programme evidence','Support referral records'],2),
('4.3.3','4.3','4','Support and care for students experiencing barriers to their learning',
 ARRAY['IEP records','Learning support plans','SEN register','Intervention evidence'],3),
('4.3.4','4.3','4','Preparing students for academic and professional paths',
 ARRAY['Career guidance programme','University application support records','Labour market awareness activities'],4),
('4.3.5','4.3','4','Understanding growth stages and preparing students to move from one grade to the next',
 ARRAY['Transition programme records','Grade progression data','Developmental support evidence'],5),
('4.4.1','4.4','4','A school environment that promotes scientific research and ethics',
 ARRAY['Science fair records','Research ethics policy','Research project evidence'],1),
('4.4.2','4.4','4','The schools approach to highlighting and appreciating students research outputs',
 ARRAY['Research exhibition records','Award certificates','Publication evidence','External recognition'],2),

-- Domain 5: Leadership, Management and Governance
('5.1.1','5.1','5','A vision and mission developed and implemented with the participation of the school community',
 ARRAY['Vision and mission statement','Community consultation records','Strategic plan'],1),
('5.1.2','5.1','5','Self-evaluation and its use in strategic planning and performance improvement',
 ARRAY['Self-evaluation document','School improvement plan','Evidence of SEF-based planning'],2),
('5.1.3','5.1','5','Joint work and effective communication with the school community to support improvement processes',
 ARRAY['Staff meeting minutes','Communication records','Working group evidence'],3),
('5.1.4','5.1','5','High expectations towards school staff and students',
 ARRAY['Performance targets','Recognition scheme records','Appraisal records'],4),
('5.2.1','5.2','5','Leaders understanding of the curriculum and the teaching practices necessary to achieve learning objectives',
 ARRAY['Leadership lesson observation records','Curriculum knowledge evidence','CPD participation'],1),
('5.2.2','5.2','5','Supervising teaching and learning processes in order to support students learning',
 ARRAY['Lesson observation schedule','Teaching quality review records','Supervision notes'],2),
('5.2.3','5.2','5','Directing the professional development of teachers to improve teaching',
 ARRAY['CPD plan','Training records','Teacher development reviews','CPD impact evidence'],3),
('5.2.4','5.2','5','Engaging students in educational improvement processes',
 ARRAY['Student voice records','Student council input evidence','Student satisfaction surveys'],4),
('5.2.5','5.2','5','Forming professional learning communities within the school and with other schools',
 ARRAY['PLC meeting minutes','Inter-school collaboration records','Professional network evidence'],5),
('5.3.1','5.3','5','Management of financial resources to support the learning of all students',
 ARRAY['Budget allocation records','Financial reports','Expenditure documentation'],1),
('5.3.2','5.3','5','Effective use of school facilities and teaching aids',
 ARRAY['Facility usage records','Resource management policy','Equipment allocation evidence'],2),
('5.3.3','5.3','5','Organising roles and responsibilities',
 ARRAY['Organisational chart','Job descriptions','Delegation records'],3),
('5.3.4','5.3','5','Managing human resources and enhancing their professional competence',
 ARRAY['Staff records','Recruitment policy','HR management evidence','Professional competence reviews'],4),
('5.4.1','5.4','5','Engaging parents in school life',
 ARRAY['Parent meeting records','Parent engagement activities','Communication logs'],1),
('5.4.2','5.4','5','Enabling parents to support their childrens learning',
 ARRAY['Parent workshop records','Learning support guidance sent to parents','Parent feedback'],2),
('5.4.3','5.4','5','Partnership with community establishments to contribute to improving school life',
 ARRAY['MOU/partnership agreements','Community project records','Sponsor engagement evidence'],3),
('5.5.1','5.5','5','Accountability according to roles and responsibilities',
 ARRAY['Accountability framework','Performance review records','Roles and responsibilities documentation'],1),
('5.5.2','5.5','5','Implementation of policies and rules relating to schoolwork',
 ARRAY['Policy register','Policy review records','Policy implementation evidence'],2),
('5.5.3','5.5','5','Transparency in data provision and sharing',
 ARRAY['Data sharing policy','Parent communication records','Public reporting evidence'],3);

-- DEFAULT AUDIT CHECKLIST ITEMS
-- (Insert for each new school during onboarding trigger)
```

---

## ⚙️ JUDGEMENT CALCULATION ENGINE

Create this file at `src/lib/judgement.ts`. This is the core business logic — implement exactly as specified:

```typescript
// Judgement levels: 1=Outstanding, 2=Good, 3=Satisfactory, 4=Unsatisfactory, 5=Needs Urgent Intervention
export type JudgementLevel = 1 | 2 | 3 | 4 | 5;

export const JUDGEMENT_LABELS: Record<JudgementLevel, string> = {
  1: 'Outstanding',
  2: 'Good',
  3: 'Satisfactory',
  4: 'Unsatisfactory',
  5: 'Needs Urgent Intervention',
};

export const JUDGEMENT_COLORS: Record<JudgementLevel, string> = {
  1: '#437a22',   // green
  2: '#006494',   // blue
  3: '#d19900',   // gold/amber
  4: '#da7101',   // orange
  5: '#a12c7b',   // maroon
};

// Calculate standard rating: average of its indicators, rounded
export function calcStandardRating(indicatorRatings: number[]): JudgementLevel {
  if (!indicatorRatings.length) return 3;
  const avg = indicatorRatings.reduce((a, b) => a + b, 0) / indicatorRatings.length;
  return Math.round(avg) as JudgementLevel;
}

// Domain 1: Academic Achievement
// Primary standards: 1.1 (Attainment), 1.2 (Progress) — HIGH WEIGHT
// Supporting standard: 1.3 (Learning Skills)
export function calcDomain1(s11: JudgementLevel, s12: JudgementLevel, s13: JudgementLevel): JudgementLevel {
  if (s11 === 5 || s12 === 5) return 5;
  if (s11 === 1 && s12 === 1 && s13 <= 2) return 1;
  if (s11 <= 2 && s12 <= 2 && s13 <= 3) return 2;
  if (s11 <= 3 && s12 <= 3 && s13 <= 4) return 3;
  if (s11 === 4 || s12 === 4) return 4;
  return 3;
}

// Domain 2: Personal Development
export function calcDomain2(s21: JudgementLevel, s22: JudgementLevel, s23: JudgementLevel, s24: JudgementLevel): JudgementLevel {
  if (s21 === 5 || s22 === 5) return 5;
  const primaries = [s21, s22];
  const maxPrimary = Math.max(...primaries) as JudgementLevel;
  const supporting = [s23, s24];
  const maxSupporting = Math.max(...supporting) as JudgementLevel;
  if (maxPrimary === 1 && maxSupporting <= 2) return 1;
  if (maxPrimary <= 2 && maxSupporting <= 3) return 2;
  if (maxPrimary <= 3 && maxSupporting <= 4) return 3;
  if (maxPrimary === 4) return 4;
  return 3;
}

// Domain 3: Teaching and Assessment
// Primary: 3.1, 3.2, 3.3, 3.5 — HIGH WEIGHT
// Supporting: 3.4
export function calcDomain3(s31: JudgementLevel, s32: JudgementLevel, s33: JudgementLevel, s34: JudgementLevel, s35: JudgementLevel): JudgementLevel {
  const primaries = [s31, s32, s33, s35];
  const maxPrimary = Math.max(...primaries) as JudgementLevel;
  if (maxPrimary === 5) return 5;
  if (maxPrimary === 1 && s34 <= 2) return 1;
  if (maxPrimary <= 2 && s34 <= 3) return 2;
  if (maxPrimary <= 3 && s34 <= 4) return 3;
  if (maxPrimary === 4) return 4;
  return 3;
}

// Domain 4: School Climate and Learning Environment
// Primary: 4.1, 4.2, 4.3 — HIGH WEIGHT within domain
// Supporting: 4.4
export function calcDomain4(s41: JudgementLevel, s42: JudgementLevel, s43: JudgementLevel, s44: JudgementLevel): JudgementLevel {
  const primaries = [s41, s42, s43];
  const maxPrimary = Math.max(...primaries) as JudgementLevel;
  if (maxPrimary === 5) return 5;
  if (maxPrimary === 1 && s44 <= 2) return 1;
  if (maxPrimary <= 2 && s44 <= 3) return 2;
  if (maxPrimary <= 3 && s44 <= 4) return 3;
  if (maxPrimary === 4) return 4;
  return 3;
}

// Domain 5: Leadership, Management and Governance
// Primary: 5.1, 5.2, 5.3, 5.5 — HIGH WEIGHT
// Supporting: 5.4
export function calcDomain5(s51: JudgementLevel, s52: JudgementLevel, s53: JudgementLevel, s54: JudgementLevel, s55: JudgementLevel): JudgementLevel {
  const primaries = [s51, s52, s53, s55];
  const maxPrimary = Math.max(...primaries) as JudgementLevel;
  if (maxPrimary === 5) return 5;
  if (maxPrimary === 1 && s54 <= 2) return 1;
  if (maxPrimary <= 2 && s54 <= 3) return 2;
  if (maxPrimary <= 3 && s54 <= 4) return 3;
  if (maxPrimary === 4) return 4;
  return 3;
}

// OVERALL SCHOOL JUDGEMENT
// Domains 1, 3, 5 = HIGH WEIGHT (must ALL be at target level)
// Domains 2, 4 = MEDIUM WEIGHT
// Rules from OAAAQA Table 4:
export function calcOverallJudgement(d1: JudgementLevel, d2: JudgementLevel, d3: JudgementLevel, d4: JudgementLevel, d5: JudgementLevel): JudgementLevel {
  // Any NUI in high-weight domain = NUI overall
  if (d1 === 5 || d3 === 5 || d5 === 5) return 5;
  // Any NUI in medium-weight domain = Unsatisfactory overall
  if (d2 === 5 || d4 === 5) return 4;
  // Outstanding: ALL high-weight = Outstanding, medium-weight = Good or better
  if (d1 === 1 && d3 === 1 && d5 === 1 && d2 <= 2 && d4 <= 2) return 1;
  // Good: ALL high-weight = Good or better, medium-weight = Satisfactory or better
  if (d1 <= 2 && d3 <= 2 && d5 <= 2 && d2 <= 3 && d4 <= 3) return 2;
  // Satisfactory: ALL high-weight = Satisfactory or better, medium = Unsatisfactory or better
  if (d1 <= 3 && d3 <= 3 && d5 <= 3 && d2 <= 4 && d4 <= 4) return 3;
  // Unsatisfactory: any high-weight = Unsatisfactory
  if (d1 === 4 || d3 === 4 || d5 === 4) return 4;
  return 3;
}

// Follow-up visit requirement based on overall judgement
export function getFollowUpRequirement(judgement: JudgementLevel): { required: boolean; months: number | null; label: string } {
  if (judgement <= 3) return { required: false, months: null, label: 'No follow-up visit required' };
  if (judgement === 4) return { required: true, months: 24, label: 'Follow-up visit required within 24 months' };
  return { required: true, months: 12, label: 'Follow-up visit required within 12 months (urgent)' };
}

// Convert numeric score to judgement label
export function getJudgementLabel(rating: JudgementLevel): string {
  return JUDGEMENT_LABELS[rating];
}

// Get compliance percentage (higher = worse since 1=best)
// Inverts scale for display: 1=100%, 5=0%
export function ratingToPercent(rating: number): number {
  return Math.round(((5 - rating) / 4) * 100);
}
```

---

## 🤖 AI FEEDBACK ENGINE

### Supabase Edge Function: `supabase/functions/ai-feedback/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Anthropic from 'npm:@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const { scope, indicatorId, indicatorDescription, rating, ratingLabel, strengths,
          improvementAreas, evidenceCount, outstandingDescriptor, satisfactoryDescriptor,
          keyEvidence, domainName, standardName } = await req.json();

  let prompt = '';

  if (scope === 'indicator') {
    prompt = `You are an expert school quality assurance consultant for OAAAQA (Oman Authority for Academic Accreditation and Quality Assurance of Education).

A school in Oman is self-evaluating against the School Evaluation Framework (SEF). Help them improve their compliance.

**Indicator:** ${indicatorId} — ${indicatorDescription}
**Domain:** ${domainName} | **Standard:** ${standardName}
**School's self-rating:** ${rating}/5 (${ratingLabel})
**Stated strengths:** ${strengths || 'None provided'}
**Stated improvement areas:** ${improvementAreas || 'None provided'}
**Evidence files uploaded:** ${evidenceCount}

**What OUTSTANDING looks like for this indicator:**
${outstandingDescriptor || 'Not specified'}

**What SATISFACTORY looks like:**
${satisfactoryDescriptor || 'Not specified'}

**Recommended evidence types for this indicator:**
${keyEvidence?.join(', ') || 'Not specified'}

Provide your response as JSON with these exact keys:
{
  "assessment": "Brief honest assessment of whether self-rating seems accurate (2-3 sentences)",
  "gap_analysis": "What specifically separates this school from Outstanding (2-3 sentences)",
  "recommendations": [
    {"action": "Specific action", "priority": "critical|high|medium|low", "timeframe": "immediate|1-month|1-term|1-year"}
  ],
  "evidence_needed": ["specific evidence type 1", "specific evidence type 2", "specific evidence type 3"],
  "reviewer_focus": "What an OAAAQA reviewer will specifically look for during the visit for this indicator",
  "priority": "critical|high|medium|low"
}

Be specific to the Omani educational context. Use the framework's own language. Do not be vague.`;
  }

  if (scope === 'overall') {
    const { domainScores, overallJudgement, schoolName, academicYear, indicators_rated, indicators_total } = await req.json();
    prompt = `You are an expert OAAAQA school quality consultant.

School: ${schoolName}
Academic Year: ${academicYear}
Overall Projected Judgement: ${overallJudgement}
Indicators Rated: ${indicators_rated}/${indicators_total}

Domain Scores (1=Outstanding, 5=NUI):
${JSON.stringify(domainScores, null, 2)}

Provide a JSON response:
{
  "executive_summary": "3-4 sentence overall picture of the school's compliance position",
  "highest_risk_areas": ["indicator or standard ID with brief reason"],
  "strengths_to_build_on": ["2-3 genuine strengths"],
  "priority_90_day_actions": [
    {"action": "specific action", "domain": "domain name", "impact": "why this matters for judgement"}
  ],
  "audit_readiness_score": 0-100,
  "key_message": "One sentence the principal should share with all staff"
}`;
  }

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const feedback = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'Parse failed', raw: content };

  return new Response(JSON.stringify(feedback), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
```

---

## 🖥️ COMPLETE PAGE SPECIFICATIONS

### Page 1: Dashboard (`/dashboard`)

**Layout:** Sidebar (fixed, 240px) + main content area

**KPI Row (4 cards):**
- Overall Compliance Score: `ratingToPercent(overallJudgement)%` with colour-coded badge showing judgement label
- Indicators Rated: `rated / total` with progress bar
- Evidence Files: total count uploaded
- Action Items: `pending / total` with overdue highlighted in red

**Domain Radar Chart (Recharts RadarChart):**
- 5 axes: Academic Achievement, Personal Development, Teaching & Assessment, School Climate, Leadership
- Score inverted for display (5-rating so higher = better visually)
- Show current year vs previous year if data exists

**Domain Cards Row (5 cards):**
Each shows: domain name, judgement badge (colour-coded), progress bar, evidence count, % indicators rated

**Compliance Trend (LineChart):** Monthly score snapshots over the academic year

**Evidence Coverage Grid:** Heatmap grid — each cell = one indicator, green if has evidence, red if missing

**Top Action Items:** 5 most urgent, with quick-complete button

**Audit Countdown:** If audit date set → "X days until audit" with urgency colour

---

### Page 2: Domains Overview (`/domains`)

5 domain cards in a grid. Each card:
- Domain number + name
- Colour-coded judgement badge
- List of standards with mini status dots
- Evidence count + indicators rated count
- "View →" link

---

### Page 3: Domain Detail (`/domains/:domainId`)

- Domain header with description and overall judgement
- Judgement logic explainer (e.g. "This domain's judgement is HIGH WEIGHT and contributes directly to the overall school judgement")
- Standards accordion list:
  - Each standard: name, calculated rating, indicator completion progress bar
  - Expand to see list of indicators with their current ratings
  - "Rate Indicators" button links to standard page

---

### Page 4: Standard/Indicator Rating (`/domains/:domainId/:standardId`)

**Two-column layout:**

LEFT — Indicator Rating Panel:
- For each indicator:
  - ID badge (e.g. 3.5.1) + full description
  - Rating selector: 5 buttons (Outstanding / Good / Satisfactory / Unsatisfactory / NUI) with colour coding
  - Strengths textarea
  - Areas for Improvement textarea
  - Evidence count badge (links to evidence panel)
  - "Get AI Feedback" button → shows feedback inline below
  - Save button (auto-saves on change with debounce)

RIGHT — Evidence Panel:
- Filter by indicator
- Drag-and-drop upload area
- File list with: name, type icon, date, linked indicator chip, delete
- "Link to Indicator" button for existing files

---

### Page 5: Evidence Library (`/evidence`)

- Search bar + filters (domain, standard, indicator, file type, date, tags)
- View toggle: Grid / List
- Evidence cards: thumbnail/icon, filename, indicator tags, upload date
- Bulk actions bar (when items selected): Download ZIP, Delete, Re-link
- **Coverage Widget (sidebar):** 
  - Indicators with 0 evidence: RED count
  - Indicators with 1-2 files: AMBER count
  - Indicators with 3+ files: GREEN count

---

### Page 6: Self-Evaluation Document (`/self-evaluation`)

**Wizard with 2 sections:**

Section 1 — School Profile:
- School name (EN/AR), type, governorate, wilayat, principal name
- Student/teacher counts by gender
- School levels offered
- Vision + Mission
- Key contextual factors / unique challenges

Section 2 — Domain Evaluations (tab per domain):
- Auto-populated summary table: indicator ID, rating, rated?, has evidence?
- Editable: Overall Strengths (rich text), Overall Improvement Areas (rich text)
- "AI Draft" button: generates narrative from ratings + evidence + framework language
- Completeness indicator: % of indicators rated, % with evidence

Export button: Generates formatted PDF using jsPDF

---

### Page 7: Improvement Plan (`/improvement-plan`)

**Kanban board:** 4 columns — Not Started | In Progress | Completed | Overdue

Each card:
- Title
- Indicator reference chip (e.g. "3.3.1")
- Owner avatar + name
- Due date (red if overdue)
- Priority badge
- Quick status update button

Header stats: Total | % Complete | Overdue count | Avg completion time

Filters: Domain, Priority, Owner, Status

"Add Action" modal: title, description, indicator link, owner, due date, priority, success metric

---

### Page 8: Audit Preparation (`/audit-prep`)

**Audit date setter** at top with countdown

**Pre-Audit Checklist** (auto-seeded per school, checkable):
- [ ] Self-evaluation document fully completed
- [ ] All domain narratives written
- [ ] School profile section complete
- [ ] Evidence uploaded for at least 80% of indicators
- [ ] Student performance data (last 3 years) uploaded
- [ ] Lesson plans for review week prepared
- [ ] Staff interview schedule drafted
- [ ] Parent and student surveys distributed
- [ ] School facilities inspection walkthrough completed
- [ ] Safety certificates and licenses up to date
- [ ] Improvement plan updated and active
- [ ] Previous audit recommendations addressed (if applicable)
- [Add custom item]

**Evidence Gap Report:** Auto-list of all indicators with 0 evidence, grouped by domain

**Risk Radar:** Indicators rated Unsatisfactory or NUI — shown as a priority list with recommended actions

**Evidence Package Export:** Button → ZIP file of all evidence organized by domain/standard folder structure

---

### Page 9: Reports (`/reports`)

Report cards (click to preview + download):
1. **Full Self-Evaluation Report** — OAAAQA formatted document
2. **Executive Compliance Summary** — 1-page overview for the principal
3. **Domain Deep-Dive** — Select one domain, full detail
4. **Evidence Coverage Report** — Which indicators have/lack evidence
5. **Improvement Plan Status** — Action items by status/domain
6. **KPI Trend Report** — Historical score charts
7. **Audit Readiness Report** — Overall readiness % with gap analysis

Each: Preview modal + Download PDF button

---

### Page 10: Settings (`/settings`)

Tabs:
- **School Profile** — Edit all school details
- **Users** — Invite staff (email invite), assign roles, deactivate
- **Academic Year** — Switch active year, view historical data
- **Audit Dates** — Set expected/last audit dates
- **Notifications** — Email alerts for overdue actions, upcoming audit
- **Data** — Export full data (JSON), import CSV data

---

## 📁 FOLDER STRUCTURE

```
madrasa-comply/
├── src/
│   ├── components/
│   │   ├── ui/                    # shadcn/ui base components
│   │   ├── layout/
│   │   │   ├── AppShell.tsx       # Sidebar + topbar wrapper
│   │   │   ├── Sidebar.tsx        # Navigation sidebar
│   │   │   └── TopBar.tsx         # Header with school name + user menu
│   │   ├── dashboard/
│   │   │   ├── KPICards.tsx
│   │   │   ├── DomainRadar.tsx
│   │   │   ├── ComplianceTrend.tsx
│   │   │   ├── EvidenceHeatmap.tsx
│   │   │   └── ActionItemsWidget.tsx
│   │   ├── domains/
│   │   │   ├── DomainCard.tsx
│   │   │   ├── StandardAccordion.tsx
│   │   │   └── IndicatorRatingForm.tsx
│   │   ├── evidence/
│   │   │   ├── UploadZone.tsx
│   │   │   ├── EvidenceCard.tsx
│   │   │   └── CoverageWidget.tsx
│   │   ├── ai/
│   │   │   ├── FeedbackPanel.tsx
│   │   │   └── AIAssistButton.tsx
│   │   └── reports/
│   │       └── PDFGenerator.tsx
│   ├── pages/
│   │   ├── auth/
│   │   │   ├── LoginPage.tsx
│   │   │   └── OnboardingPage.tsx  # New school setup wizard
│   │   ├── DashboardPage.tsx
│   │   ├── DomainsPage.tsx
│   │   ├── DomainDetailPage.tsx
│   │   ├── StandardPage.tsx
│   │   ├── EvidencePage.tsx
│   │   ├── SelfEvaluationPage.tsx
│   │   ├── ImprovementPlanPage.tsx
│   │   ├── AuditPrepPage.tsx
│   │   ├── ReportsPage.tsx
│   │   └── SettingsPage.tsx
│   ├── stores/
│   │   ├── schoolStore.ts         # Current school + profile
│   │   ├── ratingsStore.ts        # Cached indicator ratings
│   │   └── uiStore.ts             # Sidebar state, modals
│   ├── hooks/
│   │   ├── useSchool.ts
│   │   ├── useIndicatorRatings.ts
│   │   ├── useEvidence.ts
│   │   ├── useJudgements.ts       # Calls judgement.ts calculations
│   │   └── useAIFeedback.ts
│   ├── lib/
│   │   ├── supabase.ts            # Supabase client init
│   │   ├── judgement.ts           # SEF judgement calculator (see above)
│   │   ├── pdf.ts                 # PDF generation helpers
│   │   └── utils.ts               # General utilities
│   ├── types/
│   │   └── index.ts               # All TypeScript interfaces
│   └── main.tsx
├── supabase/
│   ├── migrations/
│   │   └── 001_initial.sql        # All migrations above
│   ├── seed.sql                   # All seed data above
│   └── functions/
│       └── ai-feedback/
│           └── index.ts           # Edge function above
├── public/
├── .env.local
├── package.json
└── vite.config.ts
```

---

## 🔐 ENVIRONMENT VARIABLES

```env
# .env.local
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# supabase/functions/.env (for edge function only — never in frontend)
ANTHROPIC_API_KEY=your-claude-api-key
```

---

## 🎨 DESIGN SYSTEM

```css
:root {
  /* Judgement colours */
  --outstanding: #437a22;
  --good: #006494;
  --satisfactory: #d19900;
  --unsatisfactory: #da7101;
  --nui: #a12c7b;

  /* Brand (Oman-inspired teal) */
  --primary: #01696f;
  --primary-hover: #0c4e54;

  /* Surfaces */
  --bg: #f7f6f2;
  --surface: #ffffff;
  --border: #e2e0db;

  /* Text */
  --text: #1a1a1a;
  --text-muted: #6b7280;
}
```

**Fonts:** Satoshi (body, via Fontshare) + Instrument Serif (headings, Google Fonts)

**Logo:** SVG incorporating Omani crescent + book motif in teal. Show school name next to logo in topbar.

---

## 🚀 BUILD ORDER — Phase by Phase

Build in this exact sequence. After each phase, confirm it runs before proceeding.

### Phase 1 — Project Setup (30 min)
1. `npm create vite@latest madrasa-comply -- --template react-ts`
2. Install: Tailwind, shadcn/ui, React Router, Zustand, TanStack Query, React Hook Form, Zod, Lucide React, Recharts, jsPDF, i18next, Supabase JS client
3. Configure Tailwind with design tokens
4. Set up `.env.local` with Supabase credentials
5. Set up Supabase client in `src/lib/supabase.ts`
6. Run migrations + seed in Supabase SQL Editor
7. Create storage bucket named `evidence-files` (public read, auth write)

### Phase 2 — Auth + Shell (45 min)
8. Build Login page with Supabase Auth (email + password)
9. Build School Onboarding wizard (for new schools: school name, type, governorate, principal name)
10. Build AppShell with sidebar navigation + topbar
11. Set up React Router with all routes, protected by auth

### Phase 3 — Framework Core (60 min)
12. Implement `judgement.ts` exactly as specified above
13. Build Domains Overview page
14. Build Domain Detail page
15. Build Standard/Indicator rating page with auto-save

### Phase 4 — Evidence System (45 min)
16. Build file upload component (Supabase Storage)
17. Build Evidence Library page
18. Build evidence-indicator linking

### Phase 5 — Dashboard (60 min)
19. Build KPI cards
20. Build Recharts RadarChart (domain scores)
21. Build compliance trend line chart
22. Build evidence coverage heatmap (CSS grid)
23. Build action items widget
24. Build audit countdown

### Phase 6 — AI Feedback (30 min)
25. Deploy Supabase Edge Function
26. Build AI feedback trigger on indicator page
27. Build overall AI report on dashboard

### Phase 7 — Self-Evaluation + Reports (60 min)
28. Build self-evaluation wizard
29. Build PDF export (jsPDF)
30. Build improvement plan Kanban
31. Build audit preparation checklist
32. Build reports page

### Phase 8 — Polish (30 min)
33. Loading skeletons on all data-loading views
34. Empty states on all list views
35. Toast notifications (success/error)
36. Mobile responsiveness check
37. Deploy to Vercel

---

## ✅ DEFINITION OF DONE

- [ ] All 5 domains, 21 standards, 60+ indicators seeded and navigable
- [ ] Schools can rate every indicator with notes and the rating persists
- [ ] Judgement auto-calculates: indicator → standard → domain → overall
- [ ] Evidence files upload to Supabase Storage and link to indicators
- [ ] Dashboard shows live KPIs with radar chart and trend
- [ ] AI feedback generates at indicator and overall level
- [ ] Self-evaluation document exports as PDF
- [ ] Improvement plan Kanban is functional
- [ ] Audit preparation checklist is functional
- [ ] Multi-tenant: School A cannot see School B's data (RLS enforced)
- [ ] App deploys successfully on Vercel

---

## OPENING INSTRUCTION FOR CLAUDE CODE

Paste this at the very top when starting a new Claude Code session:

> "Build the Madrasa Comply application exactly as specified in this document. Work through the Build Order phases in sequence. After completing each phase, pause and confirm what was built before moving to the next phase. Ask me if any requirement is unclear. Do not skip the database migrations or seed data — these are critical. Start with Phase 1."

