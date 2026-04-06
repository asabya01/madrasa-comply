// ─────────────────────────────────────────────────────────────────────────────
// judgement.ts
// OAAAQA School Evaluation Framework — Judgement Calculation Engine
// Implements ALL rules from PSD Sections 4.1–4.8 exactly as stated.
// ─────────────────────────────────────────────────────────────────────────────

export type JudgementLevel = 1 | 2 | 3 | 4 | 5;

// ─── Labels & colours ─────────────────────────────────────────

export const JUDGEMENT_LABELS: Record<JudgementLevel, string> = {
  1: 'Outstanding',
  2: 'Good',
  3: 'Satisfactory',
  4: 'Unsatisfactory',
  5: 'Needs Urgent Intervention',
};

export const JUDGEMENT_LABELS_SHORT: Record<JudgementLevel, string> = {
  1: 'Outstanding',
  2: 'Good',
  3: 'Satisfactory',
  4: 'Unsatisfactory',
  5: 'NUI',
};

export const JUDGEMENT_COLORS: Record<JudgementLevel, string> = {
  1: '#437a22',  // green
  2: '#006494',  // blue
  3: '#d19900',  // gold/amber
  4: '#da7101',  // orange
  5: '#a12c7b',  // maroon
};

// ─── PSD Table 10 — Evaluative terms ──────────────────────────

export const EVALUATIVE_TERMS = {
  1: { quality: ['effective', 'distinguished', 'highly efficient', 'a model to emulate'], distribution: ['all', 'almost everyone', 'the vast majority'] },
  2: { quality: ['effective', 'good', 'notable'], distribution: ['most', 'more'] },
  3: { quality: ['acceptable', 'appropriate', 'suitable'], distribution: ['the majority'] },
  4: { quality: ['unacceptable', 'inappropriate', 'unsuitable', 'limited'], distribution: ['few', 'a limited number'] },
  5: { quality: ['non-existent', 'rare', 'very limited'], distribution: ['minority', 'rare number', 'very limited number', 'non-existent'] },
} as const;

// ─── Utility ──────────────────────────────────────────────────

/** Convert numeric rating to display percentage (1=100%, 5=0%) */
export function ratingToPercent(rating: number): number {
  return Math.round(((5 - rating) / 4) * 100);
}

export function getJudgementLabel(rating: JudgementLevel): string {
  return JUDGEMENT_LABELS[rating];
}

export function getJudgementColor(rating: JudgementLevel): string {
  return JUDGEMENT_COLORS[rating];
}

/** Simple average of indicator ratings, rounded. Used as a fallback
 *  when no quantitative input is available. */
export function calcStandardRating(ratings: number[]): JudgementLevel {
  if (!ratings.length) return 3;
  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const rounded = Math.round(avg);
  return Math.max(1, Math.min(5, rounded)) as JudgementLevel;
}

// ─── PSD Section 4.3 — Student Proficiency Rate ───────────────

/**
 * Table 8: Proficiency rate → judgement.
 * proficiencyRate is a percentage (0–100).
 */
export function proficiencyRateToJudgement(proficiencyRate: number): JudgementLevel {
  if (proficiencyRate >= 70) return 1;
  if (proficiencyRate >= 60) return 2;
  if (proficiencyRate >= 50) return 3;
  if (proficiencyRate >= 40) return 4;
  return 5;
}

/**
 * School-wide average proficiency rate across all grades and core subjects.
 * Input: array of { proficiencyRate } records.
 */
export function calcSchoolProficiencyRate(records: Array<{ proficiency_rate: number }>): number {
  if (!records.length) return 0;
  const sum = records.reduce((acc, r) => acc + r.proficiency_rate, 0);
  return Math.round((sum / records.length) * 100) / 100;
}

// ─── PSD Section 4.4 — National Exam Comparison ──────────────

/**
 * Table 7: Delta (school avg − national avg) → description.
 */
export function nationalExamDelta(schoolAvg: number, nationalAvg: number): string {
  const delta = schoolAvg - nationalAvg;
  if (delta >= 1.5)  return 'Significantly above the national average';
  if (delta > 0.5)   return 'Slightly above the national average';
  if (delta > 0)     return 'Close to the national average (positive)';
  if (delta === 0)   return 'Consistent with the national average';
  if (delta > -0.5)  return 'Slightly below the national average';
  if (delta >= -1.5) return 'Below the national average';
  return 'Significantly below the national average';
}

// ─── PSD Section 4.5 — Cohort Progress ───────────────────────

/**
 * Table 9: Change in average proficiency rate (percentage points) → description.
 * change = currentYearAvg − threeYearsAgoAvg
 */
export function cohortProgressDescription(changePct: number): string {
  if (changePct > 15)  return 'Strong Progress';
  if (changePct > 10)  return 'Significant Progress';
  if (changePct > 5)   return 'Mild Progress';
  if (changePct >= -5) return 'Stable';
  if (changePct > -10) return 'Mild Decrease';
  if (changePct > -15) return 'Significant Decrease';
  return 'Sharp Drop';
}

// ─── PSD Section 4.6 — Attendance ────────────────────────────

/** Table 11: Attendance rate (%) → judgement */
export function attendanceRateToJudgement(rate: number): JudgementLevel {
  if (rate >= 96) return 1;
  if (rate >= 94) return 2;
  if (rate >= 92) return 3;
  if (rate >= 90) return 4;
  return 5;
}

// ─── PSD Section 4.7 — Domain Judgement Rules ─────────────────
//
// All rules implemented verbatim from the PSD tables.
// The key distinction from a naive average:
//   - Primary standards drive the judgement ceiling.
//   - "none lower than X" means max(primaries) <= X.
//   - Supporting standards can block Outstanding but rarely override.
// ─────────────────────────────────────────────────────────────

/**
 * Domain 1: Academic Achievement
 * Primary:   1.1 (attainment), 1.2 (progress)
 * Supporting: 1.3 (learning skills)
 *
 * Outstanding: 1.1 AND 1.2 are Outstanding; 1.3 ≥ Good
 * Good:        one/both of 1.1, 1.2 are Good (neither lower than Good); 1.3 ≥ Satisfactory
 * Satisfactory: one/both of 1.1, 1.2 are Satisfactory (neither lower); 1.3 ≥ Unsatisfactory
 * Unsatisfactory: one/both of 1.1, 1.2 are Unsatisfactory (neither lower); OR 1.3 = NUI
 * NUI: one/both of 1.1, 1.2 are NUI
 */
export function calcDomain1(
  s11: JudgementLevel,
  s12: JudgementLevel,
  s13: JudgementLevel
): { judgement: JudgementLevel; trace: string } {
  const maxPrimary = Math.max(s11, s12) as JudgementLevel;

  if (maxPrimary === 5) {
    return { judgement: 5, trace: 'One or both of 1.1/1.2 are Needs Urgent Intervention → Domain is NUI' };
  }
  if (maxPrimary === 4 || s13 === 5) {
    return { judgement: 4, trace: maxPrimary === 4
      ? 'One or both of 1.1/1.2 are Unsatisfactory → Domain is Unsatisfactory'
      : '1.3 is NUI → Domain is Unsatisfactory' };
  }
  if (s11 === 1 && s12 === 1 && s13 <= 2) {
    return { judgement: 1, trace: '1.1 and 1.2 are Outstanding; 1.3 is Good or better → Outstanding' };
  }
  if (maxPrimary <= 2 && s13 <= 3) {
    return { judgement: 2, trace: 'Both 1.1 and 1.2 are Good or better; 1.3 is Satisfactory or better → Good' };
  }
  if (maxPrimary <= 3 && s13 <= 4) {
    return { judgement: 3, trace: 'Both 1.1 and 1.2 are Satisfactory or better; 1.3 is Unsatisfactory or better → Satisfactory' };
  }
  return { judgement: 3, trace: 'Default: Satisfactory' };
}

/**
 * Domain 2: Personal Development
 * Primary:   2.1 (values), 2.2 (identity)
 * Supporting: 2.3 (health/environment), 2.4 (innovation)
 *
 * Outstanding: 2.1 AND 2.2 are Outstanding; 2.3 AND 2.4 ≥ Good
 * Good:        one/both of 2.1, 2.2 are Good (neither lower); 2.3 AND 2.4 ≥ Satisfactory
 * Satisfactory: one/both of 2.1, 2.2 are Satisfactory (neither lower); 2.3 AND 2.4 ≥ Unsatisfactory
 * Unsatisfactory: one/both of 2.1, 2.2 are Unsatisfactory (neither lower); OR one/both of 2.3, 2.4 = NUI
 * NUI: one/both of 2.1, 2.2 are NUI
 */
export function calcDomain2(
  s21: JudgementLevel,
  s22: JudgementLevel,
  s23: JudgementLevel,
  s24: JudgementLevel
): { judgement: JudgementLevel; trace: string } {
  const maxPrimary = Math.max(s21, s22) as JudgementLevel;
  const maxSupporting = Math.max(s23, s24) as JudgementLevel;

  if (maxPrimary === 5) {
    return { judgement: 5, trace: 'One or both of 2.1/2.2 are NUI → Domain is NUI' };
  }
  if (maxPrimary === 4 || maxSupporting === 5) {
    return { judgement: 4, trace: maxPrimary === 4
      ? 'One or both of 2.1/2.2 are Unsatisfactory → Unsatisfactory'
      : 'One or both of 2.3/2.4 are NUI → Unsatisfactory' };
  }
  if (s21 === 1 && s22 === 1 && maxSupporting <= 2) {
    return { judgement: 1, trace: '2.1 and 2.2 Outstanding; 2.3 and 2.4 ≥ Good → Outstanding' };
  }
  if (maxPrimary <= 2 && maxSupporting <= 3) {
    return { judgement: 2, trace: 'Both 2.1/2.2 ≤ Good; 2.3 and 2.4 ≤ Satisfactory → Good' };
  }
  if (maxPrimary <= 3 && maxSupporting <= 4) {
    return { judgement: 3, trace: 'Both 2.1/2.2 ≤ Satisfactory; 2.3/2.4 ≤ Unsatisfactory → Satisfactory' };
  }
  return { judgement: 3, trace: 'Default: Satisfactory' };
}

/**
 * Domain 3: Teaching and Assessment
 * Primary:   3.1, 3.2, 3.3, 3.5
 * Supporting: 3.4
 *
 * Outstanding: 3.1, 3.2, 3.3 AND 3.5 Outstanding; 3.4 ≥ Good
 * Good:        one/all of 3.1, 3.2, 3.3, 3.5 Good (none lower); 3.4 ≥ Satisfactory
 * Satisfactory: one/all of 3.1, 3.2, 3.3, 3.5 Satisfactory (none lower); 3.4 ≥ Unsatisfactory
 * Unsatisfactory: one/all of 3.1, 3.2, 3.3, 3.5 Unsatisfactory (none lower); OR 3.4 = NUI
 * NUI: one/all of 3.1, 3.2, 3.3, 3.5 are NUI
 */
export function calcDomain3(
  s31: JudgementLevel,
  s32: JudgementLevel,
  s33: JudgementLevel,
  s34: JudgementLevel,
  s35: JudgementLevel
): { judgement: JudgementLevel; trace: string } {
  const primaries = [s31, s32, s33, s35];
  const maxPrimary = Math.max(...primaries) as JudgementLevel;

  if (maxPrimary === 5) {
    return { judgement: 5, trace: 'One or more of 3.1/3.2/3.3/3.5 are NUI → Domain is NUI' };
  }
  if (maxPrimary === 4 || s34 === 5) {
    return { judgement: 4, trace: maxPrimary === 4
      ? 'One or more of 3.1/3.2/3.3/3.5 are Unsatisfactory → Unsatisfactory'
      : '3.4 is NUI → Unsatisfactory' };
  }
  if (maxPrimary === 1 && s34 <= 2) {
    return { judgement: 1, trace: 'All of 3.1, 3.2, 3.3, 3.5 are Outstanding; 3.4 ≥ Good → Outstanding' };
  }
  if (maxPrimary <= 2 && s34 <= 3) {
    return { judgement: 2, trace: 'All primaries ≤ Good; 3.4 ≤ Satisfactory → Good' };
  }
  if (maxPrimary <= 3 && s34 <= 4) {
    return { judgement: 3, trace: 'All primaries ≤ Satisfactory; 3.4 ≤ Unsatisfactory → Satisfactory' };
  }
  return { judgement: 3, trace: 'Default: Satisfactory' };
}

/**
 * Domain 4: School Climate and Learning Environment
 * Primary:   4.1, 4.2, 4.3
 * Supporting: 4.4
 */
export function calcDomain4(
  s41: JudgementLevel,
  s42: JudgementLevel,
  s43: JudgementLevel,
  s44: JudgementLevel
): { judgement: JudgementLevel; trace: string } {
  const primaries = [s41, s42, s43];
  const maxPrimary = Math.max(...primaries) as JudgementLevel;

  if (maxPrimary === 5) {
    return { judgement: 5, trace: 'One or more of 4.1/4.2/4.3 are NUI → Domain is NUI' };
  }
  if (maxPrimary === 4 || s44 === 5) {
    return { judgement: 4, trace: maxPrimary === 4
      ? 'One or more of 4.1/4.2/4.3 are Unsatisfactory → Unsatisfactory'
      : '4.4 is NUI → Unsatisfactory' };
  }
  if (maxPrimary === 1 && s44 <= 2) {
    return { judgement: 1, trace: 'All of 4.1, 4.2, 4.3 Outstanding; 4.4 ≥ Good → Outstanding' };
  }
  if (maxPrimary <= 2 && s44 <= 3) {
    return { judgement: 2, trace: 'All primaries ≤ Good; 4.4 ≤ Satisfactory → Good' };
  }
  if (maxPrimary <= 3 && s44 <= 4) {
    return { judgement: 3, trace: 'All primaries ≤ Satisfactory; 4.4 ≤ Unsatisfactory → Satisfactory' };
  }
  return { judgement: 3, trace: 'Default: Satisfactory' };
}

/**
 * Domain 5: Leadership, Management and Governance
 * Primary:   5.1, 5.2, 5.3, 5.5
 * Supporting: 5.4
 */
export function calcDomain5(
  s51: JudgementLevel,
  s52: JudgementLevel,
  s53: JudgementLevel,
  s54: JudgementLevel,
  s55: JudgementLevel
): { judgement: JudgementLevel; trace: string } {
  const primaries = [s51, s52, s53, s55];
  const maxPrimary = Math.max(...primaries) as JudgementLevel;

  if (maxPrimary === 5) {
    return { judgement: 5, trace: 'One or more of 5.1/5.2/5.3/5.5 are NUI → Domain is NUI' };
  }
  if (maxPrimary === 4 || s54 === 5) {
    return { judgement: 4, trace: maxPrimary === 4
      ? 'One or more of 5.1/5.2/5.3/5.5 are Unsatisfactory → Unsatisfactory'
      : '5.4 is NUI → Unsatisfactory' };
  }
  if (maxPrimary === 1 && s54 <= 2) {
    return { judgement: 1, trace: 'All of 5.1, 5.2, 5.3, 5.5 Outstanding; 5.4 ≥ Good → Outstanding' };
  }
  if (maxPrimary <= 2 && s54 <= 3) {
    return { judgement: 2, trace: 'All primaries ≤ Good; 5.4 ≤ Satisfactory → Good' };
  }
  if (maxPrimary <= 3 && s54 <= 4) {
    return { judgement: 3, trace: 'All primaries ≤ Satisfactory; 5.4 ≤ Unsatisfactory → Satisfactory' };
  }
  return { judgement: 3, trace: 'Default: Satisfactory' };
}

// ─── PSD Section 4.8 — Overall School Judgement ───────────────

/**
 * Table 4: Overall school performance judgement.
 * HIGH-weight domains: 1, 3, 5
 * MEDIUM-weight domains: 2, 4
 *
 * Outstanding: D1, D3, D5 all Outstanding; D2 and D4 ≥ Good
 * Good:        one/all of D1, D3, D5 ≤ Good (none lower than Good); D2 and D4 ≥ Satisfactory
 * Satisfactory: one/all of D1, D3, D5 ≤ Satisfactory (none lower); D2 and D4 ≥ Unsatisfactory
 * Unsatisfactory: one/all of D1, D3, D5 Unsatisfactory (none lower); OR D2/D4 = NUI
 * NUI: one/all of D1, D3, D5 are NUI
 */
export function calcOverallJudgement(
  d1: JudgementLevel,
  d2: JudgementLevel,
  d3: JudgementLevel,
  d4: JudgementLevel,
  d5: JudgementLevel
): { judgement: JudgementLevel; trace: string } {
  const highWeight = [d1, d3, d5];
  const maxHigh = Math.max(...highWeight) as JudgementLevel;
  const maxMedium = Math.max(d2, d4) as JudgementLevel;

  if (maxHigh === 5) {
    return {
      judgement: 5,
      trace: 'One or more of Domains 1, 3, or 5 are Needs Urgent Intervention → Overall is NUI',
    };
  }
  if (maxHigh === 4 || maxMedium === 5) {
    return {
      judgement: 4,
      trace: maxHigh === 4
        ? 'One or more of Domains 1, 3, or 5 are Unsatisfactory → Overall is Unsatisfactory'
        : 'Domain 2 or 4 is NUI → Overall is Unsatisfactory',
    };
  }
  if (d1 === 1 && d3 === 1 && d5 === 1 && maxMedium <= 2) {
    return {
      judgement: 1,
      trace: 'Domains 1, 3, 5 all Outstanding; Domains 2 and 4 are Good or better → Outstanding',
    };
  }
  if (maxHigh <= 2 && maxMedium <= 3) {
    return {
      judgement: 2,
      trace: 'Domains 1, 3, 5 all Good or better; Domains 2 and 4 are Satisfactory or better → Good',
    };
  }
  if (maxHigh <= 3 && maxMedium <= 4) {
    return {
      judgement: 3,
      trace: 'Domains 1, 3, 5 all Satisfactory or better; Domains 2 and 4 are Unsatisfactory or better → Satisfactory',
    };
  }
  return { judgement: 3, trace: 'Default: Satisfactory' };
}

// ─── Follow-up requirement (unchanged from original) ──────────

export function getFollowUpRequirement(judgement: JudgementLevel): {
  required: boolean;
  months: number | null;
  label: string;
} {
  if (judgement <= 3) return { required: false, months: null, label: 'No follow-up visit required' };
  if (judgement === 4) return { required: true, months: 24, label: 'Follow-up visit required within 24 months' };
  return { required: true, months: 12, label: 'Follow-up visit required within 12 months (urgent)' };
}
