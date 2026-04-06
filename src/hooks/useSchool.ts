import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import type { School, Profile, SchoolMember } from '../types';

export function useSchool() {
  const {
    school, profile, setSchool, setProfile,
    userRole, setUserRole, setAllMemberships,
  } = useSchoolStore();

  // 1. Load profile for the current auth user
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
      console.log('[useSchool] Profile loaded — is_super_admin:', data?.is_super_admin);
      return data as Profile | null;
    },
    retry: 2,
    staleTime: 1000 * 60 * 5,
  });

  // 2. Load all school memberships for this user
  const membershipsQuery = useQuery({
    queryKey: ['school_members', profileQuery.data?.id],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      console.log('[useSchool] Fetching school memberships for user:', user.id);
      const { data, error } = await supabase
        .from('school_members')
        .select('*, school:schools(*)')
        .eq('user_id', user.id)
        .eq('status', 'active');
      if (error) {
        console.error('[useSchool] Memberships fetch error:', error.code, error.message);
        throw error;
      }
      console.log('[useSchool] Memberships loaded:', data?.length);
      return (data ?? []) as SchoolMember[];
    },
    enabled: !!profileQuery.data,
    retry: 2,
    staleTime: 1000 * 60 * 5,
  });

  // 3. Derive the active school from memberships (first one, or previously persisted)
  const activeMembership = membershipsQuery.data?.[0] ?? null;
  const activeSchool = (activeMembership?.school as School | undefined) ?? null;

  // 4. Sync to store
  useEffect(() => {
    if (profileQuery.data) {
      console.log('[useSchool] Setting profile in store:', profileQuery.data.id);
      setProfile(profileQuery.data);
    }
  }, [profileQuery.data, setProfile]);

  useEffect(() => {
    if (membershipsQuery.data) {
      setAllMemberships(membershipsQuery.data);
    }
  }, [membershipsQuery.data, setAllMemberships]);

  useEffect(() => {
    if (activeSchool) {
      console.log('[useSchool] Setting school in store:', activeSchool.id, activeSchool.name_en);
      setSchool(activeSchool);
    }
    if (activeMembership) {
      setUserRole(activeMembership.role);
    }
  }, [activeSchool, activeMembership, setSchool, setUserRole]);

  const loadedProfile = profileQuery.data;
  const isLoading =
    profileQuery.isLoading ||
    (!!profileQuery.data && membershipsQuery.isLoading);
  const error = profileQuery.error || membershipsQuery.error;

  // Needs onboarding when:
  //   - Profile query has completed (regardless of whether a row exists)
  //   - No active school memberships
  //   - Not a super admin (super admins have no school by design)
  //
  // NOTE: !!loadedProfile is intentionally NOT required here. A null profile
  // (trigger hasn't fired yet, or row was never created) also means the user
  // needs onboarding — showing the app shell without a school would be broken.
  const needsOnboarding =
    !isLoading &&
    profileQuery.isSuccess &&
    !loadedProfile?.is_super_admin &&
    (membershipsQuery.data?.length ?? 0) === 0;

  // Switch to a different school (for multi-school users)
  function switchSchool(schoolId: string) {
    const membership = membershipsQuery.data?.find((m) => m.school_id === schoolId);
    if (!membership) return;
    const newSchool = membership.school as School | undefined;
    if (newSchool) {
      setSchool(newSchool);
      setUserRole(membership.role);
    }
  }

  return {
    school:          school || activeSchool || null,
    profile:         profile || loadedProfile || null,
    userRole:        userRole || activeMembership?.role || null,
    allMemberships:  membershipsQuery.data ?? [],
    isLoading,
    error,
    needsOnboarding,
    switchSchool,
  };
}
