// judgement.test.ts — Vitest suite for OAAAQA judgement engine
// Covers PSD §4.7 (domain rules) and §4.8 (overall) via the calculate* API.
// Each domain has ≥3 cases: all-Outstanding, NUI trigger, and mixed/edge.

import { describe, it, expect } from 'vitest';
import {
  calculateDomain1Judgement,
  calculateDomain2Judgement,
  calculateDomain3Judgement,
  calculateDomain4Judgement,
  calculateDomain5Judgement,
  calculateOverallJudgement,
  calcDomain1,
  calcOverallJudgement,
  proficiencyRateToJudgement,
  cohortProgressDescription,
  nationalComparisonLabel,
  type DomainResult,
} from './judgement';

// ─── helpers ─────────────────────────────────────────────────
/** Set all listed indicator codes to a single value. */
function r(codes: readonly string[], value: number): Record<string, number> {
  return Object.fromEntries(codes.map((c) => [c, value]));
}

/** Merge multiple partial ratings objects. */
function merge(...parts: Record<string, number>[]): Record<string, number> {
  return Object.assign({}, ...parts);
}

// Indicator code lists per standard (mirrors STANDARD_INDICATORS in judgement.ts)
const IND = {
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
} as const;

// ─────────────────────────────────────────────────────────────
// Domain 1 — Academic Achievement
// Primary: 1.1, 1.2 | Supporting: 1.3
// ─────────────────────────────────────────────────────────────
describe('Domain 1: Academic Achievement', () => {
  it('all Outstanding → Outstanding', () => {
    const ratings = merge(r(IND['1.1'], 1), r(IND['1.2'], 1), r(IND['1.3'], 1));
    expect(calculateDomain1Judgement(ratings).judgement).toBe(1);
  });

  it('one primary standard NUI → Domain NUI', () => {
    // Standard 1.1 has a NUI indicator; 1.2 and 1.3 are fine
    const ratings = merge(
      r(IND['1.1'], 5),
      r(IND['1.2'], 2),
      r(IND['1.3'], 2),
    );
    expect(calculateDomain1Judgement(ratings).judgement).toBe(5);
  });

  it('supporting standard NUI → Unsatisfactory (not NUI)', () => {
    // PSD: 1.3=NUI triggers Unsatisfactory, not NUI, since NUI requires primary to be NUI
    const ratings = merge(
      r(IND['1.1'], 2),
      r(IND['1.2'], 2),
      r(IND['1.3'], 5),
    );
    expect(calculateDomain1Judgement(ratings).judgement).toBe(4);
  });

  it('primary Good, supporting Satisfactory → Good', () => {
    // std 1.1=2, std 1.2=2, std 1.3=3 → max primary=2, s13=3≤3 → Good
    const ratings = merge(
      r(IND['1.1'], 2),
      r(IND['1.2'], 2),
      r(IND['1.3'], 3),
    );
    expect(calculateDomain1Judgement(ratings).judgement).toBe(2);
  });

  it('primary Satisfactory, supporting Unsatisfactory → Satisfactory', () => {
    // std 1.1=3, std 1.2=3, std 1.3=4 → max primary=3, s13=4≤4 → Satisfactory
    const ratings = merge(
      r(IND['1.1'], 3),
      r(IND['1.2'], 3),
      r(IND['1.3'], 4),
    );
    expect(calculateDomain1Judgement(ratings).judgement).toBe(3);
  });

  it('primary Good but supporting Unsatisfactory → Satisfactory (supporting limits)', () => {
    // max primary=2 but s13=4>3, so Good check fails → falls to Satisfactory
    const ratings = merge(
      r(IND['1.1'], 2),
      r(IND['1.2'], 2),
      r(IND['1.3'], 4),
    );
    expect(calculateDomain1Judgement(ratings).judgement).toBe(3);
  });

  it('both primaries Outstanding but supporting Good → Outstanding', () => {
    // s11=1, s12=1, s13=2 → Outstanding
    const ratings = merge(
      r(IND['1.1'], 1),
      r(IND['1.2'], 1),
      r(IND['1.3'], 2),
    );
    expect(calculateDomain1Judgement(ratings).judgement).toBe(1);
  });

  it('one primary Unsatisfactory → Unsatisfactory', () => {
    const ratings = merge(
      r(IND['1.1'], 4),
      r(IND['1.2'], 2),
      r(IND['1.3'], 2),
    );
    expect(calculateDomain1Judgement(ratings).judgement).toBe(4);
  });

  it('trace contains a step for every standard', () => {
    const ratings = merge(r(IND['1.1'], 1), r(IND['1.2'], 1), r(IND['1.3'], 1));
    const { trace } = calculateDomain1Judgement(ratings);
    const labels = trace.map((s) => s.label);
    expect(labels.some((l) => l.includes('1.1'))).toBe(true);
    expect(labels.some((l) => l.includes('1.2'))).toBe(true);
    expect(labels.some((l) => l.includes('1.3'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Domain 2 — Personal Development
// Primary: 2.1, 2.2 | Supporting: 2.3, 2.4
// ─────────────────────────────────────────────────────────────
describe('Domain 2: Personal Development', () => {
  it('all Outstanding → Outstanding', () => {
    const ratings = merge(
      r(IND['2.1'], 1), r(IND['2.2'], 1),
      r(IND['2.3'], 1), r(IND['2.4'], 1),
    );
    expect(calculateDomain2Judgement(ratings).judgement).toBe(1);
  });

  it('primary standard 2.2 NUI → Domain NUI', () => {
    const ratings = merge(
      r(IND['2.1'], 1), r(IND['2.2'], 5),
      r(IND['2.3'], 2), r(IND['2.4'], 2),
    );
    expect(calculateDomain2Judgement(ratings).judgement).toBe(5);
  });

  it('supporting standard 2.4 NUI → Unsatisfactory', () => {
    const ratings = merge(
      r(IND['2.1'], 2), r(IND['2.2'], 2),
      r(IND['2.3'], 2), r(IND['2.4'], 5),
    );
    expect(calculateDomain2Judgement(ratings).judgement).toBe(4);
  });

  it('primaries Outstanding, supporting Good → Outstanding', () => {
    // max primary=1, max supporting=2 ≤ 2 → Outstanding
    const ratings = merge(
      r(IND['2.1'], 1), r(IND['2.2'], 1),
      r(IND['2.3'], 2), r(IND['2.4'], 2),
    );
    expect(calculateDomain2Judgement(ratings).judgement).toBe(1);
  });

  it('primaries Outstanding but supporting Satisfactory → Good', () => {
    // max primary=1 ≤ 2, max supporting=3 ≤ 3 → Good (Outstanding blocked by supporting)
    const ratings = merge(
      r(IND['2.1'], 1), r(IND['2.2'], 1),
      r(IND['2.3'], 3), r(IND['2.4'], 2),
    );
    expect(calculateDomain2Judgement(ratings).judgement).toBe(2);
  });

  it('primaries Satisfactory, supporting Unsatisfactory → Satisfactory', () => {
    const ratings = merge(
      r(IND['2.1'], 3), r(IND['2.2'], 3),
      r(IND['2.3'], 4), r(IND['2.4'], 4),
    );
    expect(calculateDomain2Judgement(ratings).judgement).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────
// Domain 3 — Teaching and Assessment
// Primary: 3.1, 3.2, 3.3, 3.5 | Supporting: 3.4
// ─────────────────────────────────────────────────────────────
describe('Domain 3: Teaching and Assessment', () => {
  it('all Outstanding → Outstanding', () => {
    const ratings = merge(
      r(IND['3.1'], 1), r(IND['3.2'], 1), r(IND['3.3'], 1),
      r(IND['3.4'], 1), r(IND['3.5'], 1),
    );
    expect(calculateDomain3Judgement(ratings).judgement).toBe(1);
  });

  it('primary 3.3 NUI → Domain NUI', () => {
    const ratings = merge(
      r(IND['3.1'], 2), r(IND['3.2'], 2), r(IND['3.3'], 5),
      r(IND['3.4'], 2), r(IND['3.5'], 2),
    );
    expect(calculateDomain3Judgement(ratings).judgement).toBe(5);
  });

  it('supporting 3.4 NUI → Unsatisfactory', () => {
    const ratings = merge(
      r(IND['3.1'], 2), r(IND['3.2'], 2), r(IND['3.3'], 2),
      r(IND['3.4'], 5), r(IND['3.5'], 2),
    );
    expect(calculateDomain3Judgement(ratings).judgement).toBe(4);
  });

  it('all primaries Good, supporting Satisfactory → Good', () => {
    // max primary=2, s34=3 ≤ 3 → Good
    const ratings = merge(
      r(IND['3.1'], 2), r(IND['3.2'], 2), r(IND['3.3'], 2),
      r(IND['3.4'], 3), r(IND['3.5'], 2),
    );
    expect(calculateDomain3Judgement(ratings).judgement).toBe(2);
  });

  it('one primary Unsatisfactory (3.5) → Unsatisfactory', () => {
    const ratings = merge(
      r(IND['3.1'], 2), r(IND['3.2'], 2), r(IND['3.3'], 2),
      r(IND['3.4'], 2), r(IND['3.5'], 4),
    );
    expect(calculateDomain3Judgement(ratings).judgement).toBe(4);
  });

  it('all primaries Satisfactory, supporting Outstanding → Satisfactory', () => {
    // max primary=3, s34=1 ≤ 4 → Satisfactory
    const ratings = merge(
      r(IND['3.1'], 3), r(IND['3.2'], 3), r(IND['3.3'], 3),
      r(IND['3.4'], 1), r(IND['3.5'], 3),
    );
    expect(calculateDomain3Judgement(ratings).judgement).toBe(3);
  });

  it('all primaries Outstanding, supporting Good → Outstanding', () => {
    const ratings = merge(
      r(IND['3.1'], 1), r(IND['3.2'], 1), r(IND['3.3'], 1),
      r(IND['3.4'], 2), r(IND['3.5'], 1),
    );
    expect(calculateDomain3Judgement(ratings).judgement).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// Domain 4 — School Climate and Learning Environment
// Primary: 4.1, 4.2, 4.3 | Supporting: 4.4
// ─────────────────────────────────────────────────────────────
describe('Domain 4: School Climate and Learning Environment', () => {
  it('all Outstanding → Outstanding', () => {
    const ratings = merge(
      r(IND['4.1'], 1), r(IND['4.2'], 1),
      r(IND['4.3'], 1), r(IND['4.4'], 1),
    );
    expect(calculateDomain4Judgement(ratings).judgement).toBe(1);
  });

  it('primary 4.2 NUI → Domain NUI', () => {
    const ratings = merge(
      r(IND['4.1'], 2), r(IND['4.2'], 5),
      r(IND['4.3'], 2), r(IND['4.4'], 2),
    );
    expect(calculateDomain4Judgement(ratings).judgement).toBe(5);
  });

  it('supporting 4.4 NUI → Unsatisfactory', () => {
    const ratings = merge(
      r(IND['4.1'], 1), r(IND['4.2'], 1),
      r(IND['4.3'], 1), r(IND['4.4'], 5),
    );
    expect(calculateDomain4Judgement(ratings).judgement).toBe(4);
  });

  it('primaries mix of Outstanding and Good, supporting Satisfactory → Good', () => {
    // max primary=2, s44=3 ≤ 3 → Good
    const ratings = merge(
      r(IND['4.1'], 1), r(IND['4.2'], 2),
      r(IND['4.3'], 2), r(IND['4.4'], 3),
    );
    expect(calculateDomain4Judgement(ratings).judgement).toBe(2);
  });

  it('primaries Outstanding, supporting Satisfactory → Good (supporting limits)', () => {
    // max primary=1 ≤ 2, s44=3 ≤ 3 → Good (Outstanding blocked by supporting)
    const ratings = merge(
      r(IND['4.1'], 1), r(IND['4.2'], 1),
      r(IND['4.3'], 1), r(IND['4.4'], 3),
    );
    expect(calculateDomain4Judgement(ratings).judgement).toBe(2);
  });

  it('one primary Unsatisfactory → Unsatisfactory', () => {
    const ratings = merge(
      r(IND['4.1'], 4), r(IND['4.2'], 2),
      r(IND['4.3'], 2), r(IND['4.4'], 2),
    );
    expect(calculateDomain4Judgement(ratings).judgement).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────
// Domain 5 — Leadership, Management and Governance
// Primary: 5.1, 5.2, 5.3, 5.5 | Supporting: 5.4
// ─────────────────────────────────────────────────────────────
describe('Domain 5: Leadership, Management and Governance', () => {
  it('all Outstanding → Outstanding', () => {
    const ratings = merge(
      r(IND['5.1'], 1), r(IND['5.2'], 1), r(IND['5.3'], 1),
      r(IND['5.4'], 1), r(IND['5.5'], 1),
    );
    expect(calculateDomain5Judgement(ratings).judgement).toBe(1);
  });

  it('primary 5.5 NUI → Domain NUI', () => {
    const ratings = merge(
      r(IND['5.1'], 2), r(IND['5.2'], 2), r(IND['5.3'], 2),
      r(IND['5.4'], 2), r(IND['5.5'], 5),
    );
    expect(calculateDomain5Judgement(ratings).judgement).toBe(5);
  });

  it('supporting 5.4 NUI → Unsatisfactory', () => {
    const ratings = merge(
      r(IND['5.1'], 2), r(IND['5.2'], 2), r(IND['5.3'], 2),
      r(IND['5.4'], 5), r(IND['5.5'], 2),
    );
    expect(calculateDomain5Judgement(ratings).judgement).toBe(4);
  });

  it('all primaries Good, supporting Satisfactory → Good', () => {
    const ratings = merge(
      r(IND['5.1'], 2), r(IND['5.2'], 2), r(IND['5.3'], 2),
      r(IND['5.4'], 3), r(IND['5.5'], 2),
    );
    expect(calculateDomain5Judgement(ratings).judgement).toBe(2);
  });

  it('all primaries Satisfactory, supporting Good → Satisfactory', () => {
    // max primary=3, s54=2 ≤ 4 → Satisfactory
    const ratings = merge(
      r(IND['5.1'], 3), r(IND['5.2'], 3), r(IND['5.3'], 3),
      r(IND['5.4'], 2), r(IND['5.5'], 3),
    );
    expect(calculateDomain5Judgement(ratings).judgement).toBe(3);
  });

  it('primary 5.1 Unsatisfactory → Unsatisfactory', () => {
    const ratings = merge(
      r(IND['5.1'], 4), r(IND['5.2'], 2), r(IND['5.3'], 2),
      r(IND['5.4'], 2), r(IND['5.5'], 2),
    );
    expect(calculateDomain5Judgement(ratings).judgement).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────
// Overall School Judgement (PSD §4.8)
// High-weight: D1, D3, D5 | Medium-weight: D2, D4
// ─────────────────────────────────────────────────────────────
describe('Overall School Judgement', () => {
  /** Helper: build 5 DomainResults with fixed judgements */
  function domains(d1: number, d2: number, d3: number, d4: number, d5: number): DomainResult[] {
    return [d1, d2, d3, d4, d5].map((j) => ({
      judgement: j as 1 | 2 | 3 | 4 | 5,
      trace: [],
    }));
  }

  it('all domains Outstanding → Outstanding', () => {
    expect(calculateOverallJudgement(domains(1, 1, 1, 1, 1)).judgement).toBe(1);
  });

  it('high-weight domain (D3) NUI → Overall NUI', () => {
    expect(calculateOverallJudgement(domains(1, 1, 5, 1, 1)).judgement).toBe(5);
  });

  it('high-weight domain (D1) NUI → Overall NUI', () => {
    expect(calculateOverallJudgement(domains(5, 1, 1, 1, 1)).judgement).toBe(5);
  });

  it('medium-weight domain (D2) NUI → Unsatisfactory (not NUI)', () => {
    // NUI in D2 or D4 → Unsatisfactory per PSD Table 4
    expect(calculateOverallJudgement(domains(2, 5, 2, 2, 2)).judgement).toBe(4);
  });

  it('high-weight D5 Unsatisfactory → Overall Unsatisfactory', () => {
    expect(calculateOverallJudgement(domains(2, 2, 2, 2, 4)).judgement).toBe(4);
  });

  it('all high-weight Good, medium Satisfactory → Good', () => {
    // max(D1,D3,D5)=2, max(D2,D4)=3 → Good
    expect(calculateOverallJudgement(domains(2, 3, 2, 3, 2)).judgement).toBe(2);
  });

  it('all high-weight Outstanding, medium Good → Outstanding', () => {
    // D1=D3=D5=1, D2=D4=2 → Outstanding
    expect(calculateOverallJudgement(domains(1, 2, 1, 2, 1)).judgement).toBe(1);
  });

  it('high-weight Satisfactory, medium Unsatisfactory → Satisfactory', () => {
    // max high=3, max medium=4 → Satisfactory
    expect(calculateOverallJudgement(domains(3, 4, 3, 4, 3)).judgement).toBe(3);
  });

  it('mixed: D1=Good, D3=Satisfactory → Satisfactory (worst high-weight drives it)', () => {
    // max(D1,D3,D5)=3, max(D2,D4)=3 → Satisfactory
    expect(calculateOverallJudgement(domains(2, 3, 3, 3, 2)).judgement).toBe(3);
  });

  it('overall trace contains a step for each domain', () => {
    const result = calculateOverallJudgement(domains(1, 1, 1, 1, 1));
    const labels = result.trace.map((s) => s.label);
    expect(labels.some((l) => l.includes('Domain 1'))).toBe(true);
    expect(labels.some((l) => l.includes('Domain 3'))).toBe(true);
    expect(labels.some((l) => l.includes('Domain 5'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// OAAAQA Guide — Exact scenario checks (PSD §8.11 and §10)
// ─────────────────────────────────────────────────────────────

describe('OAAAQA Guide: Domain 1 standard-level scenarios', () => {
  it('1.1=Outstanding, 1.2=Outstanding, 1.3=Good → Outstanding', () => {
    const { judgement } = calcDomain1(1, 1, 2);
    expect(judgement).toBe(1);
  });

  it('1.1=Good, 1.2=Good, 1.3=Satisfactory → Good', () => {
    const { judgement } = calcDomain1(2, 2, 3);
    expect(judgement).toBe(2);
  });

  it('1.1=NUI, 1.2=Good → NUI', () => {
    const { judgement } = calcDomain1(5, 2, 2);
    expect(judgement).toBe(5);
  });
});

describe('OAAAQA Guide: Overall judgement scenarios', () => {
  it('D1=Outstanding, D2=Good, D3=Outstanding, D4=Good, D5=Outstanding → Outstanding', () => {
    const { judgement } = calcOverallJudgement(1, 2, 1, 2, 1);
    expect(judgement).toBe(1);
  });

  it('D1=Good, D3=Satisfactory, D5=Good (D2=Good, D4=Good) → Satisfactory', () => {
    // maxHigh = max(2,3,2) = 3 → Satisfactory band; maxMedium=2 ≤ 4 → Satisfactory
    const { judgement } = calcOverallJudgement(2, 2, 3, 2, 2);
    expect(judgement).toBe(3);
  });
});

describe('OAAAQA Guide: Proficiency rate table (PSD Table 8)', () => {
  it('72% → Outstanding (1)', () => {
    expect(proficiencyRateToJudgement(72)).toBe(1);
  });

  it('65% → Good (2)', () => {
    expect(proficiencyRateToJudgement(65)).toBe(2);
  });

  it('38% → NUI (5)', () => {
    expect(proficiencyRateToJudgement(38)).toBe(5);
  });
});

describe('OAAAQA Guide: Cohort progress description (PSD Table 9)', () => {
  it('+18pp → Strong Progress', () => {
    expect(cohortProgressDescription(18).label).toBe('Strong Progress');
  });

  it('-3pp → Stable', () => {
    expect(cohortProgressDescription(-3).label).toBe('Stable');
  });

  it('-16pp → Sharp Drop', () => {
    expect(cohortProgressDescription(-16).label).toBe('Sharp Drop');
  });
});

describe('OAAAQA Guide: National comparison label (PSD Table 7)', () => {
  it('delta +2.0 → Significantly above national', () => {
    expect(nationalComparisonLabel(2.0).label).toBe('Significantly above national');
  });

  it('delta -0.3 → Slightly below national', () => {
    expect(nationalComparisonLabel(-0.3).label).toBe('Slightly below national');
  });
});
