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
      if (!user) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      return data as Profile;
    },
  });

  const schoolQuery = useQuery({
    queryKey: ['school', profileQuery.data?.school_id],
    queryFn: async () => {
      if (!profileQuery.data?.school_id) return null;
      const { data, error } = await supabase
        .from('schools')
        .select('*')
        .eq('id', profileQuery.data.school_id)
        .single();
      if (error) throw error;
      return data as School;
    },
    enabled: !!profileQuery.data?.school_id,
  });

  useEffect(() => {
    if (profileQuery.data) setProfile(profileQuery.data);
  }, [profileQuery.data, setProfile]);

  useEffect(() => {
    if (schoolQuery.data) setSchool(schoolQuery.data);
  }, [schoolQuery.data, setSchool]);

  return {
    school: school || schoolQuery.data,
    profile: profile || profileQuery.data,
    isLoading: profileQuery.isLoading || schoolQuery.isLoading,
  };
}
