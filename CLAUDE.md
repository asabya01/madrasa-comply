# CLAUDE.md — MADRASA COMPLY
Last updated: April 2026

# Project Overview

Madrasa Comply is a multi-tenant SaaS web app for Omani schools
to self-evaluate against the OAAAQA 2024 School Evaluation
Framework. Schools complete a Self-Evaluation Document (SED),
record evidence, manage improvement plans, and prepare for
external review visits.

## Live URLs
- Production: https://madrasa-comply.vercel.app
- Supabase project: qfrvyeuzhobacdhqyjcw.supabase.co
- GitHub: https://github.com/asabya01/madrasa-comply

---

# Tech Stack

- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Supabase (Auth + PostgreSQL + Storage + Edge Functions)
- Vercel (auto-deploy from GitHub main branch)
- TanStack React Query v5
- react-i18next (bilingual EN/AR)
- Recharts (charts)
- Zod (validation)

---

# Key Documents

1. OAAAQA_School_Evaluation_Platform_PSD.md — primary product spec
2. OAAAQA_Build_Reference_Guide.md — technical reference
3. dlyl-lmdrs-bllG-lnjlyzy.pdf — OAAAQA 2024 framework (English)
4. lwthyq-2-nZm-tqwym-d-lmdrs-dlyl-lmdrs.pdf — OAAAQA 2024 (Arabic)

Always refer to the PSD as the primary specification.
Always refer to the Build Reference Guide for governance.
When in doubt about framework logic, refer to the PDFs.

---

# Database

## Migration Numbering
Current highest migration: 054
Next migration must be: 055_description.sql
Never skip numbers. Never reuse numbers.
Check with: ls supabase/migrations/ | sort | tail -5

## Core Tables
- profiles — one row per auth user
  Columns: id, full_name, email, role, is_super_admin,
  is_sed_team, is_active (DEFAULT true), created_at
  NOTE: profiles.email is NULL — email is stored in auth.users.
  Always use the profiles_with_email VIEW (migration 055) when
  email is needed. Never query profiles.email directly.
- profiles_with_email — VIEW joining profiles + auth.users
  Columns: id, full_name, email, role, is_super_admin,
  is_sed_team, is_active, created_at
  Use this instead of profiles whenever email is required.
  Granted SELECT to authenticated role.
- schools — one row per school
- school_members — links profiles to schools with a role
- domains — 5 OAAAQA domains (has arabic_name column)
- standards — 21 standards (has arabic_name column)
- indicators — 53 indicators (has arabic_name column)
- indicator_ratings — school self-evaluation ratings
- evidence_files — uploaded evidence documents
- improvement_actions — improvement plan action items
- surveys / survey_questions / survey_responses
- observations — classroom observation records
- appraisals — staff appraisal records
- cpd_entries — CPD log entries
- notifications — in-app notifications

## Migration Rules
- NEVER use DROP TABLE, TRUNCATE, or DELETE without a WHERE clause
- NEVER recreate existing tables
- ALWAYS use IF NOT EXISTS / IF EXISTS guards
- ALWAYS use ALTER TABLE ... ADD COLUMN IF NOT EXISTS
- Write pure SQL only — no Supabase JS in migrations
- Run: supabase db push --linked --yes after each migration

## RLS Rules — CRITICAL
- NEVER write a policy on the profiles table that queries the
  profiles table inside its USING or WITH CHECK clause.
  This causes infinite recursion and breaks the entire auth flow.
- The correct pattern for super admin access is to use the
  existing is_admin() SECURITY DEFINER function from migration 010:
    CREATE POLICY "..." ON profiles FOR UPDATE
    USING (auth.uid() = id OR is_admin());
- is_admin() reads profiles.is_super_admin while bypassing RLS
  because it runs as SECURITY DEFINER (function owner).
- Before adding any new policy, check existing policies:
    SELECT policyname, cmd, qual::text
    FROM pg_policies WHERE tablename = 'profiles';
- Never add a policy that duplicates an existing one.

---

# Authentication & Auth Flow Rules

## Profile reads in auth handlers
- ALWAYS use .maybeSingle() (not .single()) when reading
  profiles inside onAuthStateChange or signup handlers.
- During SIGNED_IN the profile row may not exist yet due to
  a race condition between the auth trigger and profile upsert.
- .single() returns 406 on missing rows and breaks signup.
- .maybeSingle() returns null safely — treat null as
  "proceed normally, user is not deactivated".

## is_active enforcement
- profiles.is_active = false prevents login
- Checked in App.tsx onAuthStateChange on SIGNED_IN event
- If false: supabase.auth.signOut() + navigate('/login?reason=inactive')
- LoginPage shows amber banner when ?reason=inactive is in URL

---

# Bilingual Support (EN / AR)

## Architecture
- react-i18next installed and configured
- Translation files: src/i18n/en.ts and src/i18n/ar.ts
- Language toggle persisted in localStorage
- RTL layout applied when language = 'ar'
- Font: Noto Sans Arabic loaded for Arabic mode

## Translation Status — COMPLETE
All pages and components are fully wired. Passes completed:
  Pass 1: Sidebar, Dashboard
  Pass 2: 14 pages (Indicators, Judgements, Evidence,
    Improvement, Surveys, Performance, Observations,
    Appraisals, Settings, Users, Reports, Chain, Pricing,
    Public Survey)
  Pass 3: Sub-components, modals, table headers, chart
    legends, toasts, empty states, notifications
  Pass 4: IndicatorsPage deep, Observations modal,
    CPD Log, Governance, Review Visits, Audit Prep
  Pass 5: Benchmarking, Import Data, KPI cards,
    Domain Radar, Compliance Trend, Trend tab

## Database Arabic Content — SEEDED
All 5 domains, 21 standards, and 53 indicators have
arabic_name populated from the official OAAAQA 2024 document.
Migration: 051_arabic_framework_names.sql (or similar)

## Standard Pattern for Bilingual Components
Every component that renders DB-driven or UI text must have:

  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const displayName = (row: { name: string; arabic_name?: string | null }) =>
    isAr && row.arabic_name ? row.arabic_name : row.name

## Judgement Labels
  const judgementLabel = (level: string) => {
    const map: Record<string, string> = {
      outstanding: t('judgements.outstanding'),  // متميز
      good: t('judgements.good'),                // جيد
      satisfactory: t('judgements.satisfactory'),// مقبول
      inadequate: t('judgements.inadequate'),    // ضعيف
      urgent: t('judgements.urgent'),            // يحتاج إلى تدخل سريع
    }
    return map[level?.toLowerCase()] ?? level
  }

## Role Labels
  const roleLabels: Record<string, { en: string; ar: string }> = {
    principal:           { en: 'Principal',           ar: 'مدير المدرسة' },
    vice_principal:      { en: 'Vice Principal',      ar: 'وكيل المدرسة' },
    hod:                 { en: 'Head of Department',  ar: 'رئيس القسم' },
    teacher:             { en: 'Teacher',             ar: 'معلم' },
    quality_coordinator: { en: 'Quality Coordinator', ar: 'منسق الجودة' },
    chain_coordinator:   { en: 'Chain Coordinator',   ar: 'منسق الشبكة' },
    auditor:             { en: 'Auditor',             ar: 'المراجع' },
    super_admin:         { en: 'Super Admin',         ar: 'المشرف العام' },
  }

## CRITICAL i18n Rule — Avoid t() Variable Shadow
Before adding useTranslation to ANY file:
  1. Grep the file for: .map(t  .filter(t  .forEach(t  .reduce(t
  2. If found, rename all single-letter t callbacks to descriptive
     names (teacher, entry, row, item) BEFORE adding the hook.
  3. A shadowed t compiles without error but silently breaks all
     translations in that component at runtime.

## Adding New Translation Keys
Always add to BOTH en.ts AND ar.ts simultaneously.
Never add a key to one file without adding it to the other.
Arabic text must be correct Unicode RTL — never reversed/mirrored
characters (copy-paste encoding error to avoid).

---

# OAAAQA Framework Structure

## 5 Domains
1. الإنجاز الدراسي — Academic Achievement (High weight)
2. النمو الشخصي — Personal Development (Medium weight)
3. التدريس والتقويم — Teaching & Assessment (High weight)
4. مناخ المدرسة وبيئة التعلم — School Climate (Medium weight)
5. القيادة والإدارة والحوكمة — Leadership, Management & Governance (High weight)

## 21 Standards (codes 1.1–5.5)
## 53 Indicators (codes 1.1.1–5.5.3)
Full list in the OAAAQA PDF documents.

## Judgement Scale (5 levels)
1. متميز — Outstanding
2. جيد — Good
3. مقبول — Satisfactory / Acceptable
4. ضعيف — Inadequate
5. يحتاج إلى تدخل سريع — Requires Urgent Intervention

---

# User Roles & Permissions

## Role Hierarchy
super_admin > chain_coordinator > principal > vice_principal
  > quality_coordinator > hod > teacher > auditor

## Key Permission Checks
- usePermissions() hook provides: isSchoolAdmin, isSuperAdmin,
  isHOD, isChainCoordinator, isAuditor
- School admins = principal or vice_principal
- Super admins can access all schools and the Admin Panel
- Chain coordinators see their network of schools

---

# Component Patterns

## Data Fetching
- Always use TanStack React Query (useQuery / useMutation)
- Query keys must be descriptive arrays: ['indicators', schoolId]
- Invalidate related queries after mutations
- Use queryClient.invalidateQueries()

## Forms
- Use react-hook-form + Zod validation
- All form errors must display inline (not just toast)

## Toasts
- Use sonner (toast / toast.success / toast.error)
- All toast messages must use t() for bilingual support
- Never hardcode English strings in toast() calls

## Empty States
- Every list/table must have an empty state
- Empty state must use t('actions.noData')

## Loading States
- Show skeleton or spinner while data loads
- Loading text must use t('actions.loading')

---

# Notifications System

## Table: notifications
Columns: id, user_id, school_id, title, body, link,
  is_read, created_at
The query must only SELECT columns that exist in this table.
DO NOT select columns not in this list.

## Known Fix (applied)
Previous bug: query selected non-existent columns → 400 error.
Fixed by aligning SELECT to actual table schema.

---

# Edge Functions

Located in: supabase/functions/
Deployed via: supabase functions deploy <name>

Key functions:
- admin-actions — super admin operations. Supported actions:
  - update_user — updates full_name, email, role, is_super_admin
    (email updates both profiles and auth.users via Admin API)
  - toggle_user_active — sets profiles.is_active + school_members.status
  - reassign_user_school — deletes all school_members for user,
    inserts new membership with given school_id and role
  - reset_user_password — sets new password via Admin API
  - delete_user — removes school_members, profile, and auth user
  - create_school_full — creates school + principal user in one step
  - update_school — updates school metadata fields
  - update_subscription — sets subscription_tier + expiry date
- notify — creates notification rows
- generate-insights — AI benchmarking insights (OpenAI)

---

# Build & Deploy Rules

## Before Every Commit
Run: npx tsc --noEmit
Zero TypeScript errors required. Fix ALL errors before committing.
Never commit with TS errors and "fix later".

## Vercel Deploy
- Auto-deploys on push to main branch
- Check Vercel dashboard after each push to confirm green build
- If Vercel build fails but tsc passes locally, check for
  missing env vars or import path issues

## Environment Variables
Set in Vercel dashboard AND .env.local for local dev:
  VITE_SUPABASE_URL
  VITE_SUPABASE_ANON_KEY
  VITE_OPENAI_API_KEY (for benchmarking insights)

---

# Known Issues & Fixes Applied

## profiles.is_active missing (fixed in migration 053/054)
- Migration 053 added the column
- Migration 054 dropped a recursive RLS policy added in 053
- The existing profiles_update policy (migration 010) using
  is_admin() already covered super admin UPDATE access

## ar.ts duplicate keys (fixed April 2026)
- Caused by multiple i18n passes adding overlapping namespaces
- Fix: always grep ar.ts and en.ts for existing keys before
  adding new ones. Merge into existing namespace, never duplicate.

## CPDLogPage t() shadow (fixed April 2026)
- teacherSummary.map(t => ...) shadowed useTranslation t
- Fix: renamed loop variable to ts

## Notifications 400 (fixed)
- Query selected is_active which didn't exist on notifications
- Fix: aligned SELECT to actual table columns

## profiles.email always null (fixed migration 055)
- Supabase Auth stores email in auth.users, not profiles
- profiles.email column exists but is always NULL
- Fix: profiles_with_email VIEW joins profiles + auth.users
- All Super Admin user queries now use this view
- Never query profiles.email directly — use the view

## Signup FK failure (fixed April 2026)
- Recursive RLS policy on profiles broke profile upsert
- school_members FK failed because profile row was never created
- Fix: dropped recursive policy, use is_admin() instead
- Fix: .single() → .maybeSingle() in App.tsx auth handler

---

# Work Methodology

## Phase Rule
Work phase by phase — never jump ahead without confirmation.
Complete and verify each phase before starting the next.

## SQL Safety
- Write SQL as migration files only
- Never run destructive operations
- Always test: supabase db push --linked --yes

## Reporting
After completing a prompt, always report:
- Files modified (exact paths)
- Migrations created (exact filenames)
- Any strings/items that could not be completed
- TypeScript error count (must be zero)
- Git commit hash

---

# Quick Reference — Common Commands

  # Check migration files
  ls supabase/migrations/ | sort | tail -10

  # Push migrations
  supabase db push --linked --yes

  # Check profiles schema
  supabase db query "SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'profiles'
    ORDER BY ordinal_position;"

  # Check RLS policies on a table
  supabase db query "SELECT policyname, cmd, qual::text
    FROM pg_policies WHERE tablename = 'profiles';"

  # TypeScript check
  npx tsc --noEmit

  # Build check
  npm run build

  # Deploy edge function
  supabase functions deploy <function-name> --linked
