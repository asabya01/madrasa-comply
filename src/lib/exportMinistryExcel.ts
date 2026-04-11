import * as XLSX from 'xlsx';
import type { SupabaseClient } from '@supabase/supabase-js';
import { proficiencyRateToJudgement } from './judgement';

// ─── Constants ────────────────────────────────────────────────

const GRADES = [
  'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8',
  'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12',
];

const GRADE_AR: Record<string, string> = {
  'Grade 5': 'الصف الخامس', 'Grade 6': 'الصف السادس',
  'Grade 7': 'الصف السابع', 'Grade 8': 'الصف الثامن',
  'Grade 9': 'الصف التاسع', 'Grade 10': 'الصف العاشر',
  'Grade 11': 'الصف الحادي عشر', 'Grade 12': 'الصف الثاني عشر',
};

const SUBJECTS_EN = [
  'Islamic Education', 'Arabic Language', 'English Language',
  'Mathematics', 'Science', 'Social Studies',
] as const;

const SUBJECT_AR: Record<string, string> = {
  'Islamic Education': 'التربية الإسلامية',
  'Arabic Language':   'اللغة العربية',
  'English Language':  'اللغة الإنجليزية',
  'Mathematics':       'الرياضيات',
  'Science':           'مواد العلوم',
  'Social Studies':    'مواد الدراسات الاجتماعية',
};

const JUDGEMENT_AR: Record<number, string> = {
  5: 'مجتهد',
  4: 'جيد',
  3: 'مقبول',
  2: 'دون المستوى',
  1: 'يحتاج تدخلاً عاجلاً',
};

// Fill colors for judgements (xlsx ARGB format)
const JUDGEMENT_COLOR: Record<number, string> = {
  5: 'FF00B050', // green
  4: 'FF92D050', // light green
  3: 'FFFFFF00', // yellow
  2: 'FFFF9900', // orange
  1: 'FFFF0000', // red
};

const HEADER_FILL = '1F4E79';  // dark blue
const HEADER_FONT_COLOR = 'FFFFFFFF';

// ─── Cell builder helpers ─────────────────────────────────────

function cell(v: string | number | null, bold = false, fill?: string, fontColor?: string): XLSX.CellObject {
  const c: XLSX.CellObject = {
    t: v == null ? 's' : typeof v === 'number' ? 'n' : 's',
    v: v ?? '',
  };
  const s: Record<string, unknown> = {};
  if (bold || fill || fontColor) {
    if (fill) s['fill'] = { fgColor: { rgb: fill }, patternType: 'solid' };
    if (bold || fontColor) s['font'] = { bold: bold || false, color: { rgb: fontColor ?? '000000' } };
    s['alignment'] = { horizontal: 'center', vertical: 'center', wrapText: true };
    c.s = s;
  }
  return c;
}

function hdr(v: string): XLSX.CellObject {
  return cell(v, true, HEADER_FILL, HEADER_FONT_COLOR);
}

function judgeCell(rate: number | null): XLSX.CellObject {
  if (rate == null) return cell('');
  const level = proficiencyRateToJudgement(rate);
  return cell(JUDGEMENT_AR[level], false, JUDGEMENT_COLOR[level]);
}

function rateCell(rate: number | null): XLSX.CellObject {
  if (rate == null) return cell('');
  return cell(Math.round(rate * 10) / 10);
}

// ─── Types ────────────────────────────────────────────────────

interface PerfRow {
  grade_label: string;
  subject: string;
  semester: string;
  total_students: number | null;
  students_at_75: number | null;
  proficiency_rate: number | null;
}

type YearData = Map<string, Map<string, PerfRow>>; // grade → subject → row

// ─── Data fetcher ─────────────────────────────────────────────

async function fetchYearData(
  schoolId: string,
  yearLabel: string,
  semester: string,
  supabaseClient: SupabaseClient,
): Promise<YearData> {
  const { data } = await supabaseClient
    .from('student_performance')
    .select('grade_label, subject, semester, total_students, students_at_75, proficiency_rate')
    .eq('school_id', schoolId)
    .eq('academic_year', yearLabel)
    .eq('semester', semester);

  const map: YearData = new Map();
  for (const row of (data ?? []) as PerfRow[]) {
    if (!map.has(row.grade_label)) map.set(row.grade_label, new Map());
    map.get(row.grade_label)!.set(row.subject, row);
  }
  return map;
}

// ─── Proficiency rate calc helper ─────────────────────────────

function getRate(yearData: YearData, grade: string, subject: string): number | null {
  const row = yearData.get(grade)?.get(subject);
  if (!row) return null;
  if (row.proficiency_rate != null) return row.proficiency_rate;
  if (row.total_students && row.students_at_75)
    return Math.round((row.students_at_75 / row.total_students) * 10000) / 100;
  return null;
}

function getTotal(yearData: YearData, grade: string, subject: string): number | null {
  return yearData.get(grade)?.get(subject)?.total_students ?? null;
}

function getAt75(yearData: YearData, grade: string, subject: string): number | null {
  return yearData.get(grade)?.get(subject)?.students_at_75 ?? null;
}

// ─── Sheet builder: نسب الإتقان ───────────────────────────────

function buildMasterySheet(
  schoolNameAr: string,
  yearLabel: string,
  yearData: YearData,
): XLSX.WorkSheet {
  const rows: XLSX.CellObject[][] = [];

  // Row 1: school + year
  rows.push([hdr(schoolNameAr), cell(''), hdr(yearLabel)]);

  // Row 2: title
  rows.push([hdr('جدول نسب إتقان الطلبة *')]);

  // Row 3: column headers
  const headerRow = [
    hdr('الصف'), hdr('الفئة'),
    ...SUBJECTS_EN.map((s) => hdr(SUBJECT_AR[s])),
    hdr('الحكم العام'),
  ];
  rows.push(headerRow);

  const subjectCount = SUBJECTS_EN.length;
  let allTotal = 0, allAt75 = 0;

  for (const grade of GRADES) {
    const gradeAr = GRADE_AR[grade] ?? grade;
    let gradeTotal = 0, gradeAt75 = 0;

    // Row A: total students
    const rowA: XLSX.CellObject[] = [
      cell(gradeAr, true),
      cell('المجموع الكلي للطلبة في الصف'),
    ];
    // Row B: students ≥75
    const rowB: XLSX.CellObject[] = [cell(''), cell('75 فأعلى / العدد')];
    // Row C: rate
    const rowC: XLSX.CellObject[] = [cell(''), cell('النسبة')];
    // Row D: judgement
    const rowD: XLSX.CellObject[] = [cell(''), cell('الحكم')];

    for (const subj of SUBJECTS_EN) {
      const total = getTotal(yearData, grade, subj);
      const at75  = getAt75(yearData, grade, subj);
      const rate  = getRate(yearData, grade, subj);
      rowA.push(cell(total));
      rowB.push(cell(at75));
      rowC.push(rateCell(rate));
      rowD.push(judgeCell(rate));

      if (total) gradeTotal += total;
      if (at75)  gradeAt75  += at75;
    }

    // Grade overall judgement
    const gradeRate = gradeTotal > 0 ? Math.round((gradeAt75 / gradeTotal) * 10000) / 100 : null;
    rowA.push(cell(gradeTotal || null));
    rowB.push(cell(gradeAt75  || null));
    rowC.push(rateCell(gradeRate));
    rowD.push(judgeCell(gradeRate));

    rows.push(rowA, rowB, rowC, rowD);
    allTotal += gradeTotal;
    allAt75  += gradeAt75;
  }

  // School-wide totals
  const schoolRate = allTotal > 0 ? Math.round((allAt75 / allTotal) * 10000) / 100 : null;
  const level = schoolRate != null ? proficiencyRateToJudgement(schoolRate) : null;

  // Spacer
  rows.push(Array(subjectCount + 3).fill(cell('')));

  // جميع الصفوف
  const totRow = [cell('جميع الصفوف', true), cell('المجموع')];
  for (let i = 0; i < subjectCount + 1; i++) totRow.push(cell(''));
  rows.push(totRow);

  // نسبة الإتقان العامة
  const rateRow = [cell('نسبة الإتقان العامة للمدرسة', true), rateCell(schoolRate)];
  for (let i = 0; i < subjectCount + 1; i++) rateRow.push(cell(''));
  rows.push(rateRow);

  // الحكم العام
  const judgRow = [
    cell('الحكم على نسبة الإتقان العامة', true),
    level != null ? judgeCell(schoolRate) : cell(''),
  ];
  for (let i = 0; i < subjectCount + 1; i++) judgRow.push(cell(''));
  rows.push(judgRow);

  // Footer
  rows.push([cell('')]);
  rows.push([cell('إصدار ديسمبر 2025م', false)]);

  const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((c) => c.v)));
  // Attach cell objects with styles
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1:A1');
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (rows[R]?.[C]) ws[addr] = rows[R][C];
    }
  }

  ws['!dir'] = 'rtl';
  ws['!cols'] = [
    { wch: 22 }, { wch: 30 },
    ...SUBJECTS_EN.map(() => ({ wch: 16 })),
    { wch: 16 },
  ];

  return ws;
}

// ─── Sheet builder: ملخص نسب الإتقان ─────────────────────────

function buildSummarySheet(
  yearLabel: string,
  yearData: YearData,
): XLSX.WorkSheet {
  const rows: XLSX.CellObject[][] = [];

  // Header row: subject | G5 rate | G5 judgement | G6 rate | ...
  const hdrRow: XLSX.CellObject[] = [hdr(`ملخص ${yearLabel}`)];
  for (const grade of GRADES) {
    hdrRow.push(hdr(`${GRADE_AR[grade] ?? grade} - النسبة`));
    hdrRow.push(hdr(`${GRADE_AR[grade] ?? grade} - الحكم`));
  }
  rows.push(hdrRow);

  for (const subj of SUBJECTS_EN) {
    const row: XLSX.CellObject[] = [cell(SUBJECT_AR[subj], true)];
    for (const grade of GRADES) {
      const rate = getRate(yearData, grade, subj);
      row.push(rateCell(rate));
      row.push(judgeCell(rate));
    }
    rows.push(row);
  }

  // الحكم العام per grade
  const judgRow: XLSX.CellObject[] = [cell('الحكم العام', true)];
  for (const grade of GRADES) {
    let total = 0, at75 = 0;
    for (const subj of SUBJECTS_EN) {
      total += getTotal(yearData, grade, subj) ?? 0;
      at75  += getAt75(yearData, grade, subj)  ?? 0;
    }
    const rate = total > 0 ? Math.round((at75 / total) * 10000) / 100 : null;
    judgRow.push(rateCell(rate));
    judgRow.push(judgeCell(rate));
  }
  rows.push(judgRow);

  const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((c) => c.v)));
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1:A1');
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (rows[R]?.[C]) ws[addr] = rows[R][C];
    }
  }

  ws['!dir'] = 'rtl';
  ws['!cols'] = [
    { wch: 28 },
    ...GRADES.flatMap(() => [{ wch: 12 }, { wch: 18 }]),
  ];

  return ws;
}

// ─── Sheet builder: نتائج تتبع الفوج ─────────────────────────

function buildCohortSheet(
  yearLabels: string[],
  yearDataMap: Map<string, YearData>,
): XLSX.WorkSheet {
  const rows: XLSX.CellObject[][] = [];

  // Header
  const hdrRow: XLSX.CellObject[] = [
    hdr('الصف'), hdr('المادة'),
    ...yearLabels.map((y) => hdr(y)),
    hdr('المتوسط'), hdr('مدى الاستقرار'),
  ];
  rows.push(hdrRow);

  for (const grade of GRADES) {
    for (const subj of SUBJECTS_EN) {
      const rates = yearLabels.map((yl) => getRate(yearDataMap.get(yl) ?? new Map(), grade, subj));
      const validRates = rates.filter((r): r is number => r != null);
      const avg = validRates.length ? Math.round((validRates.reduce((a, b) => a + b, 0) / validRates.length) * 10) / 10 : null;
      const stability = validRates.length > 1
        ? Math.round((Math.max(...validRates) - Math.min(...validRates)) * 10) / 10
        : null;

      const row: XLSX.CellObject[] = [
        cell(GRADE_AR[grade] ?? grade),
        cell(SUBJECT_AR[subj]),
        ...rates.map((r) => rateCell(r)),
        rateCell(avg),
        cell(stability != null ? `±${stability}%` : ''),
      ];
      rows.push(row);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((c) => c.v)));
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1:A1');
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (rows[R]?.[C]) ws[addr] = rows[R][C];
    }
  }

  ws['!dir'] = 'rtl';
  ws['!cols'] = [
    { wch: 22 }, { wch: 26 },
    ...yearLabels.map(() => ({ wch: 14 })),
    { wch: 12 }, { wch: 16 },
  ];

  return ws;
}

// ─── Main export function ─────────────────────────────────────

export async function exportMinistryMasteryExcel(
  schoolId: string,
  schoolNameAr: string,
  academicYears: { id: string; label: string }[],
  semester: string,
  supabaseClient: SupabaseClient,
): Promise<Blob> {
  // Fetch data for all 3 years in parallel
  const yearDataMap = new Map<string, YearData>();
  await Promise.all(
    academicYears.map(async ({ label }) => {
      const data = await fetchYearData(schoolId, label, semester, supabaseClient);
      yearDataMap.set(label, data);
    }),
  );

  const wb = XLSX.utils.book_new();

  // 3 pairs of (mastery + summary) sheets
  for (const { label } of academicYears) {
    const yd = yearDataMap.get(label) ?? new Map();
    XLSX.utils.book_append_sheet(wb, buildMasterySheet(schoolNameAr, label, yd), `نسب الإتقان ${label}`);
    XLSX.utils.book_append_sheet(wb, buildSummarySheet(label, yd),              `ملخص نسب الإتقان ${label}`);
  }

  // Cohort tracking sheet
  const yearLabels = academicYears.map((y) => y.label);
  XLSX.utils.book_append_sheet(wb, buildCohortSheet(yearLabels, yearDataMap), 'نتائج تتبع الفوج');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
