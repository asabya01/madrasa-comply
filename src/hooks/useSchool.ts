import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import type { School, Profile, SchoolMember } from '../types';

const ACTIVE_SCHOOL_KEY = 'activeSchoolId';

// Shape returned by the combined school_members + profiles join
type MembershipRow = Omit<SchoolMember, 'school'> & {
  profiles: Profile | Profile[] | null;
  school:   School  | School[]  | null | undefined;
};

export function useSchool() {
  const {
    school, profile, setSchool, setProfile,
    userRole, setUserRole, setAllMemberships,
  } = useSchoolStore();

  // ── Combined query: memberships + embedded profile + embedded school ────────
  // Single round-trip — no sequential gating needed.
  // FK hint profiles!school_members_user_id_fkey disambiguates the two
  // FK paths from school_members → profiles (user_id vs invited_by).
  const membershipsQuery = useQuery({
    queryKey: ['school_members_full'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { memberships: [] as SchoolMember[], profile: null as Profile | null };

      const { data, error } = await supabase
        .from('school_members')
        .select(`
          id, user_id, role, status, school_id, joined_at, created_at,
          profiles:profiles!school_members_user_id_fkey (
            id, full_name, avatar_url, email, is_super_admin, department, created_at
          ),
          school:schools!school_members_school_id_fkey (
            id, name_en, name_ar, logo_url,
            subscription_tier, subscription_status, trial_ends_at,
            invite_mode, is_active, slug
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (error) {
        console.error('[useSchool] Memberships fetch error:', error.code, error.message);
        throw error;
      }

      // Normalise: FK many→one returns object; guard against array just in case
      const rows = (data ?? []) as unknown as MembershipRow[];
      const memberships: SchoolMember[] = rows.map((m) => ({
        ...m,
        school: Array.isArray(m.school) ? m.school[0] : m.school,
      })) as SchoolMember[];

      // Extract profile from first membership (same user across all rows)
      let resolvedProfile: Profile | null = null;
      if (rows.length) {
        const raw = rows[0].profiles;
        resolvedProfile = (Array.isArray(raw) ? raw[0] : raw) as Profile | null;
      }

      // Super admin with no school memberships — fetch profile directly
      if (!resolvedProfile) {
        const { data: pData } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, email, is_super_admin, department, created_at')
          .eq('id', user.id)
          .maybeSingle();
        resolvedProfile = pData as Profile | null;
      }

      return { memberships, profile: resolvedProfile };
    },
    retry: 2,
    staleTime: 1000 * 60 * 5,
  });

  // ── Resolve active membership from the list ────────────────────────────────
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

  const memberships      = membershipsQuery.data?.memberships ?? [];
  const resolvedProfile  = membershipsQuery.data?.profile ?? null;
  const activeMembership = resolveActiveMembership(memberships);
  const activeSchool     = (activeMembership?.school as School | undefined) ?? null;

  // ── Sync to Zustand store ─────────────────────────────────────────────────
  useEffect(() => {
    if (resolvedProfile) setProfile(resolvedProfile);
  }, [resolvedProfile, setProfile]);

  useEffect(() => {
    if (membershipsQuery.data) setAllMemberships(memberships);
  }, [membershipsQuery.data, memberships, setAllMemberships]);

  useEffect(() => {
    if (activeSchool)     setSchool(activeSchool);
    if (activeMembership) setUserRole(activeMembership.role);
  }, [activeSchool, activeMembership, setSchool, setUserRole]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const isLoading     = membershipsQuery.isLoading;
  const error         = membershipsQuery.error;
  const needsOnboarding =
    !isLoading &&
    membershipsQuery.isSuccess &&
    !resolvedProfile?.is_super_admin &&
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
    school:         school || activeSchool || null,
    profile:        profile || resolvedProfile || null,
    userRole:       userRole || activeMembership?.role || null,
    allMemberships: memberships,
    isLoading,
    error,
    needsOnboarding,
    switchSchool,
  };
}
