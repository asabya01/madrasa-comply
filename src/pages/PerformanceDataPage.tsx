import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Save, TrendingUp, Users } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { JudgementBadge } from '../components/ui/judgement-badge';
import { useSchoolStore } from '../stores/schoolStore';
import { supabase } from '../lib/supabase';
import {
  proficiencyRateToJudgement,
  attendanceRateToJudgement,
  calcSchoolProficiencyRate,
  type JudgementLevel,
} from '../lib/judgement';
import { useToast } from '../components/ui/toast';

// ─── Constants ───────────────────────────────────────────────

const SUBJECTS = [
  'Islamic Education',
  'Arabic Language',
  'English Language',
  'Mathematics',
  'Science',
  'Social Studies',
] as const;

type Subject = typeof SUBJECTS[number];

// Default grade labels — users can also type their own
const DEFAULT_GRADES = [
  'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6',
  'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12',
];

// ─── Types ───────────────────────────────────────────────────

interface ProficiencyRow {
  id?: string;               // UUID from DB (undefined = not yet saved)
  grade_label: string;
  subject: Subject;
  total_students: number | '';
  students_at_75: number | '';
  proficiency_rate?: number; // computed by DB generated column
}

interface AttendanceRow {
  id?: string;
  grade_label: string;
  total_possible_days: number | '';
  total_attended_days: number | '';
  attendance_rate?: number;  // computed by DB generated column
}

// ─── Helpers ─────────────────────────────────────────────────

function calcProfRate(total: number | '', at75: number | ''): number | null {
  if (!total || !at75 || Number(total) === 0) return null;
  return Math.round((Number(at75) / Number(total)) * 10000) / 100;
}

function calcAttRate(possible: number | '', attended: number | ''): number | null {
  if (!possible || Number(possible) === 0) return null;
  return Math.round((Number(attended) / Number(possible)) * 10000) / 100;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n.toFixed(1)}%`;
}

// ─── Proficiency tab ─────────────────────────────────────────

function ProficiencyTab() {
  const { school, academicYear, profile } = useSchoolStore();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Fetch existing rows
  const { data: dbRows = [], isLoading } = useQuery({
    queryKey: ['student-performance', school?.id, academicYear],
    queryFn: async () => {
      if (!school) return [];
      const { data, error } = await supabase
        .from('student_performance')
        .select('id, grade_label, subject, total_students, students_at_75, proficiency_rate')
        .eq('school_id', school.id)
        .eq('academic_year', academicYear)
        .order('grade_label')
        .order('subject');
      if (error) throw error;
      return data as (ProficiencyRow & { id: string })[];
    },
    enabled: !!school,
  });

  // Local editable rows
  const [rows, setRows] = useState<ProficiencyRow[]>([]);

  useEffect(() => {
    if (dbRows.length > 0) {
      setRows(dbRows);
    }
  }, [dbRows]);

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { grade_label: '', subject: 'Mathematics', total_students: '', students_at_75: '' },
    ]);
  };

  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const updateRow = <K extends keyof ProficiencyRow>(i: number, key: K, value: ProficiencyRow[K]) => {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [key]: value } : r));
  };

  // Save / upsert
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!school) return;
      const valid = rows.filter(
        (r) => r.grade_label.trim() && r.total_students !== '' && r.students_at_75 !== ''
      );
      if (!valid.length) throw new Error('No complete rows to save');

      const payload = valid.map((r) => ({
        ...(r.id ? { id: r.id } : {}),
        school_id: school.id,
        academic_year: academicYear,
        grade_label: r.grade_label.trim(),
        subject: r.subject,
        total_students: Number(r.total_students),
        students_at_75: Number(r.students_at_75),
        entered_by: profile?.id ?? null,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('student_performance')
        .upsert(payload, { onConflict: 'school_id,academic_year,grade_label,subject' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-performance'] });
      showToast('Proficiency data saved', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  // Aggregate school-wide rate for summary banner
  const schoolRate = calcSchoolProficiencyRate(
    rows
      .filter((r) => r.proficiency_rate != null || calcProfRate(r.total_students, r.students_at_75) != null)
      .map((r) => ({
        proficiency_rate:
          r.proficiency_rate ?? calcProfRate(r.total_students, r.students_at_75) ?? 0,
      }))
  );
  const schoolJudgement: JudgementLevel = schoolRate > 0 ? proficiencyRateToJudgement(schoolRate) : 3;

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      {rows.length > 0 && (
        <div className="flex items-center gap-4 px-4 py-3 rounded-xl border border-gray-200 bg-white">
          <div>
            <p className="text-xs text-gray-500">School-wide avg proficiency</p>
            <p className="text-2xl font-bold text-gray-900">{fmt(schoolRate)}</p>
          </div>
          <div className="h-10 w-px bg-gray-200" />
          <div>
            <p className="text-xs text-gray-500 mb-1">Judgement (Table 8)</p>
            <JudgementBadge level={schoolJudgement} size="md" />
          </div>
          <div className="ml-auto text-xs text-gray-400">
            {rows.filter((r) => r.total_students !== '').length} entries · {academicYear}
          </div>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            Proficiency Rates — students scoring ≥ 75%
          </CardTitle>
          <div className="flex gap-2">
            <button
              onClick={addRow}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-dashed border-[#01696f] text-[#01696f] hover:bg-[#01696f]/5 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add row
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#01696f] text-white hover:bg-[#01696f]/90 disabled:opacity-50 transition-colors"
            >
              <Save className="h-3.5 w-3.5" />
              {saveMutation.isPending ? 'Saving…' : 'Save all'}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-3 text-xs font-medium text-gray-500 w-36">Grade</th>
                    <th className="text-left py-2 pr-3 text-xs font-medium text-gray-500 w-44">Subject</th>
                    <th className="text-right py-2 pr-3 text-xs font-medium text-gray-500 w-28">Total students</th>
                    <th className="text-right py-2 pr-3 text-xs font-medium text-gray-500 w-28">Scoring ≥ 75</th>
                    <th className="text-right py-2 pr-3 text-xs font-medium text-gray-500 w-24">Rate</th>
                    <th className="text-center py-2 text-xs font-medium text-gray-500 w-32">Judgement</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-sm text-gray-400">
                        No data yet. Click "Add row" to start entering proficiency data.
                      </td>
                    </tr>
                  )}
                  {rows.map((row, i) => {
                    const rate = row.proficiency_rate ?? calcProfRate(row.total_students, row.students_at_75);
                    const judgement = rate != null ? proficiencyRateToJudgement(rate) : null;
                    const invalid =
                      row.students_at_75 !== '' &&
                      row.total_students !== '' &&
                      Number(row.students_at_75) > Number(row.total_students);

                    return (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                        {/* Grade */}
                        <td className="py-1.5 pr-3">
                          <input
                            list="grade-options"
                            value={row.grade_label}
                            onChange={(e) => updateRow(i, 'grade_label', e.target.value)}
                            placeholder="e.g. Grade 5"
                            className="w-full px-2 py-1 text-sm rounded border border-gray-200 focus:outline-none focus:border-[#01696f]"
                          />
                          <datalist id="grade-options">
                            {DEFAULT_GRADES.map((g) => <option key={g} value={g} />)}
                          </datalist>
                        </td>
                        {/* Subject */}
                        <td className="py-1.5 pr-3">
                          <select
                            value={row.subject}
                            onChange={(e) => updateRow(i, 'subject', e.target.value as Subject)}
                            className="w-full px-2 py-1 text-sm rounded border border-gray-200 focus:outline-none focus:border-[#01696f] bg-white"
                          >
                            {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        {/* Total students */}
                        <td className="py-1.5 pr-3">
                          <input
                            type="number"
                            min={0}
                            value={row.total_students}
                            onChange={(e) => updateRow(i, 'total_students', e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full px-2 py-1 text-sm rounded border border-gray-200 focus:outline-none focus:border-[#01696f] text-right"
                          />
                        </td>
                        {/* Scoring ≥75 */}
                        <td className="py-1.5 pr-3">
                          <input
                            type="number"
                            min={0}
                            value={row.students_at_75}
                            onChange={(e) => updateRow(i, 'students_at_75', e.target.value === '' ? '' : Number(e.target.value))}
                            className={`w-full px-2 py-1 text-sm rounded border focus:outline-none text-right ${
                              invalid ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-[#01696f]'
                            }`}
                          />
                        </td>
                        {/* Rate */}
                        <td className="py-1.5 pr-3 text-right tabular-nums text-gray-700 font-medium">
                          {fmt(rate)}
                        </td>
                        {/* Judgement */}
                        <td className="py-1.5 pr-3 text-center">
                          {judgement ? <JudgementBadge level={judgement} size="sm" /> : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                        {/* Delete */}
                        <td className="py-1.5">
                          <button
                            onClick={() => removeRow(i)}
                            className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* PSD formula note */}
      <p className="text-xs text-gray-400">
        <strong>Formula (PSD §4.3):</strong> PR = (students scoring ≥ 75 ÷ total students) × 100.
        School-wide rate = average of all subject/grade combinations.
        Thresholds: ≥70% Outstanding · ≥60% Good · ≥50% Satisfactory · ≥40% Unsatisfactory · &lt;40% NUI.
      </p>
    </div>
  );
}

// ─── Attendance tab ───────────────────────────────────────────

function AttendanceTab() {
  const { school, academicYear } = useSchoolStore();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: dbRows = [], isLoading } = useQuery({
    queryKey: ['attendance-records', school?.id, academicYear],
    queryFn: async () => {
      if (!school) return [];
      const { data, error } = await supabase
        .from('attendance_records')
        .select('id, grade_label, total_possible_days, total_attended_days, attendance_rate')
        .eq('school_id', school.id)
        .eq('academic_year', academicYear)
        .order('grade_label');
      if (error) throw error;
      return data as (AttendanceRow & { id: string })[];
    },
    enabled: !!school,
  });

  const [rows, setRows] = useState<AttendanceRow[]>([]);

  useEffect(() => {
    if (dbRows.length > 0) setRows(dbRows);
  }, [dbRows]);

  const addRow = () =>
    setRows((prev) => [...prev, { grade_label: '', total_possible_days: '', total_attended_days: '' }]);

  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const updateRow = useCallback(
    <K extends keyof AttendanceRow>(i: number, key: K, value: AttendanceRow[K]) =>
      setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [key]: value } : r)),
    []
  );

  // School-wide aggregate
  const allRates = rows
    .map((r) => r.attendance_rate ?? calcAttRate(r.total_possible_days, r.total_attended_days))
    .filter((v): v is number => v != null);
  const avgRate = allRates.length
    ? Math.round((allRates.reduce((a, b) => a + b, 0) / allRates.length) * 100) / 100
    : null;
  const schoolJudgement: JudgementLevel = avgRate != null ? attendanceRateToJudgement(avgRate) : 3;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!school) return;
      const valid = rows.filter(
        (r) => r.grade_label.trim() && r.total_possible_days !== '' && r.total_attended_days !== ''
      );
      if (!valid.length) throw new Error('No complete rows to save');

      const payload = valid.map((r) => ({
        ...(r.id ? { id: r.id } : {}),
        school_id: school.id,
        academic_year: academicYear,
        grade_label: r.grade_label.trim(),
        total_possible_days: Number(r.total_possible_days),
        total_attended_days: Number(r.total_attended_days),
      }));

      const { error } = await supabase
        .from('attendance_records')
        .upsert(payload, { onConflict: 'school_id,academic_year,grade_label' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-records'] });
      showToast('Attendance data saved', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      {rows.length > 0 && avgRate != null && (
        <div className="flex items-center gap-4 px-4 py-3 rounded-xl border border-gray-200 bg-white">
          <div>
            <p className="text-xs text-gray-500">School-wide avg attendance</p>
            <p className="text-2xl font-bold text-gray-900">{fmt(avgRate)}</p>
          </div>
          <div className="h-10 w-px bg-gray-200" />
          <div>
            <p className="text-xs text-gray-500 mb-1">Judgement (Table 11)</p>
            <JudgementBadge level={schoolJudgement} size="md" />
          </div>
          <div className="ml-auto text-xs text-gray-400">
            {rows.length} grade{rows.length !== 1 ? 's' : ''} · {academicYear}
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            Attendance Rates — by grade
          </CardTitle>
          <div className="flex gap-2">
            <button
              onClick={addRow}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-dashed border-[#01696f] text-[#01696f] hover:bg-[#01696f]/5 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add row
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#01696f] text-white hover:bg-[#01696f]/90 disabled:opacity-50 transition-colors"
            >
              <Save className="h-3.5 w-3.5" />
              {saveMutation.isPending ? 'Saving…' : 'Save all'}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-3 text-xs font-medium text-gray-500 w-36">Grade</th>
                    <th className="text-right py-2 pr-3 text-xs font-medium text-gray-500 w-36">Total possible days</th>
                    <th className="text-right py-2 pr-3 text-xs font-medium text-gray-500 w-36">Total attended days</th>
                    <th className="text-right py-2 pr-3 text-xs font-medium text-gray-500 w-24">Rate</th>
                    <th className="text-center py-2 text-xs font-medium text-gray-500 w-32">Judgement</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-gray-400">
                        No data yet. Click "Add row" to start entering attendance data.
                      </td>
                    </tr>
                  )}
                  {rows.map((row, i) => {
                    const rate = row.attendance_rate ?? calcAttRate(row.total_possible_days, row.total_attended_days);
                    const judgement = rate != null ? attendanceRateToJudgement(rate) : null;
                    const invalid =
                      row.total_attended_days !== '' &&
                      row.total_possible_days !== '' &&
                      Number(row.total_attended_days) > Number(row.total_possible_days);

                    return (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="py-1.5 pr-3">
                          <input
                            list="grade-options-att"
                            value={row.grade_label}
                            onChange={(e) => updateRow(i, 'grade_label', e.target.value)}
                            placeholder="e.g. Grade 5"
                            className="w-full px-2 py-1 text-sm rounded border border-gray-200 focus:outline-none focus:border-[#01696f]"
                          />
                          <datalist id="grade-options-att">
                            {DEFAULT_GRADES.map((g) => <option key={g} value={g} />)}
                          </datalist>
                        </td>
                        <td className="py-1.5 pr-3">
                          <input
                            type="number"
                            min={1}
                            value={row.total_possible_days}
                            onChange={(e) => updateRow(i, 'total_possible_days', e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full px-2 py-1 text-sm rounded border border-gray-200 focus:outline-none focus:border-[#01696f] text-right"
                          />
                        </td>
                        <td className="py-1.5 pr-3">
                          <input
                            type="number"
                            min={0}
                            value={row.total_attended_days}
                            onChange={(e) => updateRow(i, 'total_attended_days', e.target.value === '' ? '' : Number(e.target.value))}
                            className={`w-full px-2 py-1 text-sm rounded border focus:outline-none text-right ${
                              invalid ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-[#01696f]'
                            }`}
                          />
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-gray-700 font-medium">
                          {fmt(rate)}
                        </td>
                        <td className="py-1.5 pr-3 text-center">
                          {judgement ? <JudgementBadge level={judgement} size="sm" /> : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                        <td className="py-1.5">
                          <button
                            onClick={() => removeRow(i)}
                            className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-gray-400">
        <strong>Formula (PSD §4.6):</strong> AR = (total days attended ÷ total possible days) × 100.
        School-wide rate = average across all grades.
        Thresholds: ≥96% Outstanding · ≥94% Good · ≥92% Satisfactory · ≥90% Unsatisfactory · &lt;90% NUI.
      </p>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────

export default function PerformanceDataPage() {
  const { school, academicYear } = useSchoolStore();

  if (!school) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-500">
        Loading school data…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Performance Data</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Quantitative data for OAAAQA indicators · {academicYear}
        </p>
      </div>

      <Tabs defaultValue="proficiency">
        <TabsList>
          <TabsTrigger value="proficiency" className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Student Proficiency
          </TabsTrigger>
          <TabsTrigger value="attendance" className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Attendance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="proficiency" className="mt-4">
          <ProficiencyTab />
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          <AttendanceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
