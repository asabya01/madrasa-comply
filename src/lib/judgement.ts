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

export const JUDGEMENT_LABELS_AR: Record<JudgementLevel, string> = {
  1: 'متميز',
  2: 'جيد',
  3: 'مقبول',
  4: 'ضعيف',
  5: 'يحتاج إلى تدخل سريع',
};

export const JUDGEMENT_LABELS_SHORT_AR: Record<JudgementLevel, string> = {
  1: 'متميز',
  2: 'جيد',
  3: 'مقبول',
  4: 'ضعيف',
  5: 'تدخل سريع',
};

export const JUDGEMENT_COLORS: Record<JudgementLevel, string> = {
  1: '#437a22',  // green
  2: '#006494',  // blue
  3: '#d19900',  // gold/amber
  4: '#da7101',  // orange
  5: '#a12c7b',  // maroon
};

/** Get judgement label in current language */
export function getJudgementLabelLocalized(level: JudgementLevel, lang: string): string {
  return lang === 'ar' ? JUDGEMENT_LABELS_AR[level] : JUDGEMENT_LABELS[level];
}

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
 * Table 7: Delta (school avg − national avg) → description string (legacy).
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

/**
 * Table 7: delta = school_rate − national_avg → { label, colour } badge.
 */
export function nationalComparisonLabel(delta: number): { label: string; colour: string } {
  if (delta > 1.5)   return { label: 'Significantly above national', colour: '#437a22' };
  if (delta > 0.5)   return { label: 'Slightly above national',      colour: '#01696f' };
  if (delta > 0)     return { label: 'Close to national',            colour: '#006494' };
  if (delta === 0)   return { label: 'At national average',          colour: '#6b7280' };
  if (delta > -0.5)  return { label: 'Slightly below national',      colour: '#d19900' };
  if (delta > -1.5)  return { label: 'Below national',               colour: '#da7101' };
  return               { label: 'Significantly below national',      colour: '#c0392b' };
}

// ─── PSD Section 4.5 — Cohort Progress ───────────────────────

/**
 * Table 9: Change in average proficiency rate (percentage points) → { label, colour }.
 * change = latestYearAvg − earliestYearAvg
 */
export function cohortProgressDescription(change: number): { label: string; colour: string } {
  if (change > 15)  return { label: 'Strong Progress',        colour: '#437a22' };
  if (change > 10)  return { label: 'Significant Progress',   colour: '#01696f' };
  if (change > 5)   return { label: 'Mild Progress',          colour: '#006494' };
  if (change >= -5) return { label: 'Stable',                 colour: '#6b7280' };
  if (change > -10) return { label: 'Mild Decrease',          colour: '#d19900' };
  if (change > -15) return { label: 'Significant Decrease',   colour: '#da7101' };
  return              { label: 'Sharp Drop',                  colour: '#c0392b' };
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

// ─── PSD Section 4.7/4.8 — High-level calculate* API ─────────
//
// These are the primary public API.  Each `calculate*` function:
//   1. Receives indicator-level ratings keyed by code ('1.1.1', etc.)
//   2. Derives each standard judgement = worst (max) indicator within that standard
//   3. Applies the exact PSD conditional logic to produce a domain judgement
//   4. Returns DomainResult with a structured trace and the limiting standard code.
// ──────────────────────────────────────────────────────────────

export type TraceStep = {
  /** Human-readable label, e.g. 'Standard 1.1 (Attainment)' */
  label: string;
  /** Numeric judgement value 1–5 */
  value: JudgementLevel;
  /** Optional explanation */
  note?: string;
};

export type DomainResult = {
  judgement: JudgementLevel;
  trace: TraceStep[];
  /** Standard code that produced the worst result, if identifiable */
  limitingStandard?: string;
};

export type OverallResult = {
  judgement: JudgementLevel;
  trace: TraceStep[];
};

// ── Indicator membership by standard ──────────────────────────

const STANDARD_INDICATORS: Record<string, string[]> = {
  '1.1': ['1.1.1', '1.1.2', '1.1.3'],
  '1.2': ['1.2.1', '1.2.2', '1.2.3'],
  '1.3': ['1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6'],

  '2.1': ['2.1.1', '2.1.2', '2.1.3'],
  '2.2': ['2.2.1', '2.2.2', '2.2.3', '2.2.4'],
  '2.3': ['2.3.1', '2.3.2'],
  '2.4': ['2.4.1', '2.4.2', '2.4.3', '2.4.4'],

  '3.1': ['3.1.1', '3.1.2', '3.1.3'],
  '3.2': ['3.2.1', '3.2.2', '3.2.3'],
  '3.3': ['3.3.1', '3.3.2', '3.3.3', '3.3.4', '3.3.5'],
  '3.4': ['3.4.1', '3.4.2', '3.4.3', '3.4.4', '3.4.5', '3.4.6'],
  '3.5': ['3.5.1', '3.5.2', '3.5.3', '3.5.4'],

  '4.1': ['4.1.1', '4.1.2', '4.1.3', '4.1.4'],
  '4.2': ['4.2.1', '4.2.2'],
  '4.3': ['4.3.1', '4.3.2', '4.3.3', '4.3.4', '4.3.5'],
  '4.4': ['4.4.1', '4.4.2'],

  '5.1': ['5.1.1', '5.1.2', '5.1.3', '5.1.4'],
  '5.2': ['5.2.1', '5.2.2', '5.2.3', '5.2.4', '5.2.5'],
  '5.3': ['5.3.1', '5.3.2', '5.3.3', '5.3.4'],
  '5.4': ['5.4.1', '5.4.2', '5.4.3'],
  '5.5': ['5.5.1', '5.5.2', '5.5.3'],
};

/**
 * Derive the standard-level judgement from indicator ratings.
 * Standard judgement = the worst (highest-numbered) indicator within the standard.
 * Falls back to 3 (Satisfactory) when no indicators are rated.
 */
function stdJudgement(standardCode: string, ratings: Record<string, number>): JudgementLevel {
  const codes = STANDARD_INDICATORS[standardCode] ?? [];
  const rated = codes.map((c) => ratings[c]).filter((v): v is number => v !== undefined && v !== null);
  if (!rated.length) return 3;
  return Math.max(...rated) as JudgementLevel;
}

/** Build a TraceStep for one standard, including its worst indicator. */
function stdTrace(
  code: string,
  label: string,
  ratings: Record<string, number>,
  derived: JudgementLevel
): TraceStep {
  const codes = STANDARD_INDICATORS[code] ?? [];
  const worst = codes.reduce<string | null>((acc, c) => {
    if (ratings[c] === undefined) return acc;
    if (acc === null) return c;
    return (ratings[c] ?? 0) > (ratings[acc] ?? 0) ? c : acc;
  }, null);
  const note = worst ? `Worst indicator: ${worst} = ${JUDGEMENT_LABELS_SHORT[ratings[worst] as JudgementLevel]}` : 'No indicators rated';
  return { label: `Standard ${code} — ${label}`, value: derived, note };
}

// ── Domain 1 ──────────────────────────────────────────────────

/**
 * PSD §4.7 — Domain 1: Academic Achievement
 * Primary: 1.1, 1.2 | Supporting: 1.3
 */
export function calculateDomain1Judgement(ratings: Record<string, number>): DomainResult {
  const s11 = stdJudgement('1.1', ratings);
  const s12 = stdJudgement('1.2', ratings);
  const s13 = stdJudgement('1.3', ratings);

  const trace: TraceStep[] = [
    stdTrace('1.1', 'Academic Attainment', ratings, s11),
    stdTrace('1.2', 'Academic Progress', ratings, s12),
    stdTrace('1.3', 'Learning Skills', ratings, s13),
  ];

  const { judgement, trace: ruleTrace } = calcDomain1(s11, s12, s13);

  const maxPrimary = Math.max(s11, s12) as JudgementLevel;
  const limitingStandard = maxPrimary >= s13
    ? (s11 >= s12 ? '1.1' : '1.2')
    : '1.3';

  trace.push({ label: 'Domain 1 judgement rule', value: judgement, note: ruleTrace });
  return { judgement, trace, limitingStandard };
}

// ── Domain 2 ──────────────────────────────────────────────────

/**
 * PSD §4.7 — Domain 2: Personal Development
 * Primary: 2.1, 2.2 | Supporting: 2.3, 2.4
 */
export function calculateDomain2Judgement(ratings: Record<string, number>): DomainResult {
  const s21 = stdJudgement('2.1', ratings);
  const s22 = stdJudgement('2.2', ratings);
  const s23 = stdJudgement('2.3', ratings);
  const s24 = stdJudgement('2.4', ratings);

  const trace: TraceStep[] = [
    stdTrace('2.1', 'Values and Behaviour', ratings, s21),
    stdTrace('2.2', 'Identity and Citizenship', ratings, s22),
    stdTrace('2.3', 'Health and Environmental Awareness', ratings, s23),
    stdTrace('2.4', 'Innovation and Entrepreneurship', ratings, s24),
  ];

  const { judgement, trace: ruleTrace } = calcDomain2(s21, s22, s23, s24);

  const allStds: [string, JudgementLevel][] = [['2.1', s21], ['2.2', s22], ['2.3', s23], ['2.4', s24]];
  const limitingStandard = allStds.reduce((a, b) => b[1] > a[1] ? b : a)[0];

  trace.push({ label: 'Domain 2 judgement rule', value: judgement, note: ruleTrace });
  return { judgement, trace, limitingStandard };
}

// ── Domain 3 ──────────────────────────────────────────────────

/**
 * PSD §4.7 — Domain 3: Teaching and Assessment
 * Primary: 3.1, 3.2, 3.3, 3.5 | Supporting: 3.4
 */
export function calculateDomain3Judgement(ratings: Record<string, number>): DomainResult {
  const s31 = stdJudgement('3.1', ratings);
  const s32 = stdJudgement('3.2', ratings);
  const s33 = stdJudgement('3.3', ratings);
  const s34 = stdJudgement('3.4', ratings);
  const s35 = stdJudgement('3.5', ratings);

  const trace: TraceStep[] = [
    stdTrace('3.1', 'Curriculum Planning', ratings, s31),
    stdTrace('3.2', 'Class Management', ratings, s32),
    stdTrace('3.3', 'Teaching Effectiveness', ratings, s33),
    stdTrace('3.4', 'Developing Learning Skills', ratings, s34),
    stdTrace('3.5', 'Assessment and Progress Support', ratings, s35),
  ];

  const { judgement, trace: ruleTrace } = calcDomain3(s31, s32, s33, s34, s35);

  const allStds: [string, JudgementLevel][] = [['3.1', s31], ['3.2', s32], ['3.3', s33], ['3.4', s34], ['3.5', s35]];
  const limitingStandard = allStds.reduce((a, b) => b[1] > a[1] ? b : a)[0];

  trace.push({ label: 'Domain 3 judgement rule', value: judgement, note: ruleTrace });
  return { judgement, trace, limitingStandard };
}

// ── Domain 4 ──────────────────────────────────────────────────

/**
 * PSD §4.7 — Domain 4: School Climate and Learning Environment
 * Primary: 4.1, 4.2, 4.3 | Supporting: 4.4
 */
export function calculateDomain4Judgement(ratings: Record<string, number>): DomainResult {
  const s41 = stdJudgement('4.1', ratings);
  const s42 = stdJudgement('4.2', ratings);
  const s43 = stdJudgement('4.3', ratings);
  const s44 = stdJudgement('4.4', ratings);

  const trace: TraceStep[] = [
    stdTrace('4.1', 'Quality of the Learning Environment', ratings, s41),
    stdTrace('4.2', "Fostering Students' Talents and Capabilities", ratings, s42),
    stdTrace('4.3', 'Support and Care', ratings, s43),
    stdTrace('4.4', 'Developing Research Skills', ratings, s44),
  ];

  const { judgement, trace: ruleTrace } = calcDomain4(s41, s42, s43, s44);

  const allStds: [string, JudgementLevel][] = [['4.1', s41], ['4.2', s42], ['4.3', s43], ['4.4', s44]];
  const limitingStandard = allStds.reduce((a, b) => b[1] > a[1] ? b : a)[0];

  trace.push({ label: 'Domain 4 judgement rule', value: judgement, note: ruleTrace });
  return { judgement, trace, limitingStandard };
}

// ── Domain 5 ──────────────────────────────────────────────────

/**
 * PSD §4.7 — Domain 5: Leadership, Management and Governance
 * Primary: 5.1, 5.2, 5.3, 5.5 | Supporting: 5.4
 */
export function calculateDomain5Judgement(ratings: Record<string, number>): DomainResult {
  const s51 = stdJudgement('5.1', ratings);
  const s52 = stdJudgement('5.2', ratings);
  const s53 = stdJudgement('5.3', ratings);
  const s54 = stdJudgement('5.4', ratings);
  const s55 = stdJudgement('5.5', ratings);

  const trace: TraceStep[] = [
    stdTrace('5.1', 'Leadership of Change', ratings, s51),
    stdTrace('5.2', 'Leadership of Teaching and Learning', ratings, s52),
    stdTrace('5.3', 'Managerial Competency', ratings, s53),
    stdTrace('5.4', 'Partnership with Parents and the Community', ratings, s54),
    stdTrace('5.5', 'Governance', ratings, s55),
  ];

  const { judgement, trace: ruleTrace } = calcDomain5(s51, s52, s53, s54, s55);

  const allStds: [string, JudgementLevel][] = [['5.1', s51], ['5.2', s52], ['5.3', s53], ['5.4', s54], ['5.5', s55]];
  const limitingStandard = allStds.reduce((a, b) => b[1] > a[1] ? b : a)[0];

  trace.push({ label: 'Domain 5 judgement rule', value: judgement, note: ruleTrace });
  return { judgement, trace, limitingStandard };
}

// ── Overall ───────────────────────────────────────────────────

/**
 * PSD §4.8 — Overall School Performance Judgement.
 * domainResults must be ordered [D1, D2, D3, D4, D5].
 * High-weight: D1, D3, D5 | Medium-weight: D2, D4
 */
export function calculateOverallJudgement(domainResults: DomainResult[]): OverallResult {
  const [r1, r2, r3, r4, r5] = domainResults;
  const d1 = r1?.judgement ?? 3;
  const d2 = r2?.judgement ?? 3;
  const d3 = r3?.judgement ?? 3;
  const d4 = r4?.judgement ?? 3;
  const d5 = r5?.judgement ?? 3;

  const trace: TraceStep[] = [
    { label: 'Domain 1 — Academic Achievement',                  value: d1 as JudgementLevel },
    { label: 'Domain 2 — Personal Development',                  value: d2 as JudgementLevel },
    { label: 'Domain 3 — Teaching and Assessment',               value: d3 as JudgementLevel },
    { label: 'Domain 4 — School Climate',                        value: d4 as JudgementLevel },
    { label: 'Domain 5 — Leadership, Management and Governance', value: d5 as JudgementLevel },
  ];

  const { judgement, trace: ruleTrace } = calcOverallJudgement(
    d1 as JudgementLevel,
    d2 as JudgementLevel,
    d3 as JudgementLevel,
    d4 as JudgementLevel,
    d5 as JudgementLevel,
  );

  trace.push({ label: 'Overall judgement rule', value: judgement, note: ruleTrace });
  return { judgement, trace };
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
