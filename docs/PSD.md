# Product Specification Document (PSD)
## OAAAQA-Compliant School Self-Evaluation & Improvement Platform
**Version:** 1.0  
**Date:** April 2026  
**Authority Reference:** Oman Authority for Academic Accreditation and Quality Assurance of Education (OAAAQA) — *Schools Guide, First Version 2024*

---

## 1. Executive Summary

This document defines the complete product specification for a web-based School Self-Evaluation and Improvement Platform designed to comply fully with the OAAAQA School Evaluation Framework as mandated under Royal Decree No. 9/2021. The platform must support the entire self-evaluation lifecycle — from classroom-level data collection by individual teachers, through departmental and school-level aggregation, to the generation of a compliant Self-Evaluation Document (SED) ready for submission to OAAAQA external reviewers.

The system must serve five distinct user roles (Super Admin, School Admin, Head of Department, Teacher, and External Viewer), each with clearly defined data entry and visibility permissions. All judgement logic — proficiency rates, cohort progress tracking, domain judgements, and overall school performance — must be implemented precisely as specified in the OAAAQA framework, using the exact thresholds, formulae, and weighting logic defined in this document.

---

## 2. Regulatory & Compliance Context

### 2.1 Governing Authority

The platform is designed to comply with the **OAAAQA School Evaluation Framework (First Version, 2024)**, which governs all government and private schools in the Sultanate of Oman. The framework is the mandatory reference for all school self-evaluation, external review, and improvement planning activities.

### 2.2 Legal Basis

Royal Decree No. 9/2021 established OAAAQA's mandate to enforce quality assurance standards across Oman's school education system. All schools — government and private — are subject to periodic external review against the standards defined in the School Evaluation Framework.

### 2.3 Purpose of the Platform

The platform enables schools to:

- Conduct ongoing, evidence-based self-evaluation against all 5 domains, 21 standards, and 56 indicators of the School Evaluation Framework
- Collect classroom-level evidence from individual teachers to feed into school-level ratings
- Calculate quantitative performance metrics (proficiency rates, cohort progress, attendance) using OAAAQA-mandated formulae
- Generate and submit the official Self-Evaluation Document (SED) in the format required by OAAAQA
- Plan, implement, and monitor school improvement actions using the ADRI model
- Prepare evidence files organised by domain for external review teams

---

## 3. The OAAAQA School Evaluation Framework

This section defines the complete framework structure that the platform must implement. All logic, language, and judgement rules are sourced directly from the OAAAQA Schools Guide (2024).

### 3.1 Key Categories

The framework is structured into three Key Categories:

| Key Category | Description | Domains |
|---|---|---|
| Quality of Learning Outcomes | Students' demonstrated learning and personal growth | Domains 1, 2 |
| Quality of School Processes | All school activities carried out to achieve learning goals | Domains 3, 4 |
| Quality Assurance of Learning Outcomes and School Processes | Role of school leadership in ensuring quality | Domain 5 |

### 3.2 Domains and Standards (Complete List)

#### Domain 1: Academic Achievement

| Standard Code | Standard Name | Indicators |
|---|---|---|
| 1.1 | Academic Attainment | 1.1.1 Overall levels of students' attainment; 1.1.2 Students' attainment in classwork and assignments; 1.1.3 Equity of attainment for all learners |
| 1.2 | Academic Progress | 1.2.1 Students' overall attainment levels over time; 1.2.2 Students' academic progress in lessons; 1.2.3 Progress of vulnerable students |
| 1.3 | Learning Skills | 1.3.1 Independent learning skills; 1.3.2 Collaborative learning skills; 1.3.3 Higher-order thinking skills; 1.3.4 Application of learning to real-life contexts; 1.3.5 Digital literacy skills; 1.3.6 Reading culture |

#### Domain 2: Personal Development

| Standard Code | Standard Name | Indicators |
|---|---|---|
| 2.1 | Values and Behaviour | 2.1.1 Upholding shared human values; 2.1.2 Students' understanding of their rights and duties; 2.1.3 Students' enthusiasm and motivation towards learning |
| 2.2 | Identity and Citizenship | 2.2.1 Pride in Oman's identity, history and culture, loyalty to the Sultanate and His Majesty the Sultan; 2.2.2 Belonging to the Arab and Islamic identity and appreciation of the Arabic language; 2.2.3 Participation in voluntary work; 2.2.4 Consultation practices and election culture |
| 2.3 | Health and Environmental Awareness | 2.3.1 Commitment to safe and healthy lifestyles; 2.3.2 Students' engagement with environmental and climate issues |
| 2.4 | Innovation and Entrepreneurship | 2.4.1 Taking initiative in proposing new ideas and launching projects; 2.4.2 Managing projects to deliver outcomes; 2.4.3 Commitment to work ethics; 2.4.4 Communication and leading teams |

#### Domain 3: Teaching and Assessment

| Standard Code | Standard Name | Indicators |
|---|---|---|
| 3.1 | Curriculum Planning | 3.1.1 Planning the curriculum to achieve competencies and meet students' needs; 3.1.2 Making links between academic subjects to support integration of the curriculum as well as between the curriculum and the culture of the Sultanate of Oman; 3.1.3 Aligning the curriculum to meet the needs of all students, taking account of the individual differences between them |
| 3.2 | Class Management | 3.2.1 Management of learning time; 3.2.2 Management of student behaviour; 3.2.3 Stimulating student motivation to learn in accordance with their abilities and levels |
| 3.3 | Teaching Effectiveness | 3.3.1 Teachers' delivery of lesson content and use of learning strategies; 3.3.2 Teachers' use of language to enhance learning; 3.3.3 Use of educational resources and aids, including e-learning programmes and platforms; 3.3.4 Enabling students to express their views, apply what they have learnt and learn from their mistakes; 3.3.5 Adaptation of teaching strategies to meet the needs of students experiencing special needs, disabilities or other barriers to their learning |
| 3.4 | Developing Learning Skills | 3.4.1 Linking learning to students' real life; 3.4.2 Enhancing the ability to question, think and reflect beyond the scope of the academic subjects; 3.4.3 Promoting independent learning and collaboration; 3.4.4 Developing a spirit of initiative and enhancing students' ability to cope with changes; 3.4.5 Developing literacy and numeracy skills and promoting a reading culture; 3.4.6 Developing students' digital skills |
| 3.5 | Assessment and Progress Support | 3.5.1 Using assessment methods that take account of individual differences and ensure realisation of learning objectives; 3.5.2 Implementing assessments in accordance with the approved standards; 3.5.3 Using students' assessment results to support student learning and progress; 3.5.4 Follow-up of students' progress in realising learning objectives with due consideration of individual differences among students |

#### Domain 4: School Climate and Learning Environment

| Standard Code | Standard Name | Indicators |
|---|---|---|
| 4.1 | Quality of the Learning Environment | 4.1.1 Security and safety arrangements and their licensing by competent entities; 4.1.2 Appropriateness of school facilities for all students and teachers, including those with disabilities; 4.1.3 Cleanliness and attractiveness of the school; 4.1.4 Equipping school facilities with safe teaching aids, whether during in-person or distance learning |
| 4.2 | Fostering Students' Talents and Capabilities | 4.2.1 A school culture that encourages students to explore their individual capabilities and talents; 4.2.2 Enhancing and celebrating students' talents and capacities and developing them in line with their desires and needs |
| 4.3 | Support and Care | 4.3.1 A culture of promoting children's rights; 4.3.2 Taking care of students' psychological and physical wellbeing; 4.3.3 Support and care for students who are experiencing barriers to their learning, as a result of special needs, disabilities, or for other reasons; 4.3.4 Preparing students for academic and professional paths and supporting them; 4.3.5 Understanding growth stages and requirements and preparing students to move from one grade to the next |
| 4.4 | Developing Research Skills | 4.4.1 A school environment that promotes scientific research and ethics; 4.4.2 The school's approach to highlighting and appreciating students' research outputs |

#### Domain 5: Leadership, Management and Governance

| Standard Code | Standard Name | Indicators |
|---|---|---|
| 5.1 | Leadership of Change | 5.1.1 A vision and mission developed and implemented with the participation of the school community; 5.1.2 Self-evaluation and its use in strategic planning and performance improvement; 5.1.3 Joint work and effective communication with the school community to support improvement processes; 5.1.4 High expectations towards school staff and students |
| 5.2 | Leadership of Teaching and Learning | 5.2.1 Leaders' understanding of the curriculum and the teaching practices necessary to achieve learning objectives; 5.2.2 Supervising teaching and learning processes in order to support students' learning taking account of their individual differences; 5.2.3 Directing the professional development of teachers to improve teaching and increase the level of students' performance; 5.2.4 Engaging students in educational improvement processes; 5.2.5 Forming professional learning communities within the school, and with other schools |
| 5.3 | Managerial Competency | 5.3.1 Management of financial resources to support the learning of all students; 5.3.2 Effective use of school facilities and teaching aids; 5.3.3 Organising roles and responsibilities; 5.3.4 Managing human resources and enhancing their professional competence |
| 5.4 | Partnership with Parents and the Community | 5.4.1 Engaging parents in school life; 5.4.2 Enabling parents to support their children's learning; 5.4.3 Partnership with community establishments in a way that contributes to improving school life and supporting learning outcomes |
| 5.5 | Governance | 5.5.1 Accountability according to roles and responsibilities; 5.5.2 Implementation of policies and rules relating to schoolwork; 5.5.3 Transparency in data provision and sharing |

---

## 4. Judgement Logic & Calculations

This section defines all calculation rules exactly as specified by OAAAQA. The platform must implement all of these without deviation.

### 4.1 The Five-Point Judgement Scale

All indicators, standards, domains, and overall school performance are rated on the following five-point scale:

| Code | Judgement Label |
|---|---|
| 1 | Outstanding |
| 2 | Good |
| 3 | Satisfactory |
| 4 | Unsatisfactory |
| 5 | Needs Urgent Intervention |

### 4.2 Evaluative Terms

The platform must use the following standardised language when generating reports. The terms must match the quality and distribution dimensions shown:

| Judgement | Quality Terms | Distribution Terms |
|---|---|---|
| Outstanding | effective, distinguished, highly efficient, a model to emulate | all, almost everyone, the vast majority |
| Good | effective, good, notable | most, more |
| Satisfactory | acceptable, appropriate, suitable | the majority |
| Unsatisfactory | unacceptable, inappropriate, unsuitable, limited | few, a limited number |
| Needs Urgent Intervention | non-existent, rare, very limited | minority, rare number, very limited number, non-existent |

### 4.3 Student Proficiency Rate

**Definition:** The percentage of students scoring 75% or higher in final examinations for a given subject. OAAAQA defines a score of 75 as the threshold for students reaching mastery of subject competencies.

**Formula for a single subject in a single grade:**

\[ PR_{s,g} = \frac{\text{Number of students scoring} \geq 75\text{ in subject } s, \text{ grade } g}{\text{Total number of students in subject } s, \text{ grade } g} \times 100 \]

**School-wide average proficiency rate across all core subjects and all grades:**

\[ PR_{school} = \frac{\sum_{g=1}^{G} \sum_{s=1}^{S} PR_{s,g}}{G \times S} \]

Where:
- \( G \) = total number of grades in the school
- \( S \) = total number of core subjects evaluated

**Core subjects for proficiency calculation:**
- Islamic Education
- Arabic Language
- English Language
- Mathematics
- Science
- Social Studies

**Proficiency Rate Judgement Scale (Table 8 in OAAAQA Guide):**

| Code | Judgement | Proficiency Rate Threshold |
|---|---|---|
| 1 | Outstanding | 70% or above |
| 2 | Good | 60% to less than 70% |
| 3 | Satisfactory | 50% to less than 60% |
| 4 | Unsatisfactory | 40% to less than 50% |
| 5 | Needs Urgent Intervention | Less than 40% |

### 4.4 National Examination Performance

The platform must allow entry of national exam performance data and compare it against the national average. The difference is calculated as:

\[ \Delta_{national} = \bar{X}_{school} - \bar{X}_{national} \]

Where \( \bar{X}_{school} \) is the school's average score in national exams and \( \bar{X}_{national} \) is the national average for the same exam.

**Evaluation Scale (Table 7 in OAAAQA Guide):**

| Difference (\( \Delta_{national} \)) | Judgement |
|---|---|
| ≥ 1.5 | Significantly above the national average |
| > 0.5 and < 1.5 | Slightly above the national average |
| 0 to ≤ 0.5 | Close to the national average (positive) |
| Result is 0 | Consistent with the national average |
| > -0.5 and < 0 | Slightly below the national average |
| ≥ -0.5 and ≤ -1.5 | Below the national average |
| < -1.5 | Significantly below the national average |

### 4.5 Cohort Progress (3-Year Trend Analysis)

External reviewers and the school's self-evaluation must analyse the average proficiency rate over the last **three academic years** to describe cohort progress. The platform must store and present proficiency data by year to enable this tracking.

**Cohort progress is described as follows (Table 9 in OAAAQA Guide):**

| Change in Average Proficiency Rate | Description |
|---|---|
| More than 15% increase | Strong Progress |
| More than 10% to 15% increase | Significant Progress |
| More than 5% to 10% increase | Mild Progress |
| Between 5% increase and 5% decrease | Stable |
| More than 5% to 10% decrease | Mild Decrease |
| More than 10% to 15% decrease | Significant Decrease |
| More than 15% decrease | Sharp Drop |

**Additional rule:** If the average proficiency rate rises from one judgement level to a higher one on the proficiency scale (e.g., from Satisfactory to Good), the progress is described as **Significant Progress**. If it rises by two levels, it is described as **Strong Progress**. The reverse applies for declines.

### 4.6 Student Attendance

The school-wide average attendance rate across all grades is evaluated as follows (Table 11 in OAAAQA Guide):

| Judgement | Attendance Rate |
|---|---|
| Outstanding | 96% and above |
| Good | 94% to less than 96% |
| Satisfactory | 92% to less than 94% |
| Unsatisfactory | 90% to less than 92% |
| Needs Urgent Intervention | Less than 90% |

**Formula:**

\[ AR_{school} = \frac{\text{Total student days attended across all grades}}{\text{Total possible student days across all grades}} \times 100 \]

### 4.7 Domain Judgement Rules

Domains are judged based on the combination of standard-level judgements, not by averaging. The logic per domain is specified below exactly as stated in the OAAAQA guide.

#### Domain 1: Academic Achievement

| Judgement | Rule |
|---|---|
| Outstanding | Standards 1.1 AND 1.2 are Outstanding; Standard 1.3 is no lower than Good |
| Good | One or both of 1.1 or 1.2 are Good (neither lower than Good); 1.3 is no lower than Satisfactory |
| Satisfactory | One or both of 1.1 or 1.2 are Satisfactory (neither lower than Satisfactory); 1.3 is no lower than Unsatisfactory |
| Unsatisfactory | One or both of 1.1 and 1.2 are Unsatisfactory (neither lower); OR 1.3 is Needs Urgent Intervention |
| Needs Urgent Intervention | One or both of 1.1 and 1.2 are Needs Urgent Intervention (1.3 can be at any level) |

#### Domain 2: Personal Development

| Judgement | Rule |
|---|---|
| Outstanding | Standards 2.1 AND 2.2 are Outstanding; 2.3 and 2.4 are no lower than Good |
| Good | One or both of 2.1 or 2.2 are Good (neither lower than Good); 2.3 and 2.4 are no lower than Satisfactory |
| Satisfactory | One or both of 2.1 or 2.2 are Satisfactory (neither lower); 2.3 and 2.4 are no lower than Unsatisfactory |
| Unsatisfactory | One or both of 2.1 and 2.2 are Unsatisfactory (neither lower); OR one or both of 2.3 and 2.4 are Needs Urgent Intervention |
| Needs Urgent Intervention | One or both of 2.1 and 2.2 are Needs Urgent Intervention (2.3 and 2.4 at any level) |

#### Domain 3: Teaching and Assessment

| Judgement | Rule |
|---|---|
| Outstanding | Standards 3.1, 3.2, 3.3, AND 3.5 are Outstanding; 3.4 is no lower than Good |
| Good | One or all of 3.1, 3.2, 3.3 and 3.5 are Good (none lower than Good); 3.4 is no lower than Satisfactory |
| Satisfactory | One or all of 3.1, 3.2, 3.3 and 3.5 are Satisfactory (none lower); 3.4 is no lower than Unsatisfactory |
| Unsatisfactory | One or all of 3.1, 3.2, 3.3 and 3.5 are Unsatisfactory (none lower); OR 3.4 is Needs Urgent Intervention |
| Needs Urgent Intervention | One or all of 3.1, 3.2, 3.3 and 3.5 are Needs Urgent Intervention (3.4 at any level) |

#### Domain 4: School Climate and Learning Environment

| Judgement | Rule |
|---|---|
| Outstanding | Standards 4.1, 4.2, AND 4.3 are Outstanding; 4.4 is no lower than Good |
| Good | One or all of 4.1, 4.2 and 4.3 are Good (none lower than Good); 4.4 is no lower than Satisfactory |
| Satisfactory | One or all of 4.1, 4.2 and 4.3 are Satisfactory (none lower); 4.4 is no lower than Unsatisfactory |
| Unsatisfactory | One or all of 4.1, 4.2 and 4.3 are Unsatisfactory (none lower); OR 4.4 is Needs Urgent Intervention |
| Needs Urgent Intervention | One or all of 4.1, 4.2 and 4.3 are Needs Urgent Intervention (4.4 at any level) |

#### Domain 5: Leadership, Management and Governance

| Judgement | Rule |
|---|---|
| Outstanding | Standards 5.1, 5.2, 5.3, AND 5.5 are Outstanding; 5.4 is no lower than Good |
| Good | One or all of 5.1, 5.2, 5.3 and 5.5 are Good (none lower than Good); 5.4 is no lower than Satisfactory |
| Satisfactory | One or all of 5.1, 5.2, 5.3 and 5.5 are Satisfactory (none lower); 5.4 is no lower than Unsatisfactory |
| Unsatisfactory | One or all of 5.1, 5.2, 5.3 and 5.5 are Unsatisfactory (none lower); OR 5.4 is Needs Urgent Intervention |
| Needs Urgent Intervention | One or all of 5.1, 5.2, 5.3 and 5.5 are Needs Urgent Intervention (5.4 at any level) |

### 4.8 Overall School Performance Judgement

The overall performance judgement is **not** a simple average of the five domain scores. It uses a conditional logic model where Domains 1, 3, and 5 carry greater weight in determining the overall outcome. The exact rules are as follows (Table 4 in OAAAQA Guide):

| Overall Judgement | Rule |
|---|---|
| **Outstanding** | Domains 1, 3, and 5 are all Outstanding; Domains 2 and 4 are no lower than Good |
| **Good** | One or all of Domains 1, 3, or 5 are Good (none lower than Good); Domains 2 and 4 are no lower than Satisfactory |
| **Satisfactory** | One or all of Domains 1, 3, or 5 are Satisfactory (none lower than Satisfactory); Domains 2 and 4 are no lower than Unsatisfactory |
| **Unsatisfactory** | One or all of Domains 1, 3, or 5 are Unsatisfactory (none lower than Unsatisfactory); OR one or both of Domains 2 and 4 are Needs Urgent Intervention |
| **Needs Urgent Intervention** | One or all of Domains 1, 3, or 5 are Needs Urgent Intervention |

> **Implementation Note:** Domains 2 (Personal Development) and 4 (School Climate and Learning Environment) are essential components of the framework but have a lesser impact on the overall performance judgement than Domains 1, 3, and 5. This reflects the current stage of the system's implementation, not a lower importance of these domains in practice.

---

## 5. System Architecture

### 5.1 Data Hierarchy

The platform organises all data in the following strict hierarchy:

```
Platform (Super Admin)
└── School
    ├── Academic Year
    ├── Grades (e.g., Grade 1 – Grade 12)
    │   └── Classes (e.g., Grade 5-A, Grade 5-B)
    │       ├── Teacher (assigned to class + subject)
    │       └── Student Cohort (count by grade/subject)
    ├── Departments / Subject Areas
    │   └── Head of Department (HOD)
    ├── Teachers
    │   ├── Teacher Indicator Self-Ratings (Domain 3 indicators)
    │   ├── Classroom Observation Records
    │   └── Evidence Files
    ├── Student Performance Data
    │   ├── Proficiency rates by subject, grade, academic year
    │   └── Attendance rates by grade, academic year
    ├── Domain-level Indicator Ratings
    │   ├── Indicator ratings (Domains 1, 2, 4, 5)
    │   └── Evidence files per indicator
    ├── Standard Judgements (auto-calculated)
    ├── Domain Judgements (auto-calculated)
    ├── Overall School Judgement (auto-calculated)
    ├── Action Items / Improvement Plan
    └── Self-Evaluation Document (generated)
```

### 5.2 Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite |
| UI Components | Tailwind CSS + shadcn/ui |
| Backend / Database | Supabase (PostgreSQL) |
| Authentication | Supabase Auth (JWT) |
| File Storage | Supabase Storage |
| AI Features | Supabase Edge Functions → OpenAI / Anthropic API |
| Deployment | Vercel |
| State Management | Zustand or React Query (TanStack Query) |

---

## 6. Database Schema

### 6.1 Core Tables

#### `schools`
```sql
id              UUID PRIMARY KEY
name_en         TEXT NOT NULL
name_ar         TEXT
governorate     TEXT
school_type     TEXT  -- 'government' | 'private'
education_cycle TEXT  -- 'primary' | 'intermediate' | 'secondary' | 'combined'
created_at      TIMESTAMP
```

#### `academic_years`
```sql
id          UUID PRIMARY KEY
school_id   UUID REFERENCES schools(id)
label       TEXT NOT NULL  -- e.g., '2024-2025'
start_date  DATE
end_date    DATE
is_current  BOOLEAN DEFAULT false
```

#### `users`
```sql
id          UUID PRIMARY KEY  -- matches Supabase auth.users.id
school_id   UUID REFERENCES schools(id)
role        TEXT NOT NULL  -- 'super_admin' | 'school_admin' | 'hod' | 'teacher'
full_name   TEXT
email       TEXT
subject_area TEXT  -- for teachers and HODs
created_at  TIMESTAMP
```

#### `grades`
```sql
id          UUID PRIMARY KEY
school_id   UUID REFERENCES schools(id)
label       TEXT NOT NULL  -- e.g., 'Grade 5'
cycle       TEXT  -- 'primary' | 'intermediate' | 'secondary'
sort_order  INTEGER
```

#### `classes`
```sql
id               UUID PRIMARY KEY
school_id        UUID REFERENCES schools(id)
grade_id         UUID REFERENCES grades(id)
academic_year_id UUID REFERENCES academic_years(id)
label            TEXT NOT NULL  -- e.g., '5-A'
teacher_id       UUID REFERENCES users(id)
subject          TEXT NOT NULL  -- e.g., 'Mathematics'
student_count    INTEGER
```

#### `domains`
```sql
id       UUID PRIMARY KEY
code     INTEGER NOT NULL  -- 1 to 5
name_en  TEXT NOT NULL
name_ar  TEXT
```

#### `standards`
```sql
id          UUID PRIMARY KEY
domain_id   UUID REFERENCES domains(id)
code        TEXT NOT NULL   -- e.g., '1.1', '3.3'
name_en     TEXT NOT NULL
name_ar     TEXT
is_primary  BOOLEAN  -- true for primary standards (1.1, 1.2, 3.1, 3.2, 3.3, 3.5, etc.)
```

#### `indicators`
```sql
id           UUID PRIMARY KEY
standard_id  UUID REFERENCES standards(id)
code         TEXT NOT NULL   -- e.g., '1.1.1', '3.3.1'
name_en      TEXT NOT NULL
name_ar      TEXT
data_type    TEXT  -- 'qualitative' | 'quantitative'
applies_to   TEXT  -- 'school' | 'teacher' | 'both'
sort_order   INTEGER
```

#### `indicator_ratings`
```sql
id               UUID PRIMARY KEY
school_id        UUID REFERENCES schools(id)
academic_year_id UUID REFERENCES academic_years(id)
indicator_id     UUID REFERENCES indicators(id)
rated_by         UUID REFERENCES users(id)
rating           INTEGER  -- 1 (Outstanding) to 5 (Needs Urgent Intervention)
notes            TEXT
created_at       TIMESTAMP
updated_at       TIMESTAMP
```

#### `teacher_indicator_ratings`
```sql
id               UUID PRIMARY KEY
teacher_id       UUID REFERENCES users(id)
class_id         UUID REFERENCES classes(id)
indicator_id     UUID REFERENCES indicators(id)  -- Domain 3 indicators only
academic_year_id UUID REFERENCES academic_years(id)
term             TEXT  -- 'term_1' | 'term_2' | 'term_3' | 'annual'
rating           INTEGER  -- 1 to 5
self_assessment  TEXT
submitted_at     TIMESTAMP
reviewed_by      UUID REFERENCES users(id)  -- HOD
reviewed_at      TIMESTAMP
status           TEXT  -- 'draft' | 'submitted' | 'reviewed'
```

#### `classroom_observations`
```sql
id               UUID PRIMARY KEY
observer_id      UUID REFERENCES users(id)  -- HOD or School Admin
teacher_id       UUID REFERENCES users(id)
class_id         UUID REFERENCES classes(id)
academic_year_id UUID REFERENCES academic_years(id)
observed_at      TIMESTAMP
domain3_ratings  JSONB  -- { "3.1.1": 2, "3.2.1": 3, ... }
qualitative_notes TEXT
evidence_files   TEXT[]  -- array of storage paths
created_at       TIMESTAMP
```

#### `student_performance`
```sql
id               UUID PRIMARY KEY
school_id        UUID REFERENCES schools(id)
academic_year_id UUID REFERENCES academic_years(id)
grade_id         UUID REFERENCES grades(id)
subject          TEXT NOT NULL  -- one of the 6 core subjects
total_students   INTEGER NOT NULL
students_at_75   INTEGER NOT NULL  -- students scoring >= 75%
proficiency_rate NUMERIC(5,2) GENERATED ALWAYS AS (
  CASE WHEN total_students > 0
    THEN (students_at_75::NUMERIC / total_students) * 100
    ELSE 0
  END
) STORED
national_average NUMERIC(5,2)  -- optional, entered if available
entered_by       UUID REFERENCES users(id)
created_at       TIMESTAMP
```

#### `attendance_records`
```sql
id               UUID PRIMARY KEY
school_id        UUID REFERENCES schools(id)
academic_year_id UUID REFERENCES academic_years(id)
grade_id         UUID REFERENCES grades(id)
total_possible_days INTEGER
total_attended_days INTEGER
attendance_rate  NUMERIC(5,2) GENERATED ALWAYS AS (
  CASE WHEN total_possible_days > 0
    THEN (total_attended_days::NUMERIC / total_possible_days) * 100
    ELSE 0
  END
) STORED
created_at       TIMESTAMP
```

#### `evidence_files`
```sql
id               UUID PRIMARY KEY
school_id        UUID REFERENCES schools(id)
academic_year_id UUID REFERENCES academic_years(id)
indicator_id     UUID REFERENCES indicators(id)
teacher_id       UUID REFERENCES users(id)  -- nullable, for teacher-specific evidence
class_id         UUID REFERENCES classes(id)  -- nullable
storage_path     TEXT NOT NULL  -- Supabase Storage path
file_name        TEXT NOT NULL
file_type        TEXT
uploaded_by      UUID REFERENCES users(id)
uploaded_at      TIMESTAMP
description      TEXT
```

#### `action_items`
```sql
id               UUID PRIMARY KEY
school_id        UUID REFERENCES schools(id)
academic_year_id UUID REFERENCES academic_years(id)
indicator_id     UUID REFERENCES indicators(id)  -- nullable
domain_id        UUID REFERENCES domains(id)  -- nullable
title            TEXT NOT NULL
description      TEXT
priority         TEXT  -- 'high' | 'medium' | 'low'
assigned_to      UUID REFERENCES users(id)
due_date         DATE
status           TEXT  -- 'planned' | 'in_progress' | 'completed' | 'overdue'
created_by       UUID REFERENCES users(id)
created_at       TIMESTAMP
updated_at       TIMESTAMP
```

#### `standard_judgements` (auto-calculated, stored for reporting)
```sql
id               UUID PRIMARY KEY
school_id        UUID REFERENCES schools(id)
academic_year_id UUID REFERENCES academic_years(id)
standard_id      UUID REFERENCES standards(id)
judgement        INTEGER  -- 1 to 5
calculated_at    TIMESTAMP
calculation_notes TEXT
```

#### `domain_judgements` (auto-calculated)
```sql
id               UUID PRIMARY KEY
school_id        UUID REFERENCES schools(id)
academic_year_id UUID REFERENCES academic_years(id)
domain_id        UUID REFERENCES domains(id)
judgement        INTEGER  -- 1 to 5
calculated_at    TIMESTAMP
```

#### `overall_judgements` (auto-calculated)
```sql
id               UUID PRIMARY KEY
school_id        UUID REFERENCES schools(id)
academic_year_id UUID REFERENCES academic_years(id)
judgement        INTEGER  -- 1 to 5
calculated_at    TIMESTAMP
notes            TEXT
```

---

## 7. User Roles and Permissions

### 7.1 Role Definitions

| Role | Description | Scope |
|---|---|---|
| **Super Admin** | Platform administrator managing all schools | All schools |
| **School Admin** | Principal or school quality manager | Single school |
| **Head of Department (HOD)** | Senior teacher managing a subject area or department | Department within school |
| **Teacher** | Classroom teacher entering self-assessment data | Own classes only |
| **External Viewer** | Read-only access for OAAAQA reviewers or supervisory bodies | Assigned school(s) |

### 7.2 Permission Matrix

| Action | Super Admin | School Admin | HOD | Teacher | External Viewer |
|---|---|---|---|---|---|
| Create / manage schools | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage users within school | ✅ | ✅ | ❌ | ❌ | ❌ |
| Enter school-level indicator ratings (Domains 1, 2, 4, 5) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Enter teacher self-assessment (Domain 3) | ✅ | ✅ | ✅ | ✅ (own classes) | ❌ |
| Conduct and record classroom observations | ✅ | ✅ | ✅ | ❌ | ❌ |
| Enter student proficiency data | ✅ | ✅ | ✅ (own subject) | ❌ | ❌ |
| Enter attendance data | ✅ | ✅ | ❌ | ❌ | ❌ |
| Upload evidence files | ✅ | ✅ | ✅ | ✅ (own indicators) | ❌ |
| Create / manage action items | ✅ | ✅ | ✅ | ❌ | ❌ |
| View calculations and judgements | ✅ | ✅ | ✅ | ✅ (own data) | ✅ |
| Generate Self-Evaluation Document | ✅ | ✅ | ❌ | ❌ | ❌ |
| Export / download reports | ✅ | ✅ | ✅ | ❌ | ✅ |
| Access AI Feedback features | ✅ | ✅ | ✅ | ✅ | ❌ |

---

## 8. Feature Specifications

### 8.1 Authentication & Onboarding

- Supabase Auth with email/password login
- Role-based redirect on login (Super Admin → `/super-admin`, School Admin → `/dashboard`, Teacher → `/my-classes`)
- Password reset via email
- School Admin can invite teachers and HODs by email
- First-login onboarding flow for teachers: assign subjects, classes, academic year

### 8.2 Super Admin Panel

- School management: create, edit, deactivate schools
- User management across all schools
- Platform-wide analytics: number of schools, average judgements, schools below Satisfactory
- Academic year management
- Seed / manage domain, standard, and indicator reference data

### 8.3 School Dashboard

The school dashboard is the primary view for School Admins. It must display:

- Current academic year overview
- Overall school performance judgement (auto-calculated, with colour coding: 1=green, 2=teal, 3=amber, 4=orange, 5=red)
- Domain judgements summary (5 domain cards showing current judgement level)
- Proficiency rate summary: per subject, per grade, current year vs. previous years (3-year trend)
- Attendance rate current vs. previous year
- Action items: count by status (planned / in progress / completed / overdue)
- Data completeness progress: % of indicators rated, % of evidence uploaded, % of teacher self-assessments submitted
- Navigation to all modules

### 8.4 Indicator Rating Module

#### School-Level Indicators (Domains 1, 2, 4, 5)

- Accessible to School Admin and Super Admin
- Each indicator displayed with:
  - Code (e.g., 1.1.1) and full name in both English and Arabic
  - 5-point rating selector (Outstanding → Needs Urgent Intervention)
  - Text field for notes/justification
  - Evidence file upload (one or more files)
  - Last updated timestamp and user
- Indicators grouped by Domain → Standard → Indicator
- Filter: show only rated / unrated / needing evidence
- Bulk save within a standard

#### Teacher-Level Indicators (Domain 3)

Domain 3 indicators (all 20 indicators across standards 3.1–3.5) must be rated at the **teacher-class level**, not school-wide.

- Each teacher sees only their own assigned classes
- For each class, the teacher rates all 20 Domain 3 indicators
- Per term (Term 1, Term 2, Term 3) and annually
- Rating is submitted as a draft → submitted to HOD for review
- HOD can view all teacher submissions in their department, add review notes, and mark as reviewed
- School Admin sees an aggregated view: average Domain 3 rating per teacher, per class, per indicator
- For school-level Domain 3 standard judgements, the system calculates the **average of all teacher ratings** for that indicator across all classes, weighted by class size

### 8.5 Classroom Observations Module

- HOD or School Admin records an observation against a specific teacher + class + date
- Observer rates each relevant Domain 3 indicator (1–5)
- Free-text qualitative notes field
- Evidence file attachment (e.g., observation form scan)
- Observation records are linked to the relevant teacher and class
- Observations feed into the Domain 3 aggregation alongside teacher self-ratings
- School Admin can view all observation records and filter by teacher, date range, indicator

### 8.6 Student Performance Data Module

#### Proficiency Rate Entry

- School Admin enters data per: academic year → grade → subject
- Required fields: total students enrolled, number scoring ≥ 75%
- System auto-calculates: proficiency rate \( PR_{s,g} \)
- School-wide average proficiency rate \( PR_{school} \) is auto-calculated
- National exam data entry: school average score + national average score → auto-calculates \( \Delta_{national} \) and applies Table 7 judgement
- 3-year trend chart: proficiency rate by subject across last 3 academic years
- Cohort progress is auto-described using Table 9 thresholds
- Data can be entered for all 6 core subjects (Islamic Ed, Arabic, English, Math, Science, Social Studies)

#### Grade Repetition & Dropout Rates

- Optional entry of grade repetition rate and dropout rate per grade
- Compared to national averages if entered
- Used as supporting evidence for Standard 1.2

### 8.7 Attendance Module

- Entry: academic year → grade → total possible student days → total attended student days
- System auto-calculates attendance rate per grade
- School-wide attendance rate is calculated as the average across all grades
- Judgement auto-applied from Table 11
- 3-year trend chart

### 8.8 Domain Judgement Calculation Engine

This is the core computational engine of the platform. It must:

1. **Collect indicator ratings** for all indicators within a standard
2. **Calculate a standard judgement** from its indicators (using weighted qualitative + quantitative inputs; for Standard 1.1, the quantitative proficiency rate judgement is the primary input)
3. **Calculate domain judgements** using the exact conditional logic from Section 4.7
4. **Calculate overall school judgement** using the logic from Section 4.8
5. **Recalculate automatically** whenever any underlying rating is updated
6. **Display a calculation trace**: for each judgement, show exactly which rules were applied and why

> **Standard 1.1 Special Logic:** Standard 1.1 (Academic Attainment) combines two inputs — the quantitative proficiency rate (from student performance data) and qualitative observation ratings for indicators 1.1.2 and 1.1.3. The proficiency rate feeds directly into indicator 1.1.1 using the Table 8 scale.

> **Standard 1.2 Special Logic:** Standard 1.2 (Academic Progress) uses the 3-year cohort trend data (Table 9) as the primary quantitative input for indicator 1.2.1.

### 8.9 Evidence Management Module

- Evidence files are stored in Supabase Storage
- Each file is linked to: school, academic year, indicator, and optionally a teacher and class
- File types supported: PDF, DOCX, XLSX, JPEG, PNG, MP4
- Maximum file size: 50MB per file
- Files are displayed inline on the indicator rating form
- Evidence summary page: list all indicators, show how many evidence files each has, and flag indicators with no evidence
- Evidence files for Domain 3 can be uploaded at the teacher level (per class observation) or school level
- Download all evidence as a ZIP, organised by Domain → Standard → Indicator

### 8.10 Improvement Planning Module (ADRI Model)

The Self-Evaluation Cycle follows the ADRI model (Approach → Deployment → Results → Improvement). The platform must support:

- **Action Items** linked to specific indicators or domains
- Required fields per action item:
  - Title
  - Description
  - Linked indicator (dropdown of all indicators)
  - Priority (High / Medium / Low)
  - Assigned to (user within school)
  - Due date
  - Status (Planned / In Progress / Completed / Overdue)
  - Evidence of completion (file upload)
- Auto-status: items past due date with no completion evidence automatically flagged as Overdue
- Gantt-style timeline view of all improvement actions per academic year
- Action items are a required component of the SED

### 8.11 Self-Evaluation Document (SED) Generator

The SED is the official document submitted to OAAAQA before an external review. The platform generates it automatically based on entered data.

**Section 1: Basic School Information**
- School name, type, governorate, educational cycle
- Number of students (by gender if applicable)
- Number of teachers (by subject)
- Number of classes per grade
- Summary of most recent national exam results
- Summary of previous external review outcomes (if any)

**Section 2: Self-Evaluation Results — all 5 domains**
For each domain:
- Overall domain judgement with justification paragraph
- Per standard: judgement, strengths narrative, improvement areas narrative, evidence summary
- All narratives use the OAAAQA evaluative language (Table 10 terms)

**Section 3: Improvement Plan Summary**
- Top 3–5 improvement priorities
- Key actions per priority (from action items)
- Timelines and responsibilities

**Output formats:** PDF and DOCX  
**Language:** English and Arabic (parallel columns or separate documents)

**Validation before generation:**
- All 56 indicators must have a rating entered
- All 6 core subjects must have proficiency data for the current academic year
- All Domain 3 teachers must have at least one submitted self-assessment
- Each indicator must have at least one evidence file

### 8.12 AI Feedback Module

The platform includes an AI-powered feedback assistant (accessed via Supabase Edge Function, requiring authenticated JWT). Features:

- **Indicator Feedback:** Given a rating and notes, the AI suggests improvements to the narrative justification using OAAAQA evaluative language
- **Action Item Suggestions:** Given a low-rated indicator, the AI suggests evidence-based improvement actions
- **SED Narrative Drafting:** The AI drafts standard-level narrative paragraphs using the entered ratings, notes, and evidence descriptions
- **Gap Analysis:** The AI reviews all entered data and flags: missing evidence, inconsistent ratings (e.g., low proficiency data but high Standard 1.1 rating), or incomplete indicators

**Authentication requirement:** All AI calls must include the user's Supabase JWT in the `Authorization: Bearer <token>` header.

---

## 9. UI/UX Requirements

### 9.1 Navigation Structure

```
/login
/super-admin
  /schools
  /users
  /analytics

/dashboard                      ← School Admin home
  /indicators
    /domain/:domainId
      /standard/:standardId
        /indicator/:indicatorId
  /teaching-assessment           ← Domain 3 school-level view
    /teachers
      /:teacherId
        /classes
          /:classId
    /observations
  /performance-data
    /proficiency
    /attendance
    /national-exams
  /judgements                   ← Auto-calculated summary
  /evidence
  /improvement-plan
  /self-evaluation-document
  /ai-feedback

/my-classes                     ← Teacher home
  /:classId
    /self-assessment
    /evidence
```

### 9.2 Bilingual Support

- All UI labels, indicator names, and standard names must be available in both Arabic and English
- User selects preferred language on profile; the SED can be exported in either language
- Arabic text renders right-to-left (RTL layout support required)

### 9.3 Progress Indicators

- Every domain, standard, and indicator page displays a visual progress ring or bar showing data completeness
- Dashboard shows an overall completion percentage towards a ready-to-submit SED

---

## 10. Calculation Validation Rules

The following validation rules must be enforced before any standard or domain judgement is calculated:

1. All indicators within a standard must have a rating; partial standard judgements are flagged as "Incomplete"
2. Proficiency rate data must cover the current academic year and at minimum one prior year for progress tracking
3. Domain 3 teacher ratings must have a minimum of 1 submitted self-assessment per teacher per term before aggregating
4. If contradictory data exists (e.g., proficiency rate maps to "Needs Urgent Intervention" but School Admin rates indicator 1.1.1 as "Good"), the system flags a **data inconsistency warning** and requires a justification note

---

## 11. Reporting & Analytics

### 11.1 School Reports

- **Indicator Summary Report:** All 56 indicators, ratings, last updated, evidence count — with links to evidence files
- **Domain Scorecard:** All 5 domains with standards, judgements, trend over 3 years
- **Proficiency Rate Report:** Per subject, per grade, per year with cohort progress descriptions (Table 9 language)
- **Teacher Performance Summary:** Average Domain 3 ratings per teacher across all classes (visible to School Admin and HOD only)
- **Action Item Tracker:** All actions by status, due date, assigned user, linked indicator

### 11.2 Super Admin Reports

- All-school overview: number of schools per judgement level per domain
- Schools below Satisfactory requiring attention
- SED submission completeness across all schools

---

## 12. Implementation Roadmap

### Phase 1 — Foundation (Weeks 1–4)

- Stabilise current codebase (fix all known bugs)
- Implement complete database schema from Section 6
- Seed all reference data: 5 domains, 21 standards, 56 indicators (with Arabic/English names)
- Implement role-based auth and permission system
- Build school profile and academic year management

### Phase 2 — Data Collection (Weeks 5–8)

- Build Indicator Rating Module for Domains 1, 2, 4, 5 (school-level)
- Build Teacher Self-Assessment Module for Domain 3 (teacher + class level)
- Build Classroom Observations Module
- Build Student Performance Data Module (proficiency rates, national exams)
- Build Attendance Module

### Phase 3 — Calculations (Weeks 9–10)

- Implement all proficiency rate calculations and Table 8 judgements
- Implement cohort progress tracking and Table 9 descriptions
- Implement national exam comparison and Table 7 judgements
- Implement attendance judgements (Table 11)
- Implement domain judgement calculation engine (Sections 4.7, 4.8)
- Implement overall school judgement engine
- Build calculation trace / explanation display

### Phase 4 — Output (Weeks 11–13)

- Build Evidence Management Module with Supabase Storage
- Build Improvement Planning Module with ADRI structure
- Build SED Generator (PDF/DOCX)
- Build all reporting views
- Fix AI Feedback Module authentication (JWT)

### Phase 5 — Quality Assurance (Weeks 14–15)

- Full end-to-end testing of all calculation logic against OAAAQA framework rules
- Bilingual (Arabic/English) review of all labels and generated text
- Performance testing with realistic data volumes
- Security audit: RLS policies on all Supabase tables
- UAT with a pilot school

---

## 13. Row-Level Security (Supabase RLS) Requirements

Every table must have RLS enabled. Key policies:

- **Schools:** Super Admin can see all; School Admin, HOD, Teacher see only their own `school_id`
- **Teacher indicator ratings:** Teachers see only their own `teacher_id`; HODs see all teachers in their department; School Admin sees all
- **Student performance, attendance:** School Admin and above only
- **Evidence files:** Uploader can always see their own; School Admin sees all for the school; External Viewer sees all for assigned school
- **Action items:** Assigned user sees their own; School Admin sees all
- **Judgements:** Read-only for all school users; write only by calculation engine (service role)

---

## 14. Glossary (OAAAQA Definitions)

| Term | Definition |
|---|---|
| **Academic Achievement** | Students' levels of performance against the expected levels or curriculum standards |
| **Proficiency** | OAAAQA adopts a score of 75% in the final exam as the criterion for students reaching mastery of subject competencies |
| **Cohort Progress** | Changes in average proficiency rates of student cohorts as they transition from one grade to another over a three-year period |
| **Self-Evaluation** | A participatory process including procedural steps conducted by the school on an ongoing basis to systematically evaluate its own performance |
| **External Review** | A process carried out by OAAAQA to make accurate and objective judgements about school performance |
| **Differentiation** | The difference in student abilities and levels of learning, addressed through appropriate teaching techniques for each level |
| **ADRI Model** | Approach → Deployment → Results → Improvement — the performance analysis model used for school improvement planning |
| **Vulnerable Students** | Students experiencing barriers to learning, including those with special educational needs, disabilities, a mother tongue other than Arabic, or social difficulties |
| **Core Subjects** | Islamic Education, Arabic Language, English Language, Mathematics, Science, Social Studies |

