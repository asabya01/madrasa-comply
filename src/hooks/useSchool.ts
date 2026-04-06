import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import type { School, Profile } from '../types';

export function useSchool() {
  const { school, profile, setSchool, setProfile } = useSchoolStore();

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('[useSchool] No authenticated user found');
        return null;
      }
      console.log('[useSchool] Fetching profile for user:', user.id);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (error) {
        console.error('[useSchool] Profile fetch error:', error.code, error.message);
        throw error;
      }
      console.log('[useSchool] Profile loaded — school_id:', data?.school_id, 'role:', data?.role);
      return data as Profile | null;
    },
    retry: 2,
    staleTime: 1000 * 60 * 5,
  });

  const schoolQuery = useQuery({
    queryKey: ['school', profileQuery.data?.school_id],
    queryFn: async () => {
      if (!profileQuery.data?.school_id) {
        console.warn('[useSchool] Profile has no school_id');
        return null;
      }
      console.log('[useSchool] Fetching school:', profileQuery.data.school_id);
      const { data, error } = await supabase
        .from('schools')
        .select('*')
        .eq('id', profileQuery.data.school_id)
        .maybeSingle();
      if (error) {
        console.error('[useSchool] School fetch error:', error.code, error.message);
        throw error;
      }
      console.log('[useSchool] School loaded:', data?.name_en);
      return data as School | null;
    },
    enabled: !!profileQuery.data?.school_id,
    retry: 2,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (profileQuery.data) {
      console.log('[useSchool] Setting profile in store:', profileQuery.data.id);
      setProfile(profileQuery.data);
    }
  }, [profileQuery.data, setProfile]);

  useEffect(() => {
    if (schoolQuery.data) {
      console.log('[useSchool] Setting school in store:', schoolQuery.data.id, schoolQuery.data.name_en);
      setSchool(schoolQuery.data);
    }
  }, [schoolQuery.data, setSchool]);

  const isLoading = profileQuery.isLoading || (!!profileQuery.data?.school_id && schoolQuery.isLoading);
  const error     = profileQuery.error || schoolQuery.error;

  // Profile loaded but no school_id and not an admin → user needs to complete onboarding
  const loadedProfile = profileQuery.data;
  const needsOnboarding =
    !isLoading &&
    !!loadedProfile &&
    !loadedProfile.school_id &&
    loadedProfile.role !== 'admin';

  return {
    school:          school || schoolQuery.data || null,
    profile:         profile || loadedProfile || null,
    isLoading,
    error,
    needsOnboarding,
  };
}
