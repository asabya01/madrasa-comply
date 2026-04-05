import { create } from 'zustand';
import type { School, Profile } from '../types';

interface SchoolState {
  school: School | null;
  profile: Profile | null;
  academicYear: string;
  setSchool: (school: School | null) => void;
  setProfile: (profile: Profile | null) => void;
  setAcademicYear: (year: string) => void;
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
  setSchool: (school) => set({ school }),
  setProfile: (profile) => set({ profile }),
  setAcademicYear: (academicYear) => set({ academicYear }),
}));
