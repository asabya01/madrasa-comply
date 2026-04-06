import { create } from 'zustand';
import type { School, Profile, SchoolMember, SchoolMemberRole } from '../types';

interface SchoolState {
  school: School | null;
  profile: Profile | null;
  academicYear: string;
  userRole: SchoolMemberRole | null;
  allMemberships: SchoolMember[];
  setSchool: (school: School | null) => void;
  setProfile: (profile: Profile | null) => void;
  setAcademicYear: (year: string) => void;
  setUserRole: (role: SchoolMemberRole | null) => void;
  setAllMemberships: (memberships: SchoolMember[]) => void;
}

function getCurrentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 9) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}

export const useSchoolStore = create<SchoolState>((set) => ({
  school: null,
  profile: null,
  academicYear: getCurrentAcademicYear(),
  userRole: null,
  allMemberships: [],
  setSchool: (school) => set({ school }),
  setProfile: (profile) => set({ profile }),
  setAcademicYear: (academicYear) => set({ academicYear }),
  setUserRole: (userRole) => set({ userRole }),
  setAllMemberships: (allMemberships) => set({ allMemberships }),
}));
