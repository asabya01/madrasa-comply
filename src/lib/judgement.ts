// Judgement levels: 1=Outstanding, 2=Good, 3=Satisfactory, 4=Unsatisfactory, 5=Needs Urgent Intervention
export type JudgementLevel = 1 | 2 | 3 | 4 | 5;

export const JUDGEMENT_LABELS: Record<JudgementLevel, string> = {
  1: 'Outstanding',
  2: 'Good',
  3: 'Satisfactory',
  4: 'Unsatisfactory',
  5: 'Needs Urgent Intervention',
};

export const JUDGEMENT_COLORS: Record<JudgementLevel, string> = {
  1: '#437a22',
  2: '#006494',
  3: '#d19900',
  4: '#da7101',
  5: '#a12c7b',
};

export const JUDGEMENT_BG_COLORS: Record<JudgementLevel, string> = {
  1: '#f0f7eb',
  2: '#e6f2f8',
  3: '#fdf6e3',
  4: '#fdf0e6',
  5: '#f8eaf4',
};

export function calcStandardRating(indicatorRatings: number[]): JudgementLevel {
  if (!indicatorRatings.length) return 3;
  const avg = indicatorRatings.reduce((a, b) => a + b, 0) / indicatorRatings.length;
  return Math.round(avg) as JudgementLevel;
}

export function calcDomain1(s11: JudgementLevel, s12: JudgementLevel, s13: JudgementLevel): JudgementLevel {
  if (s11 === 5 || s12 === 5) return 5;
  if (s11 === 1 && s12 === 1 && s13 <= 2) return 1;
  if (s11 <= 2 && s12 <= 2 && s13 <= 3) return 2;
  if (s11 <= 3 && s12 <= 3 && s13 <= 4) return 3;
  if (s11 === 4 || s12 === 4) return 4;
  return 3;
}

export function calcDomain2(s21: JudgementLevel, s22: JudgementLevel, s23: JudgementLevel, s24: JudgementLevel): JudgementLevel {
  if (s21 === 5 || s22 === 5) return 5;
  const maxPrimary = Math.max(s21, s22) as JudgementLevel;
  const maxSupporting = Math.max(s23, s24) as JudgementLevel;
  if (maxPrimary === 1 && maxSupporting <= 2) return 1;
  if (maxPrimary <= 2 && maxSupporting <= 3) return 2;
  if (maxPrimary <= 3 && maxSupporting <= 4) return 3;
  if (maxPrimary === 4) return 4;
  return 3;
}

export function calcDomain3(s31: JudgementLevel, s32: JudgementLevel, s33: JudgementLevel, s34: JudgementLevel, s35: JudgementLevel): JudgementLevel {
  const maxPrimary = Math.max(s31, s32, s33, s35) as JudgementLevel;
  if (maxPrimary === 5) return 5;
  if (maxPrimary === 1 && s34 <= 2) return 1;
  if (maxPrimary <= 2 && s34 <= 3) return 2;
  if (maxPrimary <= 3 && s34 <= 4) return 3;
  if (maxPrimary === 4) return 4;
  return 3;
}

export function calcDomain4(s41: JudgementLevel, s42: JudgementLevel, s43: JudgementLevel, s44: JudgementLevel): JudgementLevel {
  const maxPrimary = Math.max(s41, s42, s43) as JudgementLevel;
  if (maxPrimary === 5) return 5;
  if (maxPrimary === 1 && s44 <= 2) return 1;
  if (maxPrimary <= 2 && s44 <= 3) return 2;
  if (maxPrimary <= 3 && s44 <= 4) return 3;
  if (maxPrimary === 4) return 4;
  return 3;
}

export function calcDomain5(s51: JudgementLevel, s52: JudgementLevel, s53: JudgementLevel, s54: JudgementLevel, s55: JudgementLevel): JudgementLevel {
  const maxPrimary = Math.max(s51, s52, s53, s55) as JudgementLevel;
  if (maxPrimary === 5) return 5;
  if (maxPrimary === 1 && s54 <= 2) return 1;
  if (maxPrimary <= 2 && s54 <= 3) return 2;
  if (maxPrimary <= 3 && s54 <= 4) return 3;
  if (maxPrimary === 4) return 4;
  return 3;
}

export function calcOverallJudgement(
  d1: JudgementLevel, d2: JudgementLevel, d3: JudgementLevel,
  d4: JudgementLevel, d5: JudgementLevel
): JudgementLevel {
  if (d1 === 5 || d3 === 5 || d5 === 5) return 5;
  if (d2 === 5 || d4 === 5) return 4;
  if (d1 === 1 && d3 === 1 && d5 === 1 && d2 <= 2 && d4 <= 2) return 1;
  if (d1 <= 2 && d3 <= 2 && d5 <= 2 && d2 <= 3 && d4 <= 3) return 2;
  if (d1 <= 3 && d3 <= 3 && d5 <= 3 && d2 <= 4 && d4 <= 4) return 3;
  if (d1 === 4 || d3 === 4 || d5 === 4) return 4;
  return 3;
}

export function getFollowUpRequirement(judgement: JudgementLevel): { required: boolean; months: number | null; label: string } {
  if (judgement <= 3) return { required: false, months: null, label: 'No follow-up visit required' };
  if (judgement === 4) return { required: true, months: 24, label: 'Follow-up visit required within 24 months' };
  return { required: true, months: 12, label: 'Follow-up visit required within 12 months (urgent)' };
}

export function getJudgementLabel(rating: JudgementLevel): string {
  return JUDGEMENT_LABELS[rating];
}

export function ratingToPercent(rating: number): number {
  return Math.round(((5 - rating) / 4) * 100);
}
