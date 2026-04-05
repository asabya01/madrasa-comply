import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import {
  calcStandardRating, calcDomain1, calcDomain2, calcDomain3, calcDomain4, calcDomain5,
  calcOverallJudgement, type JudgementLevel,
} from '../lib/judgement';
import { useSchoolStore } from '../stores/schoolStore';

export function useJudgements() {
  const { school, academicYear } = useSchoolStore();

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

  const indicatorsQuery = useQuery({
    queryKey: ['indicators-by-standard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('indicators')
        .select('id, standard_id, domain_id');
      if (error) throw error;
      return data as { id: string; standard_id: string; domain_id: string }[];
    },
  });

  const judgements = useMemo(() => {
    if (!ratingsQuery.data || !indicatorsQuery.data) return null;

    const ratingMap: Record<string, number> = {};
    ratingsQuery.data.forEach((r) => { ratingMap[r.indicator_id] = r.rating; });

    // Group indicators by standard
    const byStandard: Record<string, string[]> = {};
    indicatorsQuery.data.forEach((ind) => {
      if (!byStandard[ind.standard_id]) byStandard[ind.standard_id] = [];
      byStandard[ind.standard_id].push(ind.id);
    });

    const standardRating = (sid: string): JudgementLevel => {
      const ids = byStandard[sid] || [];
      const ratings = ids.map((id) => ratingMap[id]).filter(Boolean);
      return calcStandardRating(ratings);
    };

    const d1 = calcDomain1(standardRating('1.1'), standardRating('1.2'), standardRating('1.3'));
    const d2 = calcDomain2(standardRating('2.1'), standardRating('2.2'), standardRating('2.3'), standardRating('2.4'));
    const d3 = calcDomain3(standardRating('3.1'), standardRating('3.2'), standardRating('3.3'), standardRating('3.4'), standardRating('3.5'));
    const d4 = calcDomain4(standardRating('4.1'), standardRating('4.2'), standardRating('4.3'), standardRating('4.4'));
    const d5 = calcDomain5(standardRating('5.1'), standardRating('5.2'), standardRating('5.3'), standardRating('5.4'), standardRating('5.5'));
    const overall = calcOverallJudgement(d1, d2, d3, d4, d5);

    const standardJudgements: Record<string, JudgementLevel> = {};
    Object.keys(byStandard).forEach((sid) => {
      standardJudgements[sid] = standardRating(sid);
    });

    return {
      domains: { '1': d1, '2': d2, '3': d3, '4': d4, '5': d5 },
      standards: standardJudgements,
      overall,
      ratedCount: ratingsQuery.data.length,
      totalCount: indicatorsQuery.data.length,
    };
  }, [ratingsQuery.data, indicatorsQuery.data]);

  return {
    judgements,
    isLoading: ratingsQuery.isLoading || indicatorsQuery.isLoading,
  };
}
