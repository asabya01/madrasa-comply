# OAAAQA School Evaluation Platform — Build Reference Guide

> A compiled reference document for developers and architects building the OAAAQA school self-evaluation platform. Draws from Mesma's user guide, SchooliP/Derventio's inspection toolkit, the UK Government School Inspection Toolkit (2025), the IEEE 830 SRS standard, and multi-tenant SaaS architecture patterns. All content is adapted and mapped to the OAAAQA context.

---

## Part 1: Software Requirements Specification (SRS) — IEEE 830 Adapted for Supabase Stack

### 1.1 Purpose

This SRS defines the functional and non-functional requirements for the OAAAQA School Self-Evaluation Platform — a multi-tenant, role-based web application enabling Omani schools to conduct structured self-evaluation against the OAAAQA 2024 framework, generate School Evaluation Documents (SEDs), and manage improvement planning.

### 1.2 Scope

The system shall:
- Enable school staff to rate 56 indicators across 5 domains and 21 standards
- Auto-calculate domain and overall school judgements using OAAAQA-defined conditional logic
- Collect and link evidence files to indicators
- Generate structured SEDs in PDF/DOCX format
- Support role-based access with 5 distinct permission levels
- Track improvement plans (Areas for Improvement, Tasks, Impact Notes)
- Provide student proficiency, attendance, and national exam data inputs for quantitative judgements
- Support Arabic and English bilingual interface

### 1.3 Definitions

| Term | Definition |
|------|-----------|
| SED | School Evaluation Document — the formal output of the self-evaluation process |
| AFI | Area for Improvement — a specific weakness identified during self-evaluation |
| RAG | Red / Amber / Green — traffic light status system for indicators |
| Domain | One of 5 top-level evaluation areas in the OAAAQA framework |
| Standard | One of 21 sub-areas within the 5 domains |
| Indicator | One of 56 measurable criteria within the 21 standards |
| Proficiency Rate | Percentage of students scoring ≥75% in a given subject and grade |
| Cohort Progress | 3-year trend in proficiency rates for a cohort |
| Overall Judgement | The final school-level grade derived from domain judgements |

### 1.4 System Overview

The platform is a single-page web application with the following layers:

```
Frontend (React + TypeScript + Vite + Tailwind + shadcn/ui)
        ↓
Supabase Auth (JWT-based, role stored in user_metadata or profiles table)
        ↓
Supabase PostgreSQL (Row-Level Security enforced per school_id)
        ↓
Supabase Edge Functions (AI feedback, PDF generation, notifications)
        ↓
Vercel (hosting, CI/CD from GitHub)
```

### 1.5 User Classes and Roles

| Role | Arabic | Scope | Key Permissions |
|------|--------|-------|-----------------|
| Super Admin | مدير النظام | Platform-wide | All schools, all data, user management |
| School Admin | مدير المدرسة | One school | All school data, approve SEDs, manage users |
| Head of Department | رئيس القسم | Own department | Rate indicators in domain, manage teachers |
| Teacher | معلم | Own classes | Rate Domain 3 indicators at class level, submit evidence |
| Reader / Inspector | قارئ | One school (read-only) | View all data, no edits |

---

## Part 2: Functional Requirements by Module

### 2.1 Authentication & Access Control

**FR-AUTH-01:** The system shall authenticate users via Supabase Auth (email/password).  
**FR-AUTH-02:** Each user shall be assigned exactly one role per school.  
**FR-AUTH-03:** Row-Level Security (RLS) shall enforce that users can only read/write data belonging to their assigned school(s).  
**FR-AUTH-04:** Super Admins shall be able to impersonate any school for support purposes.  
**FR-AUTH-05:** All Edge Function calls shall require a valid JWT in the `Authorization: Bearer <token>` header, injected automatically via `supabase.functions.invoke()`.  
**FR-AUTH-06:** Session tokens shall refresh automatically. On expiry, the user shall be redirected to the login screen.

### 2.2 School & Academic Year Management

**FR-SCH-01:** Super Admins shall create and manage school profiles (name AR/EN, type, governorate, OAAAQA school code, contact details).  
**FR-SCH-02:** Each school shall have one or more academic years. Each academic year has a start date, end date, and an active/closed status.  
**FR-SCH-03:** Self-evaluation data shall be scoped to a specific academic year.  
**FR-SCH-04:** School Admins shall be able to open and close academic years for their school.  
**FR-SCH-05:** Only one academic year per school may be active at a time.

### 2.3 Indicator Rating (Self-Evaluation Core)

**FR-RATE-01:** All users with rating permission shall rate each indicator on a 4-point scale: Outstanding (4), Good (3), Satisfactory (2), Needs Improvement (1).  
**FR-RATE-02:** Each rating shall include a mandatory evidence narrative (text field, min 50 characters).  
**FR-RATE-03:** Teachers shall rate Domain 3 indicators at the class level (one rating per class per indicator).  
**FR-RATE-04:** HODs shall rate Domain 1, 2, 4, and 5 indicators at the standard level.  
**FR-RATE-05:** School Admins shall be able to override any rating with a note explaining the override.  
**FR-RATE-06:** The system shall display a completion percentage per domain showing how many indicators have been rated.  
**FR-RATE-07:** Indicators shall display the full Arabic and English names from the seeded reference table.

### 2.4 Evidence Management

**FR-EVID-01:** Users shall upload evidence files (PDF, DOCX, XLSX, JPG, PNG; max 20MB per file) via Supabase Storage.  
**FR-EVID-02:** Each uploaded file shall be linkable to one or more indicators.  
**FR-EVID-03:** Evidence files shall be served as signed URLs (time-limited, default 1 hour) to prevent unauthorised access.  
**FR-EVID-04:** Evidence files shall be organised into folders (by domain, standard, or custom label).  
**FR-EVID-05:** Users shall be able to add, rename, and delete folders they own.  
**FR-EVID-06:** All file metadata (uploader, upload date, linked indicators) shall be stored in the database.

### 2.5 Calculation Engine

This is the most critical module. All calculations follow the OAAAQA 2024 Schools Guide exactly.

#### 2.5.1 Student Proficiency Rate

\[
PR_{s,g} = \frac{\text{Number of students scoring} \geq 75\%}{\text{Total students in subject } s \text{ and grade } g} \times 100
\]

The school-wide subject proficiency rate is the average of all grade-level rates for that subject.

**Table 8 — Proficiency Rate Judgement Scale:**

| Proficiency Rate | Judgement |
|-----------------|-----------|
| 70% and above | Outstanding |
| 55% – 69% | Good |
| 40% – 54% | Satisfactory |
| Below 40% | Needs Urgent Intervention |

#### 2.5.2 National Exam Comparison (Table 7)

| Difference from National Average | Judgement |
|----------------------------------|-----------|
| School average exceeds national by more than 1.5% | Above national average |
| Within ±1.5% of national average | At national average |
| School average below national by more than 1.5% | Below national average |

#### 2.5.3 Cohort Progress (Table 9)

Based on 3-year proficiency rate trend for the same cohort:

| Trend | Judgement |
|-------|-----------|
| Consistent improvement or stable high performance | Strong Progress |
| Minor fluctuations with no clear direction | Stable |
| Clear decline over two or more consecutive years | Sharp Drop |

#### 2.5.4 Attendance Judgement (Table 11)

| Attendance Rate | Judgement |
|----------------|-----------|
| 96% and above | Outstanding |
| 90% – 95% | Good |
| 85% – 89% | Satisfactory |
| Below 85% | Needs Urgent Intervention |

#### 2.5.5 Domain Judgement Logic

Domain judgements are **NOT** simple averages. Each domain has conditional logic per the OAAAQA framework. The key principle: a domain cannot be rated higher than its weakest critical standard, and specific combinations of standard ratings determine the outcome.

**FR-CALC-01:** The calculation engine shall implement the exact conditional domain judgement rules from PSD Section 4.7 for all 5 domains.  
**FR-CALC-02:** Where a domain judgement cannot be determined due to missing data, the system shall display "Incomplete" and indicate which indicators are missing.  
**FR-CALC-03:** The system shall display a calculation trace — showing each step of how the final judgement was reached — accessible to School Admins and above.  
**FR-CALC-04:** Domain judgements shall automatically recalculate when any indicator rating within that domain changes.  
**FR-CALC-05:** The overall school judgement shall weight Domains 1, 3, and 5 more heavily, per OAAAQA rules.

#### 2.5.6 Overall School Judgement

**FR-CALC-06:** The overall school judgement shall be determined by the combination of all 5 domain judgements using the OAAAQA conditional matrix (not a mean average).  
**FR-CALC-07:** If any domain is "Needs Improvement", the overall school judgement shall not exceed "Satisfactory" unless specific override conditions are met per the OAAAQA guide.

### 2.6 Improvement Planning (ADRI Framework)

Modelled on Mesma's Quality Action Plan (QAP) and the OAAAQA ADRI cycle (Approach → Deployment → Results → Improvement).

**FR-IMP-01:** Users shall create Areas for Improvement (AFIs) linked to specific indicators or standards.  
**FR-IMP-02:** Each AFI shall have: title, description, expected impact, due date, owner (assigned user), and status.  
**FR-IMP-03:** AFI status shall be one of: Not Started → In Progress → Complete → Overdue (auto-set when past due date without completion).  
**FR-IMP-04:** Each AFI shall support multiple Tasks. Tasks have: title, owner, due date, and completion date.  
**FR-IMP-05:** Tasks must be completed before an AFI can be marked complete (system warning if attempted otherwise).  
**FR-IMP-06:** Users shall add Impact Notes to AFIs — timestamped progress updates with a current impact selector (Not Met / Partially Met / Met / Exceeded).  
**FR-IMP-07:** Completed AFIs shall be archivable. Archived AFIs remain visible in a separate view and can be restored.  
**FR-IMP-08:** The system shall issue email reminders for overdue Tasks and AFIs (via Supabase Edge Function + email provider).  
**FR-IMP-09:** All action plans shall follow SMART criteria — the UI shall provide inline guidance prompts for each field.

### 2.7 SED Generator (School Evaluation Document)

**FR-SED-01:** The system shall generate a complete SED in DOCX and PDF format on demand.  
**FR-SED-02:** The SED shall include: school profile, academic year, all 5 domains with standard and indicator ratings, evidence narratives, domain judgements, overall judgement, and improvement plan summary.  
**FR-SED-03:** The SED shall display both Arabic and English text for all framework elements.  
**FR-SED-04:** Each indicator section in the SED shall include clickable links to associated evidence files.  
**FR-SED-05:** The SED shall be generated via a Supabase Edge Function and returned as a downloadable file.  
**FR-SED-06:** Generated SEDs shall be stored in Supabase Storage and accessible from the school dashboard.  
**FR-SED-07:** Only School Admins and above shall be able to trigger SED generation.

### 2.8 AI Feedback Module

**FR-AI-01:** The system shall provide AI-generated feedback on indicator evidence narratives via the `ai-feedback` Edge Function.  
**FR-AI-02:** All calls to the Edge Function shall use `supabase.functions.invoke()` to ensure the JWT is automatically attached.  
**FR-AI-03:** AI feedback shall be presented as suggestions only — users must explicitly accept or dismiss them.  
**FR-AI-04:** AI feedback requests shall be rate-limited to prevent abuse (max 20 requests per user per day).  
**FR-AI-05:** AI feedback content shall be stored in the database linked to the indicator and academic year.

---

## Part 3: Non-Functional Requirements

### 3.1 Performance

**NFR-PERF-01:** Page load time (LCP) shall be under 2.5 seconds on a standard broadband connection.  
**NFR-PERF-02:** Calculation engine shall return results within 1 second for a full 56-indicator dataset.  
**NFR-PERF-03:** The platform shall support up to 500 concurrent users without degradation.  
**NFR-PERF-04:** SED generation shall complete within 30 seconds for a full school evaluation.

### 3.2 Security

**NFR-SEC-01:** All data in transit shall be encrypted via HTTPS/TLS 1.3.  
**NFR-SEC-02:** All data at rest shall be encrypted via Supabase's AES-256 default encryption.  
**NFR-SEC-03:** Row-Level Security (RLS) shall be enabled on every table containing school data.  
**NFR-SEC-04:** The `get_my_school_ids()` Postgres function shall be used in all RLS policies to scope data correctly.  
**NFR-SEC-05:** Service role keys shall never be exposed to the frontend. All privileged operations go through Edge Functions.  
**NFR-SEC-06:** File uploads shall be scanned for malware before storage (via Edge Function middleware).

### 3.3 Reliability & Availability

**NFR-REL-01:** Target uptime: 99.5% (excluding scheduled maintenance).  
**NFR-REL-02:** Supabase automatic backups shall be enabled (daily, retained 7 days minimum).  
**NFR-REL-03:** All form data shall be auto-saved to prevent loss on session timeout.

### 3.4 Usability

**NFR-USE-01:** The interface shall support both Arabic (RTL) and English (LTR) layouts, switchable per user preference.  
**NFR-USE-02:** All error messages shall be displayed in the user's selected language.  
**NFR-USE-03:** Mobile responsiveness is required for tablet (768px+). Mobile phone (375px+) is secondary priority.  
**NFR-USE-04:** All interactive elements shall meet WCAG 2.1 AA contrast standards.  
**NFR-USE-05:** The system shall provide inline guidance text for all rating and evidence fields.

### 3.5 Maintainability

**NFR-MAIN-01:** All database changes shall be managed via versioned Supabase migration files.  
**NFR-MAIN-02:** The OAAAQA framework reference data (domains, standards, indicators) shall be stored in seeded database tables — not hardcoded in frontend code.  
**NFR-MAIN-03:** Calculation logic shall be isolated in a single `judgement.ts` module with unit tests.  
**NFR-MAIN-04:** All environment variables shall be managed via Vercel environment settings and Supabase secrets.

---

## Part 4: Database Schema Reference

### 4.1 Core Tables

```sql
-- Reference tables (seeded, read-only)
domains (id, code, name_ar, name_en, weight, sort_order)
standards (id, code, domain_id, name_ar, name_en, sort_order)
indicators (id, code, standard_id, name_ar, name_en, sort_order, is_quantitative)

-- Multi-tenancy
schools (id, name_ar, name_en, oaaaqa_code, type, governorate, created_at)
academic_years (id, school_id, name, start_date, end_date, is_active)

-- Users & Roles
profiles (id, user_id, school_id, role, full_name_ar, full_name_en)

-- Organisational Structure
grades (id, school_id, name_ar, name_en, sort_order)
classes (id, school_id, grade_id, name, academic_year_id, teacher_id)

-- Self-Evaluation
indicator_ratings (id, school_id, academic_year_id, indicator_id, rated_by, 
                   rating, evidence_narrative, rated_at)
teacher_indicator_ratings (id, class_id, indicator_id, rated_by, 
                            rating, evidence_narrative, rated_at)

-- Evidence
evidence_files (id, school_id, academic_year_id, file_name, file_path, 
                file_size, mime_type, uploaded_by, folder_id, created_at)
evidence_indicator_links (id, evidence_file_id, indicator_id, linked_by, created_at)
evidence_folders (id, school_id, name, parent_folder_id, created_by)

-- Quantitative Data
student_performance (id, school_id, academic_year_id, grade_id, subject, 
                     total_students, students_above_75, national_avg, 
                     prior_year_rate, two_years_prior_rate)
attendance_records (id, school_id, academic_year_id, grade_id, 
                    total_school_days, total_absences, attendance_rate)

-- Judgements (computed, stored for audit trail)
standard_judgements (id, school_id, academic_year_id, standard_id, judgement, computed_at)
domain_judgements (id, school_id, academic_year_id, domain_id, judgement, 
                   trace_json, computed_at)
overall_judgements (id, school_id, academic_year_id, judgement, trace_json, computed_at)

-- Improvement Planning
action_items (id, school_id, academic_year_id, indicator_id, title, description,
              expected_impact, due_date, owner_id, status, completion_date,
              actual_impact, is_archived, created_at, updated_at)
action_tasks (id, action_item_id, title, owner_id, due_date, 
              completion_date, status, created_at)
impact_notes (id, action_item_id, content, current_impact, created_by, created_at)

-- AI Feedback
ai_feedback (id, school_id, indicator_id, academic_year_id, prompt_text, 
             response_text, accepted, created_by, created_at)

-- SED Documents
sed_documents (id, school_id, academic_year_id, file_path, generated_by, 
               generated_at, overall_judgement_snapshot)
```

### 4.2 RLS Policy Pattern

Every school-scoped table must include policies using this helper function:

```sql
CREATE OR REPLACE FUNCTION get_my_school_ids()
RETURNS uuid[] AS $$
  SELECT ARRAY(
    SELECT school_id FROM profiles WHERE user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Example RLS policy on indicator_ratings:
CREATE POLICY "Users can view ratings for their school"
ON indicator_ratings FOR SELECT
USING (school_id = ANY(get_my_school_ids()));

CREATE POLICY "Users can insert ratings for their school"
ON indicator_ratings FOR INSERT
WITH CHECK (school_id = ANY(get_my_school_ids()));
```

---

## Part 5: Lessons from Mesma — UX & Workflow Patterns

The following patterns are drawn from Mesma's production user guide and adapted for the OAAAQA context.

### 5.1 Self-Evaluation Workflow (Mesma → OAAAQA Mapping)

| Mesma Concept | OAAAQA Equivalent | Implementation Note |
|--------------|-------------------|---------------------|
| Self-Evaluation (SE) | SED / Indicator Ratings | Live document, updated continuously |
| Topic | Indicator | Each has: describe, evaluate, enhance, RAG |
| RAG Status | 4-point rating (Outstanding→Needs Improvement) | Visual badge per indicator |
| Mark as Complete toggle | Submission status per indicator | Required before domain can be calculated |
| Quality Action Plan (QAP) | Improvement Plan (ADRI) | Linked to specific indicators |
| Area for Improvement (AFI) | Action Item | Title, expected impact, tasks, due date |
| Task | Sub-task of action item | Multiple per AFI, separate owner |
| Impact Note | Progress update | Timestamped, with impact selector |
| Export SE → DOCX | SED Generator | Full bilingual document |
| Export QAP → Excel | Improvement Plan export | Downloadable summary |

### 5.2 Key UX Principles from Mesma

1. **Live document model** — the self-evaluation is never "submitted" and locked. It is continuously updated to reflect current practice. This is the correct model for OAAAQA too.
2. **Completion tracking** — show users exactly which indicators are incomplete before calculating judgements. A progress bar per domain is essential.
3. **Evaluative language check** — Mesma highlights whether users are using evaluative vs. descriptive language. Consider an AI-assisted version of this for the evidence narrative field.
4. **Separate roles for QAP tasks** — a task within an AFI can be owned by a different user than the AFI itself. Implement this granularity in `action_tasks.owner_id`.
5. **Archive vs. Delete** — AFIs should never be deleted. Archive them. This preserves the audit trail.
6. **System reminders for overdue items** — automate email reminders via Supabase Edge Functions + a cron trigger.
7. **Export with field selector** — when exporting the SED or improvement plan, let users toggle which fields to include before generating.

---

## Part 6: Lessons from Ofsted / Derventio — Inspection-Ready Design

Drawn from the UK Government School Inspection Toolkit (2025) and Derventio's SchooliP self-evaluation guide.

### 6.1 Grade Descriptor Pattern

The Ofsted model uses a 5-tier scale per evaluation area: Exemplary → Strong → Secure → Attention Needed → Causing Concern (plus Met/Not Met for safeguarding as a limiting judgement).

The OAAAQA equivalent uses: Outstanding → Good → Satisfactory → Needs Improvement, with domain-specific conditional logic determining the overall. The key structural similarity is the **limiting judgement concept** — a weak score in a critical standard caps the overall domain grade, regardless of other strong scores.

**Design implication:** The calculation trace UI must clearly show which standard "limited" the domain judgement, so school leaders understand exactly what to improve.

### 6.2 Self-Evaluation as a Live Improvement Tool

The Derventio toolkit makes this explicit: self-evaluation is not just inspection preparation — it is a continuous improvement cycle. The platform should reinforce this through:

- Dashboard showing improvement over time (not just current status)
- Comparison between academic years (are we better than last year?)
- Notification when an indicator rating drops from the previous year
- Celebration UI when an indicator improves (e.g., subtle animation on rating upgrade)

### 6.3 Grade Descriptor Display

Each indicator in the rating UI should display the OAAAQA grade descriptors inline — what does "Outstanding" mean for this specific indicator? This reduces subjectivity and improves inter-rater reliability. Store descriptors in the `indicators` table as `descriptor_outstanding_ar`, `descriptor_outstanding_en`, etc.

### 6.4 Evidence-to-Judgement Traceability

Inspectors need to be able to follow the chain: **Evidence file → Indicator rating → Standard judgement → Domain judgement → Overall judgement**. The SED must make this chain visible and navigable.

### 6.5 Next Steps Field per Indicator

The Ofsted/Derventio model includes a "Next Steps" section for each grade. Add a `next_steps` text field to `indicator_ratings` — auto-populated by the AI feedback module and editable by the user. This becomes the basis for the improvement plan.

---

## Part 7: Architecture Patterns for Multi-Tenant School SaaS

### 7.1 Tenancy Model

Use the **shared database, shared schema** model with row-level security. All schools share the same tables; `school_id` foreign keys + RLS policies enforce isolation.

```
Platform
├── School A (school_id = uuid-a)
│   ├── Academic Year 2024-2025
│   └── Academic Year 2025-2026
├── School B (school_id = uuid-b)
└── School C (school_id = uuid-c)
```

**Do not** create separate Supabase projects or schemas per school — this creates an operational and migration nightmare as school count grows.

### 7.2 Role Enforcement Layers

Enforce roles at three layers (all three are required):

1. **Frontend** — hide UI elements the user doesn't have permission to see (cosmetic only, not security)
2. **Supabase RLS** — enforce at the database level using `auth.uid()` and role checks
3. **Edge Functions** — verify JWT and check role from the `profiles` table before executing privileged operations

```typescript
// Edge Function role check pattern
const { data: profile } = await supabase
  .from('profiles')
  .select('role')
  .eq('user_id', user.id)
  .single()

if (!['school_admin', 'super_admin'].includes(profile.role)) {
  return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
}
```

### 7.3 Calculation Engine Architecture

The judgement engine should be a **pure TypeScript module** with no side effects — given the same inputs, it always returns the same output. This makes it testable and debuggable.

```typescript
// judgement.ts structure
export function calculateDomain1Judgement(ratings: IndicatorRatings): DomainResult
export function calculateDomain2Judgement(ratings: IndicatorRatings): DomainResult
export function calculateDomain3Judgement(ratings: IndicatorRatings, performanceData: PerformanceData): DomainResult
export function calculateDomain4Judgement(ratings: IndicatorRatings, attendanceData: AttendanceData): DomainResult
export function calculateDomain5Judgement(ratings: IndicatorRatings): DomainResult
export function calculateOverallJudgement(domainResults: DomainResult[]): OverallResult

// Each result includes a trace for display
type DomainResult = {
  judgement: 'Outstanding' | 'Good' | 'Satisfactory' | 'NeedsImprovement'
  trace: TraceStep[]
  limitingStandard?: string
}
```

Store computed results in the `domain_judgements` and `overall_judgements` tables with a `trace_json` column. Recompute on every rating change via a React Query mutation that invalidates the judgement query.

### 7.4 File Storage Structure

```
supabase-storage/
└── school-evidence/
    └── {school_id}/
        └── {academic_year_id}/
            └── {folder_id or 'root'}/
                └── {uuid}_{original_filename}
```

Always use UUIDs in storage paths. Never use original filenames directly (XSS risk). Store the original filename in the `evidence_files` table for display.

### 7.5 SED Generation Pattern

```
User clicks "Generate SED"
        ↓
Frontend calls supabase.functions.invoke('generate-sed', { body: { school_id, academic_year_id } })
        ↓
Edge Function queries all ratings, judgements, evidence, improvement plan
        ↓
Edge Function builds DOCX using docx.js library (or calls external PDF API)
        ↓
Edge Function uploads file to supabase-storage/sed-documents/{school_id}/{timestamp}.docx
        ↓
Edge Function inserts record into sed_documents table
        ↓
Edge Function returns signed URL to frontend
        ↓
Frontend triggers browser download
```

---

## Part 8: Phase-by-Phase Implementation Checklist

### Phase 1 — Foundation (Weeks 1–2)
- [ ] Fix 4 known bugs (super admin tabs, JWT 401, indicator titles, action_items 409)
- [ ] Run migration `012_psd_missing_tables.sql`
- [ ] Seed all 5 domains, 21 standards, 56 indicators with AR/EN names
- [ ] Implement `get_my_school_ids()` and RLS on all school-scoped tables
- [ ] School profile management screen
- [ ] Academic year management screen
- [ ] Role-based route guards in React Router

### Phase 2 — Core Self-Evaluation (Weeks 3–5)
- [ ] Indicator rating UI (4-point scale + evidence narrative)
- [ ] Teacher self-assessment for Domain 3 (class-level ratings)
- [ ] Classroom observation recording
- [ ] Evidence file upload and folder management
- [ ] Evidence-to-indicator linking
- [ ] Completion tracking per domain (progress bars)

### Phase 3 — Calculation Engine (Weeks 6–7)
- [ ] `judgement.ts` module with all 5 domain functions
- [ ] Student proficiency rate input and calculation (Table 8)
- [ ] National exam comparison (Table 7)
- [ ] Cohort progress (Table 9)
- [ ] Attendance judgement (Table 11)
- [ ] Overall school judgement calculation
- [ ] Calculation trace display in UI
- [ ] Auto-recalculation on rating change

### Phase 4 — Documents & Improvement (Weeks 8–10)
- [ ] Improvement plan UI (AFIs, Tasks, Impact Notes)
- [ ] SMART guidance prompts in AFI creation form
- [ ] Overdue notifications via Edge Function
- [ ] SED Generator Edge Function
- [ ] SED DOCX output with bilingual content
- [ ] AI feedback integration (fixed JWT)
- [ ] Year-on-year comparison view

### Phase 5 — QA & Pilot (Weeks 11–13)
- [ ] Arabic RTL layout review
- [ ] Full bilingual content audit
- [ ] RLS penetration testing (verify cross-school isolation)
- [ ] Calculation engine unit tests against OAAAQA sample scenarios
- [ ] Pilot school UAT session
- [ ] Performance testing under load
- [ ] Accessibility audit (WCAG 2.1 AA)

---

## Part 9: Key External References

| Document | Source | Relevance |
|----------|--------|-----------|
| OAAAQA Schools Guide 2024 | Ministry of Education, Oman | Primary specification — all framework logic |
| Mesma User Guide | Skills Development Scotland | UX patterns for SE and QAP workflows |
| UK School Inspection Toolkit 2025 | UK Government / Ofsted | Grade descriptor patterns, limiting judgement concept |
| Derventio SchooliP Self-Evaluation Guide | Derventio Education | Plain-English framework interpretation, next steps model |
| IEEE Std 830-1993 | IEEE | SRS structure and requirements documentation standard |
| ENQA SAR Content Guide 2025 | European Quality Assurance | Self-assessment report content guidance |
| Supabase RLS Documentation | Supabase | Row-level security implementation |
| Multi-tenant SaaS Architecture | Microsoft M365 Education | Multi-school tenancy patterns |



---

## Part 10: Governance Compliance Requirements (Added from OAAAQA Guide Section 10)

This section documents additional app requirements derived directly from the governance, external review, and compliance sections of the OAAAQA Schools Guide 2024. These were not covered in the original PSD and must be added to future phases.

### 10.1 Pre-External Review Compliance Checklist (Section 10.1)

The OAAAQA guide specifies that three months before an external review, the school leadership attends a training workshop. Within **five weeks** of that workshop, the school must submit its completed SED (Annex 1) to OAAAQA's CSEQA portal.

**New App Requirements:**

- **FR-GOV-01:** The app shall support an "External Review Mode" flag per academic year, indicating the school is in pre-review preparation.
- **FR-GOV-02:** The app shall display a countdown timer showing days remaining until the 5-week SED submission deadline once the training date is entered by the School Admin.
- **FR-GOV-03:** The app shall display a Pre-Review Readiness Checklist on the School Admin dashboard with the following items:
  - [ ] SED all domains completed (all 56 indicators rated)
  - [ ] Evidence files uploaded and linked per domain
  - [ ] 3-year student performance data entered
  - [ ] Survey questionnaires distributed and results recorded
  - [ ] Teacher lesson plans uploaded
  - [ ] Social media accounts documented in school profile
  - [ ] SED submitted (date stamp)
- **FR-GOV-04:** The school profile shall include a field for official school social media account URLs (required by the review team preliminary visit).
- **FR-GOV-05:** The app shall support uploading and storing teacher lesson plans as evidence files, tagged with `evidence_type = 'lesson_plan'`.

### 10.2 Survey Questionnaire Module (Section 10.1 — Critical Gap)

The guide explicitly requires schools to distribute survey questionnaires to three groups — **teaching staff, parents, and students** — as part of external review requirements. Survey results are listed as a quantitative evidence source for multiple standards.

**New App Requirements:**

- **FR-SURV-01:** The app shall include a Survey Management module accessible to School Admins.
- **FR-SURV-02:** The system shall provide three pre-built survey templates per OAAAQA categories:
  - Teaching Staff Survey
  - Parents Survey
  - Students Survey
- **FR-SURV-03:** Each survey template shall contain questions mapped to specific OAAAQA domains and standards.
- **FR-SURV-04:** School Admins shall be able to generate a shareable survey link (no login required for respondents) per survey type.
- **FR-SURV-05:** Survey responses shall be stored anonymously in a `survey_responses` table scoped to `school_id` and `academic_year_id`.
- **FR-SURV-06:** The system shall display aggregate survey results per question as bar charts on a Survey Results dashboard.
- **FR-SURV-07:** Survey results shall be attachable as evidence to specific indicators (auto-linked to relevant indicators based on domain mapping).
- **FR-SURV-08:** Survey completion counts (e.g., "47 of ~120 parents responded") shall be visible on the Pre-Review Checklist.

**New Database Tables Required:**

```sql
survey_templates (id, name_ar, name_en, target_group, academic_year_id, school_id, 
                  share_token, is_active, created_at)

survey_questions (id, template_id, question_ar, question_en, question_type, 
                  domain_id, standard_id, sort_order)
-- question_type: 'scale_1_5' | 'yes_no' | 'text'

survey_responses (id, template_id, school_id, academic_year_id, 
                  responses_json, submitted_at)
-- responses_json: { question_id: answer, ... } — no personal data stored
```

### 10.3 Follow-Up Visit & Progress Report Module (Sections 8.1, 12)

Schools that receive a judgement of **Unsatisfactory** or **Needs Urgent Intervention** are subject to mandatory follow-up visits:

| Overall Judgement | Follow-Up Timeline |
|---|---|
| Needs Urgent Intervention | Within 12 months |
| Unsatisfactory | Within 24 months |
| Satisfactory or above | No follow-up required |

Before a follow-up visit, schools must submit a **Progress Report (Annex 4)** via the OAAAQA electronic system at least **3 weeks prior** to the visit.

**New App Requirements:**

- **FR-FUP-01:** The app shall record the outcome of any external review visit (date, overall judgement, domain judgements, reviewer recommendations) in a `review_visits` table.
- **FR-FUP-02:** If the recorded overall judgement is Unsatisfactory or Needs Urgent Intervention, the system shall automatically:
  - Set a follow-up visit deadline (12 or 24 months from review date)
  - Display a banner on the School Admin dashboard indicating follow-up visit is required
  - Show a countdown to the deadline
- **FR-FUP-03:** The system shall provide a **Progress Report (Annex 4) generator** — a structured form covering:
  - Actions taken since the external review per domain
  - Evidence of improvement (linked to evidence files)
  - Current self-assessed judgement per domain
  - Summary narrative (AR/EN)
- **FR-FUP-04:** The Progress Report shall be exportable as a DOCX file in the format expected by OAAAQA.
- **FR-FUP-05:** The system shall issue email reminders at 90, 60, 30, and 14 days before the follow-up visit deadline.
- **FR-FUP-06:** Super Admins shall have a dashboard showing all schools with pending follow-up visits, sorted by urgency.

**New Database Tables Required:**

```sql
review_visits (id, school_id, visit_date, visit_type, 
               -- visit_type: 'external_review' | 'follow_up_1' | 'follow_up_2'
               overall_judgement, domain_judgements_json, 
               reviewer_recommendations, follow_up_deadline, created_at)

progress_reports (id, school_id, review_visit_id, academic_year_id,
                  content_json, generated_at, submitted_at, file_path)
```

### 10.4 Governance Indicator Requirements (Standard 5.5)

Standard 5.5 has three indicators with specific evidence sources defined in the guide that the app must support:

**5.5.1 — Accountability according to roles and responsibilities**
- Key evidence: documented administrative accountability per job description, interview evidence that accountabilities operate effectively in practice.
- **App requirement (FR-GOV-10):** The app shall include a Staff Roles & Responsibilities register where School Admins can document job titles, responsibilities, and assigned users — this feeds directly into indicator 5.5.1 evidence.

**5.5.2 — Implementation of policies and rules relating to schoolwork**
- Key evidence: school policies and records, student and staff interview evidence of adherence to regulations.
- **App requirement (FR-GOV-11):** The app shall include a Policy & Regulations register — a simple list of school policies with title, last review date, and a file attachment. Linkable as evidence to indicator 5.5.2.

**5.5.3 — Transparency in data provision and sharing**
- Key evidence: the school's arrangements for gathering and analysing performance data, making results openly available to the whole school community.
- **App requirement (FR-GOV-12):** The app shall provide a **Public Summary Dashboard** — a read-only, shareable link (no login required) showing the school's current academic year performance summary: domain judgements (without detailed indicator data), improvement plan headline AFIs, and survey completion rates. This directly demonstrates Standard 5.5.3 compliance to external reviewers.

### 10.5 3-Year Performance Analysis Requirement (Section 10.1)

The guide explicitly requires schools to prepare "an analysis of the most recent student performance data before the external review visit, as well as an analysis of the past three years academic results."

**App requirement (FR-GOV-13):** The `student_performance` table must capture data for the current and two prior academic years per subject and grade. The system shall display a 3-year trend chart per subject showing proficiency rates across years. This must be accessible from the SED and the Pre-Review Checklist.

### 10.6 Self-Evaluation Team Documentation (Section 7.6)

The guide states that schools are "encouraged to establish an internal self-evaluation team" for completing the SED collaboratively.

**App requirement (FR-GOV-14):** The app shall support designating a Self-Evaluation Team — a subset of school users with a specific `is_sed_team` flag on their profile. Team members are listed on the SED cover page and receive task assignments and reminder notifications.

---

## Part 11: Updated Phase Checklist (Revised)

### Phase 1 — Foundation (Weeks 1–2) — unchanged
*(See Part 8 above)*

### Phase 2 — Core Self-Evaluation (Weeks 3–5) — unchanged
*(See Part 8 above)*

### Phase 3 — Calculation Engine + Surveys (Weeks 6–8)

- [ ] `judgement.ts` module with all 5 domain functions
- [ ] Student proficiency rate input and 3-year trend charts
- [ ] National exam comparison (Table 7)
- [ ] Cohort progress (Table 9)
- [ ] Attendance judgement (Table 11)
- [ ] Overall school judgement calculation + trace display
- [ ] **Survey Management module** (FR-SURV-01 to FR-SURV-08)
- [ ] Survey templates seeded for Staff, Parents, Students
- [ ] Anonymous survey response collection via shareable link
- [ ] Survey results dashboard with aggregate charts

### Phase 4 — Documents, Improvement & Governance (Weeks 9–11)

- [ ] Improvement plan UI (AFIs, Tasks, Impact Notes, ADRI)
- [ ] SED Generator Edge Function (DOCX + PDF)
- [ ] AI feedback integration (fixed JWT)
- [ ] **Pre-Review Readiness Checklist dashboard** (FR-GOV-02, FR-GOV-03)
- [ ] **External review visit recording** (FR-FUP-01)
- [ ] **Follow-up visit deadline tracking + reminders** (FR-FUP-02, FR-FUP-05)
- [ ] **Progress Report (Annex 4) generator** (FR-FUP-03, FR-FUP-04)
- [ ] **Staff Roles & Responsibilities register** (FR-GOV-10)
- [ ] **Policy & Regulations register** (FR-GOV-11)
- [ ] **Public Summary Dashboard** (FR-GOV-12)
- [ ] **Self-Evaluation Team designation** (FR-GOV-14)

### Phase 5 — QA & Pilot (Weeks 12–14) — unchanged
*(See Part 8 above)*

