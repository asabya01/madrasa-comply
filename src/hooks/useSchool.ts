import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import type { School, Profile, SchoolMember } from '../types';

const ACTIVE_SCHOOL_KEY = 'activeSchoolId';

export function useSchool() {
  const {
    school, profile, setSchool, setProfile,
    userRole, setUserRole, setAllMemberships,
  } = useSchoolStore();

  // ── Step 1: fetch profile (explicit columns — no legacy school_id / role) ──
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
        .select('id, full_name, avatar_url, email, is_super_admin, created_at')
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

  // ── Step 2: fetch active school memberships (runs as soon as profile query
  //    settles — even if it returned null, so we can correctly detect 0 memberships)
  const membershipsQuery = useQuery({
    queryKey: ['school_members', profileQuery.data?.id],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      console.log('[useSchool] Fetching school memberships for user:', user.id);
      const { data, error } = await supabase
        .from('school_members')
        .select(`
          id, user_id, role, status, school_id, joined_at, created_at,
          school:schools!school_members_school_id_fkey (
            id, name_en, name_ar, logo_url,
            subscription_tier, subscription_status, trial_ends_at,
            invite_mode, is_active, slug
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active');
      if (error) {
        console.error('[useSchool] Memberships fetch error:', error.code, error.message, error);
        throw error;
      }
      console.log('[useSchool] Memberships loaded:', data?.length);
      // Supabase returns foreign-key joins as arrays; flatten school → single object
      const rows = (data ?? []) as unknown as (Omit<SchoolMember, 'school'> & { school: School | School[] | null | undefined })[];
      return rows.map((m) => ({
        ...m,
        school: Array.isArray(m.school) ? m.school[0] : m.school,
      })) as SchoolMember[];
    },
    // Run once profile query has settled (success or empty) — do NOT gate on !!profile
    enabled: profileQuery.isSuccess,
    retry: 2,
    staleTime: 1000 * 60 * 5,
  });

  // ── Step 3: pick active school ─────────────────────────────────────────────
  //   - 1 membership  → use it automatically
  //   - 2+ memberships → check localStorage, fall back to first
  //   - 0 memberships, super admin → school = null (allowed)
  //   - 0 memberships, regular user → needsOnboarding = true (handled below)
  function resolveActiveMembership(memberships: SchoolMember[]): SchoolMember | null {
    if (memberships.length === 0) return null;
    if (memberships.length === 1) return memberships[0];
    const saved = localStorage.getItem(ACTIVE_SCHOOL_KEY);
    if (saved) {
      const found = memberships.find((m) => m.school_id === saved);
      if (found) return found;
    }
    return memberships[0];
  }

  const memberships      = membershipsQuery.data ?? [];
  const activeMembership = resolveActiveMembership(memberships);
  const activeSchool     = (activeMembership?.school as School | undefined) ?? null;

  // ── Step 4: sync to Zustand store ─────────────────────────────────────────
  useEffect(() => {
    if (profileQuery.data) {
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
      console.log('[useSchool] Active school:', activeSchool.id, activeSchool.name_en);
      setSchool(activeSchool);
    }
    if (activeMembership) {
      setUserRole(activeMembership.role);
    }
  }, [activeSchool, activeMembership, setSchool, setUserRole]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const loadedProfile = profileQuery.data;
  const isLoading =
    profileQuery.isLoading ||
    (profileQuery.isSuccess && membershipsQuery.isLoading);
  const error = profileQuery.error || membershipsQuery.error;

  // needsOnboarding:
  //   • profile query completed (isSuccess — even if it returned null)
  //   • no active school memberships
  //   • not a super admin
  //
  // Intentionally does NOT require !!loadedProfile — a null profile row also
  // means the user needs onboarding (trigger delay or missing row).
  const needsOnboarding =
    !isLoading &&
    profileQuery.isSuccess &&
    membershipsQuery.isSuccess &&
    !loadedProfile?.is_super_admin &&
    memberships.length === 0;

  // ── switchSchool: for multi-school users ──────────────────────────────────
  function switchSchool(schoolId: string) {
    const membership = memberships.find((m) => m.school_id === schoolId);
    if (!membership) return;
    const newSchool = membership.school as School | undefined;
    if (newSchool) {
      localStorage.setItem(ACTIVE_SCHOOL_KEY, schoolId);
      setSchool(newSchool);
      setUserRole(membership.role);
    }
  }

  return {
    school:          school || activeSchool || null,
    profile:         profile || loadedProfile || null,
    userRole:        userRole || activeMembership?.role || null,
    allMemberships:  memberships,
    isLoading,
    error,
    needsOnboarding,
    switchSchool,
  };
}
