import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Dot,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import {
  proficiencyRateToJudgement,
  cohortProgressDescription,
  JUDGEMENT_COLORS,
  JUDGEMENT_LABELS_SHORT,
} from '../lib/judgement';
import { JudgementBadge } from './ui/judgement-badge';

// ─── Constants ────────────────────────────────────────────────

const SUBJECTS = [
  'Islamic Education',
  'Arabic Language',
  'English Language',
  'Mathematics',
  'Science',
  'Social Studies',
] as const;
type Subject = typeof SUBJECTS[number];

// ─── Types ────────────────────────────────────────────────────

interface PerfRow {
  academic_year: string;
  subject: string;
  total_students: number | null;
  students_at_75: number | null;
  proficiency_rate: number | null;
}

interface AcademicYear {
  id: string;
  label: string;
  start_date: string;
}

// ─── Helpers ─────────────────────────────────────────────────

function calcRate(row: PerfRow): number | null {
  if (row.proficiency_rate != null) return row.proficiency_rate;
  if (row.total_students && row.students_at_75)
    return Math.round((row.students_at_75 / row.total_students) * 10000) / 100;
  return null;
}

function fmt(n: number | null): string {
  return n == null ? '—' : `${n.toFixed(1)}%`;
}

// ─── Custom dot showing judgement colour ─────────────────────

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: { rate: number | null };
}

function JudgementDot({ cx = 0, cy = 0, payload }: DotProps) {
  if (payload?.rate == null) return null;
  const level = proficiencyRateToJudgement(payload.rate);
  return <circle cx={cx} cy={cy} r={5} fill={JUDGEMENT_COLORS[level]} stroke="white" strokeWidth={2} />;
}

// ─── Single subject card ──────────────────────────────────────

function SubjectTrendCard({ subject, yearLabels, yearData }: {
  subject: Subject;
  yearLabels: string[];
  yearData: Map<string, Map<Subject, number | null>>;
}) {
  const chartData = yearLabels.map((label) => ({
    year: label,
    rate: yearData.get(label)?.get(subject) ?? null,
  }));

  const validRates = chartData.map((d) => d.rate).filter((r): r is number => r != null);
  const earliest = validRates[0] ?? null;
  const latest   = validRates[validRates.length - 1] ?? null;
  const change   = earliest != null && latest != null ? latest - earliest : null;
  const badge    = change != null ? cohortProgressDescription(change) : null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{subject}</h3>
        {badge && (
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${badge.colour}18`, color: badge.colour, border: `1px solid ${badge.colour}40` }}
          >
            {badge.label}
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="year"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}%`}
            width={38}
          />
          <Tooltip
            formatter={(value: number | null) => [value != null ? `${value.toFixed(1)}%` : '—', subject]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
          <ReferenceLine y={70} stroke="#6b7280" strokeDasharray="4 3" label={{ value: 'Outstanding', position: 'right', fontSize: 10, fill: '#6b7280' }} />
          <ReferenceLine y={60} stroke="#d19900" strokeDasharray="4 3" label={{ value: 'Good', position: 'right', fontSize: 10, fill: '#d19900' }} />
          <Line
            type="monotone"
            dataKey="rate"
            stroke="#01696f"
            strokeWidth={2}
            dot={<JudgementDot />}
            activeDot={{ r: 6 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Year-by-year mini stats */}
      <div className="flex gap-3 flex-wrap">
        {chartData.map(({ year, rate }) => {
          const level = rate != null ? proficiencyRateToJudgement(rate) : null;
          return (
            <div key={year} className="text-center">
              <p className="text-xs text-gray-400">{year}</p>
              <p className="text-sm font-semibold text-gray-900">{fmt(rate)}</p>
              {level && <div className="mt-0.5 text-[10px] font-medium" style={{ color: JUDGEMENT_COLORS[level] }}>{JUDGEMENT_LABELS_SHORT[level]}</div>}
            </div>
          );
        })}
        {change != null && (
          <>
            <div className="w-px bg-gray-200 self-stretch" />
            <div className="text-center">
              <p className="text-xs text-gray-400">Change</p>
              <p className="text-sm font-semibold" style={{ color: change >= 0 ? '#437a22' : '#c0392b' }}>
                {change >= 0 ? '+' : ''}{change.toFixed(1)}pp
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Summary table ────────────────────────────────────────────

function SummaryTable({ yearLabels, yearData }: {
  yearLabels: string[];
  yearData: Map<string, Map<Subject, number | null>>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Subject</th>
            {yearLabels.map((y) => (
              <th key={y} className="text-center px-3 py-2 text-xs font-medium text-gray-500">{y}</th>
            ))}
            <th className="text-center px-3 py-2 text-xs font-medium text-gray-500">Progress</th>
          </tr>
        </thead>
        <tbody>
          {SUBJECTS.map((subj) => {
            const rates = yearLabels.map((y) => yearData.get(y)?.get(subj) ?? null);
            const change = rates[0] != null && rates[rates.length - 1] != null
              ? (rates[rates.length - 1] as number) - (rates[0] as number)
              : null;
            const badge = change != null ? cohortProgressDescription(change) : null;

            return (
              <tr key={subj} className="border-t border-gray-100">
                <td className="px-3 py-2 text-xs text-gray-700 font-medium">{subj}</td>
                {rates.map((rate, i) => {
                  const level = rate != null ? proficiencyRateToJudgement(rate) : null;
                  return (
                    <td key={i} className="px-3 py-2 text-center">
                      {rate != null ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-xs tabular-nums font-medium text-gray-900">{rate.toFixed(1)}%</span>
                          {level && <JudgementBadge level={level} size="sm" />}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-center">
                  {badge ? (
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
                      style={{ backgroundColor: `${badge.colour}18`, color: badge.colour }}
                    >
                      {badge.label}
                    </span>
                  ) : <span className="text-xs text-gray-300">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main TrendTab ────────────────────────────────────────────

export function TrendTab() {
  const { school } = useSchoolStore();

  const { data: rawPerf = [], isLoading: perfLoading } = useQuery({
    queryKey: ['student-performance-all-years', school?.id],
    queryFn: async () => {
      if (!school) return [];
      const { data, error } = await supabase
        .from('student_performance')
        .select('academic_year, subject, total_students, students_at_75, proficiency_rate')
        .eq('school_id', school.id)
        .order('academic_year', { ascending: true })
        .order('subject', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PerfRow[];
    },
    enabled: !!school,
  });

  const { data: academicYears = [], isLoading: yearsLoading } = useQuery({
    queryKey: ['academic-years-list', school?.id],
    queryFn: async () => {
      if (!school) return [];
      const { data, error } = await supabase
        .from('academic_years')
        .select('id, label, start_date')
        .eq('school_id', school.id)
        .order('start_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AcademicYear[];
    },
    enabled: !!school,
  });

  // Build: yearLabel → subject → school-wide rate (sum totals across grades/semesters)
  const yearData = useMemo(() => {
    const map = new Map<string, Map<Subject, number | null>>();
    // Group rows: year+subject → accumulated totals
    const acc = new Map<string, { total: number; at75: number }>();
    for (const row of rawPerf) {
      const key = `${row.academic_year}||${row.subject}`;
      const existing = acc.get(key) ?? { total: 0, at75: 0 };
      existing.total += row.total_students ?? 0;
      existing.at75  += row.students_at_75 ?? 0;
      acc.set(key, existing);
    }
    for (const [key, { total, at75 }] of acc) {
      const [year, subj] = key.split('||');
      if (!map.has(year)) map.set(year, new Map());
      const rate = total > 0 ? Math.round((at75 / total) * 10000) / 100 : null;
      map.get(year)!.set(subj as Subject, rate);
    }
    return map;
  }, [rawPerf]);

  const yearLabels = academicYears.map((y) => y.label);

  if (perfLoading || yearsLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-64 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (yearLabels.length === 0 || rawPerf.length === 0) {
    return (
      <div className="text-center py-16 text-sm text-gray-400">
        No multi-year data available. Enter performance data for at least one academic year.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SUBJECTS.map((subj) => (
          <SubjectTrendCard
            key={subj}
            subject={subj}
            yearLabels={yearLabels}
            yearData={yearData}
          />
        ))}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Year-on-Year Summary</h3>
        <SummaryTable yearLabels={yearLabels} yearData={yearData} />
      </div>
    </div>
  );
}
