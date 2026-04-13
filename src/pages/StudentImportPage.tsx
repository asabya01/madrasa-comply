import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';

// ─── Types ───────────────────────────────────────────────────

const VALID_SUBJECTS = [
  'Islamic Education',
  'Arabic Language',
  'English Language',
  'Mathematics',
  'Science',
  'Social Studies',
] as const;

type ValidSubject = typeof VALID_SUBJECTS[number];

const CURRENT_YEAR = new Date().getFullYear();
const DEFAULT_ACADEMIC_YEAR = `${CURRENT_YEAR - 1}/${CURRENT_YEAR}`;

interface ParsedRow {
  rowNum: number;
  grade: string;
  subject: string;
  total_students: number;
  students_at_75: number;
  national_average: number | null;
  academic_year: string;
  errors: string[];
}

// ─── CSV Parser ───────────────────────────────────────────────

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];

  // Normalise header: lowercase, trim, collapse spaces/underscores
  const headerLine = lines[0];
  const headers = headerLine.split(',').map((h) =>
    h.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/^"|"$/g, '')
  );

  const colIdx = (names: string[]): number => {
    for (const n of names) {
      const i = headers.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };

  const gradeCol    = colIdx(['grade', 'grade_label', 'grade_name']);
  const subjectCol  = colIdx(['subject', 'subject_name']);
  const totalCol    = colIdx(['total_students', 'total', 'students_total']);
  const at75Col     = colIdx(['students_at_75', 'at_75', 'students_above_75', 'above_75']);
  const natAvgCol   = colIdx(['national_average', 'nat_avg', 'national_avg']);
  const yearCol     = colIdx(['academic_year', 'year', 'acad_year']);

  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    const get = (idx: number) => (idx >= 0 ? (cells[idx] ?? '').trim().replace(/^"|"$/g, '') : '');

    const rowNum = i + 1; // 1-based including header
    const errors: string[] = [];

    const gradeRaw   = get(gradeCol);
    const subjectRaw = get(subjectCol);
    const totalRaw   = get(totalCol);
    const at75Raw    = get(at75Col);
    const natAvgRaw  = get(natAvgCol);
    const yearRaw    = get(yearCol);

    if (!gradeRaw)   errors.push('Missing grade');
    if (!subjectRaw) errors.push('Missing subject');
    if (!totalRaw)   errors.push('Missing total_students');
    if (!at75Raw)    errors.push('Missing students_at_75');

    const total   = Number(totalRaw);
    const at75    = Number(at75Raw);
    const natAvg  = natAvgRaw !== '' ? Number(natAvgRaw) : null;

    if (totalRaw && isNaN(total))  errors.push('total_students is not a number');
    if (at75Raw  && isNaN(at75))   errors.push('students_at_75 is not a number');
    if (natAvgRaw !== '' && natAvg !== null && isNaN(natAvg)) errors.push('national_average is not a number');
    if (!isNaN(total) && !isNaN(at75) && at75 > total) errors.push('students_at_75 exceeds total_students');

    if (subjectRaw && !VALID_SUBJECTS.includes(subjectRaw as ValidSubject)) {
      errors.push(`Unknown subject "${subjectRaw}" — must be one of: ${VALID_SUBJECTS.join(', ')}`);
    }

    rows.push({
      rowNum,
      grade: gradeRaw,
      subject: subjectRaw,
      total_students: isNaN(total) ? 0 : total,
      students_at_75: isNaN(at75) ? 0 : at75,
      national_average: natAvg !== null && !isNaN(natAvg) ? natAvg : null,
      academic_year: yearRaw || DEFAULT_ACADEMIC_YEAR,
      errors,
    });
  }

  return rows;
}

// Handle quoted fields with commas
function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ─── Main Component ───────────────────────────────────────────

type ImportState = 'idle' | 'previewing' | 'importing' | 'done' | 'error';

export default function StudentImportPage() {
  const { school, profile } = useSchoolStore();
  const [dragOver, setDragOver]       = useState(false);
  const [rows, setRows]               = useState<ParsedRow[]>([]);
  const [fileName, setFileName]       = useState('');
  const [state, setState]             = useState<ImportState>('idle');
  const [importedCount, setImportedCount] = useState(0);
  const [errorCount, setErrorCount]   = useState(0);
  const [globalError, setGlobalError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const validRows   = rows.filter((r) => r.errors.length === 0);
  const invalidRows = rows.filter((r) => r.errors.length > 0);

  function processFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      setGlobalError('Please upload a .csv file.');
      return;
    }
    setGlobalError('');
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      setRows(parsed);
      setState('previewing');
    };
    reader.readAsText(file);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleReset = () => {
    setRows([]);
    setFileName('');
    setState('idle');
    setGlobalError('');
    setImportedCount(0);
    setErrorCount(0);
  };

  const handleImport = async () => {
    if (!school || !validRows.length) return;
    setState('importing');

    // Group by academic_year for the log
    const yearGroups = [...new Set(validRows.map((r) => r.academic_year))];
    const academicYear = yearGroups.join(', ');

    // Insert log row as processing
    const { data: logRow, error: logErr } = await supabase
      .from('student_import_logs')
      .insert({
        school_id:     school.id,
        academic_year: academicYear,
        imported_by:   profile?.id ?? null,
        row_count:     validRows.length,
        status:        'processing',
      })
      .select('id')
      .single();

    if (logErr) {
      setGlobalError(`Failed to start import: ${logErr.message}`);
      setState('error');
      return;
    }

    // Build upsert payload
    const payload = validRows.map((r) => ({
      school_id:       school.id,
      academic_year:   r.academic_year,
      grade_label:     r.grade,
      subject:         r.subject,
      total_students:  r.total_students,
      students_at_75:  r.students_at_75,
      national_average: r.national_average ?? null,
      semester:        'semester_1', // default; users can adjust in PerformanceDataPage
      entered_by:      profile?.id ?? null,
    }));

    const { error: upsertErr } = await supabase
      .from('student_performance')
      .upsert(payload, {
        onConflict: 'school_id,academic_year,grade_label,subject,semester',
        ignoreDuplicates: false,
      });

    const errCount = upsertErr ? validRows.length : 0;
    const imported = upsertErr ? 0 : validRows.length;

    // Update log row
    await supabase
      .from('student_import_logs')
      .update({
        status:      upsertErr ? 'failed' : 'done',
        row_count:   imported,
        error_count: errCount,
        error_summary: upsertErr ? { message: upsertErr.message } : null,
      })
      .eq('id', logRow.id);

    if (upsertErr) {
      setGlobalError(`Import failed: ${upsertErr.message}`);
      setState('error');
    } else {
      setImportedCount(imported);
      setErrorCount(invalidRows.length);
      setState('done');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1a1a1a]">Import Student Performance Data</h1>
        <p className="text-sm text-[#6b7280] mt-1">
          Upload a CSV to bulk-populate Performance Data. Valid rows are upserted; errors are shown before you confirm.
        </p>
      </div>

      {/* Upload zone */}
      {state === 'idle' && (
        <Card>
          <CardContent className="p-0">
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                dragOver ? 'border-[#01696f] bg-[#01696f]/5' : 'border-[#e2e0db] hover:border-[#01696f]/50'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <Upload className="h-10 w-10 text-[#6b7280] mx-auto mb-3" />
              <p className="text-sm font-medium text-[#1a1a1a]">Drag and drop a CSV file here</p>
              <p className="text-xs text-[#6b7280] mt-1 mb-4">
                Required columns: <code className="bg-gray-100 px-1 rounded">grade</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">subject</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">total_students</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">students_at_75</code>
                <br />
                Optional: <code className="bg-gray-100 px-1 rounded">national_average</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">academic_year</code>
              </p>
              <label className="cursor-pointer inline-flex items-center justify-center px-4 py-2 text-sm font-medium border border-[#e2e0db] rounded-md bg-white hover:bg-gray-50 transition-colors">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileInput}
                />
                Browse CSV
              </label>
              {globalError && (
                <p className="text-xs text-red-600 mt-3">{globalError}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Format hint */}
      {state === 'idle' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Expected CSV Format</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-gray-50 rounded-lg p-4 overflow-x-auto text-gray-700 leading-relaxed">
{`grade,subject,total_students,students_at_75,national_average,academic_year
Grade 1,Mathematics,32,24,68,2024/2025
Grade 1,Arabic Language,32,20,,2024/2025
Grade 2,Science,29,18,72,2024/2025`}
            </pre>
            <p className="text-xs text-[#6b7280] mt-2">
              Valid subjects: {VALID_SUBJECTS.join(' · ')}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {(state === 'previewing' || state === 'importing') && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#6b7280]" />
              <span className="text-sm font-medium text-[#1a1a1a]">{fileName}</span>
              <span className="text-xs text-[#6b7280]">
                {rows.length} row{rows.length !== 1 ? 's' : ''} parsed
              </span>
            </div>
            <button
              onClick={handleReset}
              disabled={state === 'importing'}
              className="text-xs text-[#6b7280] hover:text-[#1a1a1a] flex items-center gap-1"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>

          {/* Summary pills */}
          <div className="flex gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-full text-xs font-medium text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {validRows.length} valid
            </div>
            {invalidRows.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-full text-xs font-medium text-red-700">
                <AlertCircle className="h-3.5 w-3.5" />
                {invalidRows.length} with errors
              </div>
            )}
          </div>

          {/* Error rows */}
          {invalidRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-red-700 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" />
                  Rows with errors (will be skipped)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 px-3 font-medium text-gray-500">Row</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-500">Grade</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-500">Subject</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-500">Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invalidRows.map((r) => (
                        <tr key={r.rowNum} className="border-b border-gray-50 bg-red-50/40">
                          <td className="py-2 px-3 text-gray-500">{r.rowNum}</td>
                          <td className="py-2 px-3">{r.grade || '—'}</td>
                          <td className="py-2 px-3">{r.subject || '—'}</td>
                          <td className="py-2 px-3 text-red-600">{r.errors.join('; ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Valid rows preview */}
          {validRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Preview — {validRows.length} rows to import</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 px-3 font-medium text-gray-500">Academic Year</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-500">Grade</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-500">Subject</th>
                        <th className="text-right py-2 px-3 font-medium text-gray-500">Total</th>
                        <th className="text-right py-2 px-3 font-medium text-gray-500">At 75%</th>
                        <th className="text-right py-2 px-3 font-medium text-gray-500">Rate</th>
                        <th className="text-right py-2 px-3 font-medium text-gray-500">Nat. Avg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validRows.map((r) => {
                        const rate = r.total_students > 0
                          ? ((r.students_at_75 / r.total_students) * 100).toFixed(1)
                          : '—';
                        return (
                          <tr key={r.rowNum} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-2 px-3 text-gray-500">{r.academic_year}</td>
                            <td className="py-2 px-3">{r.grade}</td>
                            <td className="py-2 px-3">{r.subject}</td>
                            <td className="py-2 px-3 text-right">{r.total_students}</td>
                            <td className="py-2 px-3 text-right">{r.students_at_75}</td>
                            <td className="py-2 px-3 text-right font-medium">{rate}%</td>
                            <td className="py-2 px-3 text-right text-gray-500">
                              {r.national_average != null ? `${r.national_average}%` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Confirm button */}
          {validRows.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={handleImport}
                disabled={state === 'importing'}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#015a5f] transition-colors disabled:opacity-50"
              >
                {state === 'importing' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Confirm Import ({validRows.length} rows)
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}

      {/* Done state */}
      {state === 'done' && (
        <Card>
          <CardContent className="py-10 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-[#1a1a1a] mb-1">Import Complete</h2>
            <p className="text-sm text-[#6b7280]">
              {importedCount} row{importedCount !== 1 ? 's' : ''} imported successfully.
              {errorCount > 0 && ` ${errorCount} row${errorCount !== 1 ? 's' : ''} skipped due to errors.`}
            </p>
            <button
              onClick={handleReset}
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 border border-[#e2e0db] rounded-lg text-sm text-[#1a1a1a] hover:bg-gray-50 transition-colors"
            >
              Import Another File
            </button>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {state === 'error' && (
        <Card>
          <CardContent className="py-10 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-[#1a1a1a] mb-1">Import Failed</h2>
            <p className="text-sm text-red-600">{globalError}</p>
            <button
              onClick={handleReset}
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 border border-[#e2e0db] rounded-lg text-sm text-[#1a1a1a] hover:bg-gray-50 transition-colors"
            >
              Try Again
            </button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
