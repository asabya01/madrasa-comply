# Madrasa-Comply — Claude Context

## Spec Documents (always read before coding)
- `docs/PSD.md` — Primary product spec. Source of truth for features, schema, permissions.
- `docs/BuildReference.md` — Technical governance, phase checklist, RLS patterns, known bugs.

## Hard Rules
- Never drop or recreate existing tables. Migrations only, never destructive.
- Always check PSD Section 6 before creating any new table.
- Judgement logic goes in `src/lib/judgement.ts` only — never hardcode in components.
- All Edge Function calls use explicit `Authorization: Bearer ${session.access_token}` header.
- Work phase by phase — confirm completion before moving to next phase.
- RLS required on every school-scoped table using `get_my_school_ids()` pattern.
- Service role keys never go to the frontend — Edge Functions only.
