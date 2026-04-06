import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';

export interface AcademicYear {
  id: string;
  school_id: string;
  label: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  created_at: string;
}

export function useAcademicYears() {
  const { school } = useSchoolStore();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [currentYear, setCurrentYearState] = useState<AcademicYear | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!school?.id) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('academic_years')
      .select('*')
      .eq('school_id', school.id)
      .order('label', { ascending: false });
    if (error) {
      setError(error.message);
    } else {
      setYears(data || []);
      setCurrentYearState(data?.find(y => y.is_current) ?? data?.[0] ?? null);
    }
    setLoading(false);
  }, [school?.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function createYear(label: string, startDate?: string, endDate?: string) {
    if (!school?.id) return;
    const { error } = await supabase.from('academic_years').insert({
      school_id: school.id,
      label,
      start_date: startDate || null,
      end_date: endDate || null,
      is_current: false,
    });
    if (error) throw error;
    await load();
  }

  async function setCurrentYear(yearId: string) {
    if (!school?.id) return;
    // Unset all first, then set the selected one
    await supabase
      .from('academic_years')
      .update({ is_current: false })
      .eq('school_id', school.id);
    const { error } = await supabase
      .from('academic_years')
      .update({ is_current: true })
      .eq('id', yearId)
      .eq('school_id', school.id);
    if (error) throw error;
    await load();
  }

  async function deleteYear(yearId: string) {
    if (!school?.id) return;
    const { error } = await supabase
      .from('academic_years')
      .delete()
      .eq('id', yearId)
      .eq('school_id', school.id);
    if (error) throw error;
    await load();
  }

  return { years, currentYear, loading, error, createYear, setCurrentYear, deleteYear, reload: load };
}
