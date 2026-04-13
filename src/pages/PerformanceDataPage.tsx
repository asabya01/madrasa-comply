import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Save, TrendingUp, Users, FileSpreadsheet, Loader2, LineChart as LineChartIcon, Upload, PieChart as PieChartIcon } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { JudgementBadge } from '../components/ui/judgement-badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useSchoolStore } from '../stores/schoolStore';
import { supabase } from '../lib/supabase';
import {
  proficiencyRateToJudgement,
  attendanceRateToJudgement,
  calcSchoolProficiencyRate,
  nationalComparisonLabel,
  type JudgementLevel,
} from '../lib/judgement';
import { useToast } from '../components/ui/toast';
import { exportMinistryMasteryExcel } from '../lib/exportMinistryExcel';
import { TrendTab } from '../components/TrendTab';

// ─── CSV Import ───────────────────────────────────────────────

const CSV_SUBJECTS = [
  'Islamic Education', 'Arabic Language', 'English Language',
  'Mathematics', 'Science', 'Social Studies',
] as const;

const CSV_HEADERS = ['subject', 'grade', 'academic_year', 'total_students', 'students_at_75', 'total_days_possible', 'days_attended'];

interface CsvRow {
  subject: string;
  grade: string;
  academic_year: string;
  total_students: string;
  students_at_75: string;
  total_days_possible: string;
  days_attended: string;
  _errors: string[];
  _valid: boolean;
}

function validateCsvRow(r: Omit<CsvRow, '_errors' | '_valid'>): string[] {
  const errors: string[] = [];
  if (!(CSV_SUBJECTS as readonly string[]).includes(r.subject)) errors.push('Invalid subject');
  if (!r.grade.trim()) errors.push('Grade is empty');
  if (!/^\d{4}-\d{4}$/.test(r.academic_year)) errors.push('academic_year must be YYYY-YYYY');
  const ts = parseInt(r.total_students, 10);
  if (!Number.isInteger(ts) || ts <= 0) errors.push('total_students must be positive integer');
  const s75 = parseInt(r.students_at_75, 10);
  if (!Number.isInteger(s75) || s75 < 0) errors.push('students_at_75 must be non-negative integer');
  if (Number.isInteger(ts) && Number.isInteger(s75) && s75 > ts) errors.push('students_at_75 > total_students');
  const tdp = parseInt(r.total_days_possible, 10);
  if (!Number.isInteger(tdp) || tdp <= 0) errors.push('total_days_possible must be positive integer');
  const da = parseInt(r.days_attended, 10);
  if (!Number.isInteger(da) || da < 0) errors.push('days_attended must be non-negative integer');
  if (Number.isInteger(tdp) && Number.isInteger(da) && da > tdp) errors.push('days_attended > total_days_possible');
  return errors;
}

function downloadTemplate() {
  const header = CSV_HEADERS.join(',');
  const example = 'Mathematics,Grade 5,2024-2025,30,22,180,170';
  const blob = new Blob([`${header}\n${example}\n`], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'madrasa-comply-performance-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function CsvImportDialog({
  open,
  onClose,
  schoolId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  schoolId: string;
  academicYear: string;
  onSuccess: () => void;
}) {
  const { showToast } = useToast();
  const [step, setStep]         = useState<1 | 2 | 3>(1);
  const [rows, setRows]         = useState<CsvRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  function handleClose() {
    if (!importing) { setStep(1); setRows([]); setImportError(null); onClose(); }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) return;
      // Skip header line
      const dataLines = lines.slice(1);
      const parsed: CsvRow[] = dataLines.map(line => {
        const parts = line.split(',');
        const [subject = '', grade = '', academic_year = '', total_students = '', students_at_75 = '', total_days_possible = '', days_attended = ''] = parts;
        const raw = { subject: subject.trim(), grade: grade.trim(), academic_year: academic_year.trim(), total_students: total_students.trim(), students_at_75: students_at_75.trim(), total_days_possible: total_days_possible.trim(), days_attended: days_attended.trim() };
        const _errors = validateCsvRow(raw);
        return { ...raw, _errors, _valid: _errors.length === 0 };
      });
      setRows(parsed);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handleImport() {
    const valid = rows.filter(r => r._valid);
    if (!valid.length) return;
    setImporting(true);
    setImportError(null);
    try {
      const payload = valid.map(r => ({
        school_id:      schoolId,
        academic_year:  r.academic_year,
        grade_label:    r.grade,
        subject:        r.subject,
        semester:       'annual' as const,
        total_students: parseInt(r.total_students, 10),
        students_at_75: parseInt(r.students_at_75, 10),
        updated_at:     new Date().toISOString(),
      }));
      const { error } = await supabase
        .from('student_performance')
        .upsert(payload, { onConflict: 'school_id,academic_year,grade_label,subject,semester' });
      if (error) throw new Error(error.message);
      showToast(`Imported ${valid.length} rows successfully`, 'success');
      onSuccess();
      handleClose();
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  const validCount  = rows.filter(r => r._valid).length;
  const errorCount  = rows.filter(r => !r._valid).length;
  const allValid    = rows.length > 0 && errorCount === 0;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Performance Data — Step {step} of 3</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-4 text-xs">
          {(['Template', 'Upload & Validate', 'Confirm'] as const).map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center font-semibold shrink-0 ${step > i + 1 ? 'bg-[#01696f] text-white' : step === i + 1 ? 'bg-[#01696f] text-white ring-4 ring-[#01696f]/20' : 'bg-gray-100 text-gray-400'}`}>
                {step > i + 1 ? '✓' : i + 1}
              </div>
              <span className={step === i + 1 ? 'text-gray-900 font-medium' : 'text-gray-400'}>{label}</span>
              {i < 2 && <div className="h-px w-6 bg-gray-200 mx-1" />}
            </div>
          ))}
        </div>

        {importError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{importError}</div>
        )}

        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Download the CSV template, fill in your performance data, then upload it in the next step.
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-600 mb-2">Template headers:</p>
              <code className="text-xs text-[#01696f] bg-white border border-gray-200 px-3 py-2 rounded block font-mono">
                {CSV_HEADERS.join(', ')}
              </code>
              <p className="text-xs text-gray-400 mt-2">
                subject must be one of the 6 OAAAQA subjects. academic_year format: 2024-2025.
              </p>
            </div>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 px-4 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4" /> Download CSV Template
            </button>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:border-[#01696f] hover:text-[#01696f] cursor-pointer bg-white transition-colors">
                <Upload className="h-4 w-4" />
                Choose CSV File
                <input type="file" accept=".csv" onChange={handleFile} className="hidden" />
              </label>
              {rows.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${allValid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {validCount} valid
                  </span>
                  {errorCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">
                      {errorCount} errors
                    </span>
                  )}
                </div>
              )}
            </div>

            {rows.length > 0 && (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        {CSV_HEADERS.map(h => (
                          <th key={h} className="text-left px-3 py-2 font-medium text-gray-500 whitespace-nowrap">{h}</th>
                        ))}
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((r, i) => (
                        <tr key={i} className={r._valid ? '' : 'bg-red-50'}>
                          <td className="px-3 py-2 text-gray-700">{r.subject}</td>
                          <td className="px-3 py-2 text-gray-700">{r.grade}</td>
                          <td className="px-3 py-2 text-gray-700">{r.academic_year}</td>
                          <td className="px-3 py-2 text-gray-700">{r.total_students}</td>
                          <td className="px-3 py-2 text-gray-700">{r.students_at_75}</td>
                          <td className="px-3 py-2 text-gray-700">{r.total_days_possible}</td>
                          <td className="px-3 py-2 text-gray-700">{r.days_attended}</td>
                          <td className="px-3 py-2">
                            {r._valid
                              ? <span className="text-green-600 font-medium">✓</span>
                              : <span className="text-red-600">{r._errors.join('; ')}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-gray-800 mb-2">Ready to import</p>
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-[#01696f]">{validCount} rows</span> will be upserted into{' '}
                <code className="text-xs bg-white border border-gray-200 px-1.5 py-0.5 rounded">student_performance</code>.
              </p>
              <p className="text-xs text-gray-400 mt-2">
                School: {schoolId} · Academic Year filter applied. All rows will use semester = annual.
                Existing records with the same school, year, grade, subject and semester will be updated.
              </p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 mt-4">
          {step > 1 && (
            <button onClick={() => setStep(s => (s - 1) as 1 | 2 | 3)} disabled={importing} className="flex-1 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
              ← Back
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={() => setStep(s => (s + 1) as 1 | 2 | 3)}
              disabled={step === 2 && !allValid}
              className="flex-1 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50 transition-colors"
            >
              {step === 2 ? `Import ${validCount} valid rows →` : 'Next →'}
            </button>
          ) : (
            <button
              onClick={() => void handleImport()}
              disabled={importing}
              className="flex-1 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50 transition-colors"
            >
              {importing ? 'Importing…' : `Confirm & Import ${validCount} rows`}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
type Semester = 'semester_1' | 'semester_2' | 'annual';

const SEMESTER_LABELS: Record<Semester, string> = {
  semester_1: 'Semester 1',
  semester_2: 'Semester 2',
  annual:     'Annual / Full Year',
};

// Default grade labels — users can also type their own
const DEFAULT_GRADES = [
  'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6',
  'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12',
];

// ─── Types ───────────────────────────────────────────────────

interface ProficiencyRow {
  id?: string;
  grade_label: string;
  subject: Subject;
  total_students: number | '';
  students_at_75: number | '';
  proficiency_rate?: number;
  national_average: number | '';
}

interface AttendanceRow {
  id?: string;
  grade_label: string;
  total_possible_days: number | '';
  total_attended_days: number | '';
  attendance_rate?: number;
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

// ─── Semester selector ────────────────────────────────────────

function SemesterSelector({
  value,
  onChange,
  rows,
}: {
  value: Semester;
  onChange: (s: Semester) => void;
  rows: ProficiencyRow[];
}) {
  const tabs: Semester[] = ['semester_1', 'semester_2', 'annual'];

  // Count unique subjects that have data for each semester (passed rows are already filtered)
  const enteredCount = new Set(rows.filter((r) => r.total_students !== '').map((r) => r.subject)).size;
  const total = SUBJECTS.length;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {tabs.map((sem) => (
        <button
          key={sem}
          onClick={() => onChange(sem)}
          className={`relative px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
            value === sem
              ? 'bg-[#01696f] text-white border-[#01696f]'
              : 'bg-white text-gray-600 border-gray-200 hover:border-[#01696f] hover:text-[#01696f]'
          }`}
        >
          {SEMESTER_LABELS[sem]}
          {value === sem && (
            <span className="ml-2 text-xs opacity-80">
              {enteredCount}/{total} subjects
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Proficiency tab ─────────────────────────────────────────

function ProficiencyTab({ onExport }: { onExport: (semester: Semester) => void }) {
  const { school, academicYear, profile } = useSchoolStore();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [semester, setSemester] = useState<Semester>('semester_1');
  const [exporting, setExporting] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);

  const { data: dbRows = [], isLoading } = useQuery({
    queryKey: ['student-performance', school?.id, academicYear, semester],
    queryFn: async () => {
      if (!school) return [];
      const { data, error } = await supabase
        .from('student_performance')
        .select('id, grade_label, subject, total_students, students_at_75, proficiency_rate, national_average')
        .eq('school_id', school.id)
        .eq('academic_year', academicYear)
        .eq('semester', semester)
        .order('grade_label')
        .order('subject');
      if (error) throw error;
      return data as (ProficiencyRow & { id: string })[];
    },
    enabled: !!school,
  });

  const [rows, setRows] = useState<ProficiencyRow[]>([]);

  useEffect(() => {
    setRows(dbRows.length > 0
      ? (dbRows as (ProficiencyRow & { id: string })[]).map((r) => ({
          ...r,
          national_average: r.national_average ?? '',
        }))
      : []);
  }, [dbRows, semester]);

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { grade_label: '', subject: 'Mathematics', total_students: '', students_at_75: '', national_average: '' },
    ]);
  };

  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const updateRow = <K extends keyof ProficiencyRow>(i: number, key: K, value: ProficiencyRow[K]) => {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [key]: value } : r));
  };

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
        semester,
        total_students: Number(r.total_students),
        students_at_75: Number(r.students_at_75),
        national_average: r.national_average !== '' ? Number(r.national_average) : null,
        entered_by: profile?.id ?? null,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('student_performance')
        .upsert(payload, { onConflict: 'school_id,academic_year,grade_label,subject,semester' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-performance'] });
      showToast('Proficiency data saved', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      await onExport(semester);
    } finally {
      setExporting(false);
    }
  };

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
      {/* Semester selector + action buttons */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <SemesterSelector value={semester} onChange={setSemester} rows={rows} />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCsvOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:border-[#01696f] hover:text-[#01696f] bg-white transition-colors"
          >
            <Upload className="h-4 w-4" /> Import CSV
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:border-[#01696f] hover:text-[#01696f] bg-white transition-colors disabled:opacity-50"
          >
            {exporting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
            ) : (
              <><FileSpreadsheet className="h-4 w-4" /> Export Ministry Format</>
            )}
          </button>
        </div>
      </div>

      {/* CSV import dialog */}
      {school && (
        <CsvImportDialog
          open={csvOpen}
          onClose={() => setCsvOpen(false)}
          schoolId={school.id}
          academicYear={academicYear ?? ''}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['student-performance'] })}
        />
      )}

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
            {rows.filter((r) => r.total_students !== '').length} entries · {SEMESTER_LABELS[semester]} · {academicYear}
          </div>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            Proficiency Rates — {SEMESTER_LABELS[semester]} — students scoring ≥ 75%
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
                    <th className="text-right py-2 pr-3 text-xs font-medium text-gray-500 w-28">National Avg</th>
                    <th className="py-2 text-xs font-medium text-gray-500 w-36">vs National</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-sm text-gray-400">
                        No data for {SEMESTER_LABELS[semester]}. Click "Add row" to start entering proficiency data.
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
                        <td className="py-1.5 pr-3">
                          <select
                            value={row.subject}
                            onChange={(e) => updateRow(i, 'subject', e.target.value as Subject)}
                            className="w-full px-2 py-1 text-sm rounded border border-gray-200 focus:outline-none focus:border-[#01696f] bg-white"
                          >
                            {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="py-1.5 pr-3">
                          <input
                            type="number"
                            min={0}
                            value={row.total_students}
                            onChange={(e) => updateRow(i, 'total_students', e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full px-2 py-1 text-sm rounded border border-gray-200 focus:outline-none focus:border-[#01696f] text-right"
                          />
                        </td>
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
                        <td className="py-1.5 pr-3 text-right tabular-nums text-gray-700 font-medium">
                          {fmt(rate)}
                        </td>
                        <td className="py-1.5 pr-3 text-center">
                          {judgement ? <JudgementBadge level={judgement} size="sm" /> : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                        {/* National average */}
                        <td className="py-1.5 pr-3">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={row.national_average}
                            onChange={(e) => updateRow(i, 'national_average', e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder="—"
                            className="w-full px-2 py-1 text-sm rounded border border-gray-200 focus:outline-none focus:border-[#01696f] text-right"
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          {rate != null && row.national_average !== '' ? (() => {
                            const delta = rate - Number(row.national_average);
                            const cmp = nationalComparisonLabel(delta);
                            return (
                              <span
                                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap"
                                style={{ backgroundColor: `${cmp.colour}15`, color: cmp.colour, border: `1px solid ${cmp.colour}30` }}
                              >
                                {cmp.label}
                              </span>
                            );
                          })() : <span className="text-xs text-gray-300">—</span>}
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
          <CardTitle className="text-sm font-semibold">Attendance Rates — by grade</CardTitle>
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

// ─── Cohort tab ───────────────────────────────────────────────

interface CohortRow {
  id?: string;
  subject: Subject;
  semester: Semester;
  total_students_male: number | '';
  total_students_female: number | '';
  students_at_75_male: number | '';
  students_at_75_female: number | '';
  total_students_omani: number | '';
  total_students_non_omani: number | '';
  students_at_75_omani: number | '';
  students_at_75_non_omani: number | '';
}

function calcRate(at75: number | '', total: number | ''): number | null {
  if (total === '' || at75 === '' || Number(total) === 0) return null;
  return Math.round((Number(at75) / Number(total)) * 1000) / 10;
}

function CohortDataDialog({
  open,
  onClose,
  subject,
  row,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  subject: Subject;
  row: Partial<CohortRow>;
  onSave: (data: Partial<CohortRow>) => void;
}) {
  const [draft, setDraft] = useState<Partial<CohortRow>>({ ...row });
  useEffect(() => { setDraft({ ...row }); }, [row, open]);

  function field(label: string, key: keyof CohortRow) {
    return (
      <div>
        <label className="text-xs text-gray-600 mb-1 block">{label}</label>
        <input
          type="number"
          min={0}
          value={draft[key] as number | '' ?? ''}
          onChange={e => setDraft(d => ({ ...d, [key]: e.target.value === '' ? '' : parseInt(e.target.value, 10) }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01696f]"
        />
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cohort Data — {subject}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Gender breakdown</p>
            <div className="grid grid-cols-2 gap-3">
              {field('Total boys', 'total_students_male')}
              {field('Boys ≥75%', 'students_at_75_male')}
              {field('Total girls', 'total_students_female')}
              {field('Girls ≥75%', 'students_at_75_female')}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Nationality breakdown</p>
            <div className="grid grid-cols-2 gap-3">
              {field('Total Omani', 'total_students_omani')}
              {field('Omani ≥75%', 'students_at_75_omani')}
              {field('Total Non-Omani', 'total_students_non_omani')}
              {field('Non-Omani ≥75%', 'students_at_75_non_omani')}
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => { onSave(draft); onClose(); }}
            className="flex-1 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54]"
          >
            Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CohortTab() {
  const { school, academicYear, profile } = useSchoolStore();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [semester, setSemester] = useState<Semester>('semester_1');
  const [dialogSubject, setDialogSubject] = useState<Subject | null>(null);
  const [draft, setDraft] = useState<Partial<CohortRow>>({});

  const { data: dbRows = [] } = useQuery({
    queryKey: ['student-performance-cohort', school?.id, academicYear, semester],
    queryFn: async () => {
      if (!school) return [];
      const { data, error } = await supabase
        .from('student_performance')
        .select(`id, subject, semester,
          total_students_male, total_students_female,
          students_at_75_male, students_at_75_female,
          total_students_omani, total_students_non_omani,
          students_at_75_omani, students_at_75_non_omani`)
        .eq('school_id', school.id)
        .eq('academic_year', academicYear)
        .eq('semester', semester);
      if (error) throw error;
      return (data ?? []) as CohortRow[];
    },
    enabled: !!school,
  });

  // Map by subject for quick lookup
  const rowBySubject = Object.fromEntries(dbRows.map(r => [r.subject, r]));

  const saveMutation = useMutation({
    mutationFn: async ({ subject, data }: { subject: Subject; data: Partial<CohortRow> }) => {
      if (!school) return;
      const existing = rowBySubject[subject];
      const payload = {
        school_id: school.id,
        academic_year: academicYear,
        subject,
        semester,
        grade_label: 'all',
        total_students: 0,
        students_at_75: 0,
        entered_by: profile?.id ?? null,
        updated_at: new Date().toISOString(),
        total_students_male: data.total_students_male !== '' ? Number(data.total_students_male) : null,
        total_students_female: data.total_students_female !== '' ? Number(data.total_students_female) : null,
        students_at_75_male: data.students_at_75_male !== '' ? Number(data.students_at_75_male) : null,
        students_at_75_female: data.students_at_75_female !== '' ? Number(data.students_at_75_female) : null,
        total_students_omani: data.total_students_omani !== '' ? Number(data.total_students_omani) : null,
        total_students_non_omani: data.total_students_non_omani !== '' ? Number(data.total_students_non_omani) : null,
        students_at_75_omani: data.students_at_75_omani !== '' ? Number(data.students_at_75_omani) : null,
        students_at_75_non_omani: data.students_at_75_non_omani !== '' ? Number(data.students_at_75_non_omani) : null,
      };
      if (existing?.id) {
        const { error } = await supabase.from('student_performance').update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('student_performance')
          .upsert(payload, { onConflict: 'school_id,academic_year,grade_label,subject,semester' });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-performance-cohort'] });
      showToast('Cohort data saved', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  // Build chart data
  const genderChartData = SUBJECTS.map(subj => {
    const r = rowBySubject[subj];
    return {
      name: subj.replace(' Language', '').replace(' Education', '').replace(' Studies', ''),
      Boys: r ? calcRate(r.students_at_75_male, r.total_students_male) ?? 0 : 0,
      Girls: r ? calcRate(r.students_at_75_female, r.total_students_female) ?? 0 : 0,
    };
  });

  const natChartData = SUBJECTS.map(subj => {
    const r = rowBySubject[subj];
    return {
      name: subj.replace(' Language', '').replace(' Education', '').replace(' Studies', ''),
      Omani: r ? calcRate(r.students_at_75_omani, r.total_students_omani) ?? 0 : 0,
      'Non-Omani': r ? calcRate(r.students_at_75_non_omani, r.total_students_non_omani) ?? 0 : 0,
    };
  });

  function openDialog(subject: Subject) {
    const r = rowBySubject[subject];
    setDraft(r ? { ...r } : {});
    setDialogSubject(subject);
  }

  function CohortTable({
    headers,
    getRow,
  }: {
    headers: string[];
    getRow: (subj: Subject, r: CohortRow | undefined) => React.ReactNode[];
  }) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-3 py-2 font-medium text-gray-500">Subject</th>
              {headers.map(h => (
                <th key={h} className="text-right px-3 py-2 font-medium text-gray-500 whitespace-nowrap">{h}</th>
              ))}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {SUBJECTS.map(subj => {
              const r = rowBySubject[subj];
              const cells = getRow(subj, r);
              return (
                <tr key={subj} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-700">{subj}</td>
                  {cells.map((cell, i) => (
                    <td key={i} className="px-3 py-2 text-right tabular-nums text-gray-600">{cell}</td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => openDialog(subj)}
                      className="text-[#01696f] text-xs hover:underline"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SemesterSelector value={semester} onChange={setSemester} rows={[]} />

      {/* Gender breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Gender Breakdown — Proficiency ≥75%</CardTitle>
        </CardHeader>
        <CardContent>
          <CohortTable
            headers={['Total Boys', 'Boys ≥75%', 'Boys Rate', 'Total Girls', 'Girls ≥75%', 'Girls Rate', 'Gap']}
            getRow={(subj, r) => {
              const boysRate = r ? calcRate(r.students_at_75_male, r.total_students_male) : null;
              const girlsRate = r ? calcRate(r.students_at_75_female, r.total_students_female) : null;
              const gap = boysRate != null && girlsRate != null ? boysRate - girlsRate : null;
              return [
                r?.total_students_male ?? '—',
                r?.students_at_75_male ?? '—',
                boysRate != null ? `${boysRate}%` : '—',
                r?.total_students_female ?? '—',
                r?.students_at_75_female ?? '—',
                girlsRate != null ? `${girlsRate}%` : '—',
                gap != null ? (
                  <span className={gap > 0 ? 'text-blue-600' : gap < 0 ? 'text-pink-600' : 'text-gray-400'}>
                    {gap > 0 ? `+${gap.toFixed(1)}%` : `${gap.toFixed(1)}%`}
                  </span>
                ) : '—',
              ];
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Gender Proficiency Chart</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={genderChartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
              <Tooltip formatter={(v: number) => [`${v}%`]} />
              <Legend />
              <Bar dataKey="Boys" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={32} />
              <Bar dataKey="Girls" fill="#ec4899" radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Nationality breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Nationality Breakdown — Proficiency ≥75%</CardTitle>
        </CardHeader>
        <CardContent>
          <CohortTable
            headers={['Total Omani', 'Omani ≥75%', 'Omani Rate', 'Total Non-Omani', 'Non-Omani ≥75%', 'Non-Omani Rate', 'Gap']}
            getRow={(subj, r) => {
              const omaniRate = r ? calcRate(r.students_at_75_omani, r.total_students_omani) : null;
              const nonOmaniRate = r ? calcRate(r.students_at_75_non_omani, r.total_students_non_omani) : null;
              const gap = omaniRate != null && nonOmaniRate != null ? omaniRate - nonOmaniRate : null;
              return [
                r?.total_students_omani ?? '—',
                r?.students_at_75_omani ?? '—',
                omaniRate != null ? `${omaniRate}%` : '—',
                r?.total_students_non_omani ?? '—',
                r?.students_at_75_non_omani ?? '—',
                nonOmaniRate != null ? `${nonOmaniRate}%` : '—',
                gap != null ? (
                  <span className={gap > 0 ? 'text-green-600' : gap < 0 ? 'text-red-600' : 'text-gray-400'}>
                    {gap > 0 ? `+${gap.toFixed(1)}%` : `${gap.toFixed(1)}%`}
                  </span>
                ) : '—',
              ];
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Nationality Proficiency Chart</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={natChartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
              <Tooltip formatter={(v: number) => [`${v}%`]} />
              <Legend />
              <Bar dataKey="Omani" fill="#01696f" radius={[4, 4, 0, 0]} maxBarSize={32} />
              <Bar dataKey="Non-Omani" fill="#d19900" radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {dialogSubject && (
        <CohortDataDialog
          open={true}
          onClose={() => setDialogSubject(null)}
          subject={dialogSubject}
          row={draft}
          onSave={(data) => {
            saveMutation.mutate({ subject: dialogSubject, data });
          }}
        />
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────

export default function PerformanceDataPage() {
  const { school, academicYear } = useSchoolStore();
  const { showToast } = useToast();

  const handleExport = async (semester: 'semester_1' | 'semester_2' | 'annual') => {
    if (!school) return;
    try {
      // Fetch last 3 academic years
      const { data: years, error } = await supabase
        .from('academic_years')
        .select('id, label')
        .eq('school_id', school.id)
        .order('start_date', { ascending: false })
        .limit(3);
      if (error) throw error;
      if (!years?.length) throw new Error('No academic years found');

      const blob = await exportMinistryMasteryExcel(
        school.id,
        school.name_ar ?? school.name_en,
        years as { id: string; label: string }[],
        semester,
        supabase,
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `نسب-الإتقان-${school.name_en.replace(/\s+/g, '-')}-${academicYear}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Ministry Mastery Rate export downloaded', 'success');
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  };

  if (!school) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-500">
        Loading school data…
      </div>
    );
  }

  return (
    <div className="space-y-5">
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
          <TabsTrigger value="trend" className="flex items-center gap-1.5">
            <LineChartIcon className="h-3.5 w-3.5" />
            3-Year Trend
          </TabsTrigger>
          <TabsTrigger value="cohort" className="flex items-center gap-1.5">
            <PieChartIcon className="h-3.5 w-3.5" />
            Cohort Breakdown
          </TabsTrigger>
        </TabsList>

        <TabsContent value="proficiency" className="mt-4">
          <ProficiencyTab onExport={handleExport} />
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          <AttendanceTab />
        </TabsContent>

        <TabsContent value="trend" className="mt-4">
          <TrendTab />
        </TabsContent>

        <TabsContent value="cohort" className="mt-4">
          <CohortTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
