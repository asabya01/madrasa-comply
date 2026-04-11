import { useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import {
  calculateDomain1Judgement,
  calculateDomain2Judgement,
  calculateDomain3Judgement,
  calculateDomain4Judgement,
  calculateDomain5Judgement,
  calculateOverallJudgement,
  type JudgementLevel,
  type DomainResult,
  type OverallResult,
} from '../lib/judgement';
import { useSchoolStore } from '../stores/schoolStore';

// ─── Public return shape ──────────────────────────────────────

export interface JudgementsResult {
  /** Overall school judgement level (1=Outstanding … 5=NUI) */
  overall: JudgementLevel;
  /** Full overall result including trace steps */
  overallResult: OverallResult;
  /** Domain-level judgements, keyed '1'–'5' */
  domains: Record<string, JudgementLevel>;
  /** Full domain results including trace steps and limiting standard */
  domainResults: DomainResult[];
  /** Standard-level judgements, keyed by standard code e.g. '1.1' */
  standards: Record<string, JudgementLevel>;
  /** Number of indicators that have a saved rating */
  ratedCount: number;
  /** Total number of indicators in the framework */
  totalCount: number;
}

// ─── Hook ────────────────────────────────────────────────────

export function useJudgements() {
  const { school, academicYear } = useSchoolStore();
  const queryClient = useQueryClient();

  // ── 1. Ratings (shared cache key — DomainProgressBar reads the same key) ──
  const ratingsQuery = useQuery({
    queryKey: ['all-ratings-judgements', school?.id, academicYear],
    queryFn: async () => {
      if (!school) return [];
      const { data, error } = await supabase
        .from('indicator_ratings')
        .select('indicator_id, rating')
        .eq('school_id', school.id)
        .eq('academic_year', academicYear);
      if (error) throw error;
      return data as { indicator_id: string; rating: number }[];
    },
    enabled: !!school,
  });

  // ── 2. Framework — indicators (id is the OAAAQA code, e.g. '1.1.1') ─────────
  // The indicators table has no separate 'code' column — id IS the code.
  // staleTime=1h: reference data never changes during a session.
  const indicatorsQuery = useQuery({
    queryKey: ['indicators-full'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('indicators')
        .select('id, standard_id, domain_id');
      if (error) throw error;
      return data as { id: string; standard_id: string; domain_id: string }[];
    },
    staleTime: 1000 * 60 * 60,
  });

  // ── 3. Compute judgements ─────────────────────────────────────────────────
  const computed = useMemo<JudgementsResult | null>(() => {
    if (!ratingsQuery.data || !indicatorsQuery.data) return null;

    // rating keyed by indicator UUID (matches indicator_ratings.indicator_id)
    const ratingById: Record<string, number> = {};
    for (const r of ratingsQuery.data) ratingById[r.indicator_id] = r.rating;

    // rating keyed by indicator CODE ('1.1.1' etc.) — required by calculate* functions
    const ratingByCode: Record<string, number> = {};
    for (const ind of indicatorsQuery.data) {
      const v = ratingById[ind.id];
      if (v != null) ratingByCode[ind.id] = v;
    }

    // Standard judgements: worst (max) indicator per standard
    const byStandard: Record<string, string[]> = {};
    for (const ind of indicatorsQuery.data) {
      (byStandard[ind.standard_id] ??= []).push(ind.id);
    }
    const standards: Record<string, JudgementLevel> = {};
    for (const [sid, ids] of Object.entries(byStandard)) {
      const vals = ids.map((id) => ratingById[id]).filter((v): v is number => v != null);
      standards[sid] = (vals.length ? Math.max(...vals) : 3) as JudgementLevel;
    }

    // Domain judgement engine (PSD §4.7 exact conditional logic)
    const d1 = calculateDomain1Judgement(ratingByCode);
    const d2 = calculateDomain2Judgement(ratingByCode);
    const d3 = calculateDomain3Judgement(ratingByCode);
    const d4 = calculateDomain4Judgement(ratingByCode);
    const d5 = calculateDomain5Judgement(ratingByCode);
    const domainResults: DomainResult[] = [d1, d2, d3, d4, d5];

    // Overall judgement (PSD §4.8)
    const overallResult = calculateOverallJudgement(domainResults);

    return {
      overall: overallResult.judgement,
      overallResult,
      domains: {
        '1': d1.judgement,
        '2': d2.judgement,
        '3': d3.judgement,
        '4': d4.judgement,
        '5': d5.judgement,
      },
      domainResults,
      standards,
      ratedCount: ratingsQuery.data.length,
      totalCount: indicatorsQuery.data.length,
    };
  }, [ratingsQuery.data, indicatorsQuery.data]);

  // ── 4. Upsert computed results into DB for audit trail ────────────────────
  const { mutate: persistJudgements } = useMutation({
    mutationFn: async (payload: JudgementsResult) => {
      if (!school) return;

      // domain_judgements: one row per domain, upsert by (school_id, academic_year, domain_id)
      const domainRows = (['1', '2', '3', '4', '5'] as const).map((domainId, i) => ({
        school_id:        school.id,
        academic_year:    academicYear,
        domain_id:        domainId,
        judgement:        payload.domainResults[i].judgement,
        trace_json:       payload.domainResults[i].trace,
        limiting_standard: payload.domainResults[i].limitingStandard ?? null,
        calculated_at:    new Date().toISOString(),
      }));

      const { error: domainErr } = await supabase
        .from('domain_judgements')
        .upsert(domainRows, { onConflict: 'school_id,academic_year,domain_id' });
      if (domainErr) throw domainErr;

      // overall_judgements: one row per school/year, upsert by (school_id, academic_year)
      const { error: overallErr } = await supabase
        .from('overall_judgements')
        .upsert(
          {
            school_id:     school.id,
            academic_year: academicYear,
            judgement:     payload.overallResult.judgement,
            trace_json:    payload.overallResult.trace,
            calculated_at: new Date().toISOString(),
          },
          { onConflict: 'school_id,academic_year' }
        );
      if (overallErr) throw overallErr;

      // standard_judgements: one row per standard, upsert by (school_id, academic_year, standard_id)
      const standardRows = Object.entries(payload.standards).map(([code, judgement]) => ({
        school_id:     school.id,
        academic_year: academicYear,
        standard_id:   code,
        judgement,
        calculated_at: new Date().toISOString(),
      }));
      if (standardRows.length) {
        const { error: stdErr } = await supabase
          .from('standard_judgements')
          .upsert(standardRows, { onConflict: 'school_id,academic_year,standard_id' });
        if (stdErr) throw stdErr;
      }
    },
    onSuccess: () => {
      // Invalidate any query that reads stored judgements from the DB
      queryClient.invalidateQueries({ queryKey: ['stored-judgements'] });
    },
  });

  // Trigger persist whenever the computed result changes (only when ready)
  useEffect(() => {
    if (computed && school) {
      persistJudgements(computed);
    }
  // persistJudgements is stable across renders (destructured from useMutation)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computed, school]);

  return {
    judgements: computed,
    isLoading: ratingsQuery.isLoading || indicatorsQuery.isLoading,
  };
}
