import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import type { IndicatorRating } from '../types';

export function useIndicatorRatings(standardId?: string) {
  const { school, academicYear } = useSchoolStore();

  return useQuery({
    queryKey: ['indicator-ratings', school?.id, academicYear, standardId],
    queryFn: async () => {
      if (!school) return [];
      let query = supabase
        .from('indicator_ratings')
        .select('*')
        .eq('school_id', school.id)
        .eq('academic_year', academicYear);
      if (standardId) {
        // Get indicators for this standard first
        const { data: indicators } = await supabase
          .from('indicators')
          .select('id')
          .eq('standard_id', standardId);
        const ids = (indicators || []).map((i) => i.id);
        query = query.in('indicator_id', ids);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as IndicatorRating[];
    },
    enabled: !!school,
  });
}

export function useAllRatings() {
  const { school, academicYear } = useSchoolStore();

  return useQuery({
    queryKey: ['all-ratings', school?.id, academicYear],
    queryFn: async () => {
      if (!school) return [];
      const { data, error } = await supabase
        .from('indicator_ratings')
        .select('*')
        .eq('school_id', school.id)
        .eq('academic_year', academicYear);
      if (error) throw error;
      return data as IndicatorRating[];
    },
    enabled: !!school,
  });
}

export function useSaveRating() {
  const queryClient = useQueryClient();
  const { school, academicYear, profile } = useSchoolStore();

  return useMutation({
    mutationFn: async (params: {
      indicator_id: string;
      rating: number;
      strengths?: string;
      improvement_areas?: string;
      self_eval_notes?: string;
    }) => {
      if (!school) throw new Error('No school');
      const { data, error } = await supabase
        .from('indicator_ratings')
        .upsert(
          {
            school_id: school.id,
            indicator_id: params.indicator_id,
            academic_year: academicYear,
            rating: params.rating,
            strengths: params.strengths,
            improvement_areas: params.improvement_areas,
            self_eval_notes: params.self_eval_notes,
            rated_by: profile?.id,
            rated_at: new Date().toISOString(),
          },
          { onConflict: 'school_id,indicator_id,academic_year' }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['indicator-ratings'] });
      queryClient.invalidateQueries({ queryKey: ['all-ratings'] });
    },
  });
}
