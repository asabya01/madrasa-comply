import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText, Download, RefreshCw, AlertTriangle, CheckCircle2,
  Clock, ChevronDown, ChevronUp, XCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { usePermissions } from '../hooks/usePermissions';
import { useToast } from '../components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { JUDGEMENT_LABELS, JUDGEMENT_COLORS, type JudgementLevel } from '../lib/judgement';

// ─── Types ────────────────────────────────────────────────────

interface SEDDocument {
  id: string;
  school_id: string;
  academic_year: string;
  file_path: string;
  generated_by: string | null;
  generated_at: string;
  overall_judgement_snapshot: number | null;
  file_size_bytes: number | null;
}

interface DocOptions {
  includePlan:         boolean;
  includeQuantitative: boolean;
  includeSurveys:      boolean;
  includeObservations: boolean;
}

// ─── Validation check (PSD §8.11 and §10) ────────────────────

const CORE_SUBJECTS = [
  'Islamic Education', 'Arabic Language', 'English Language',
  'Mathematics', 'Science', 'Social Studies',
] as const;

interface ValidationCheck {
  label: string;
  pass: boolean;
  message?: string;  // shown when failing
}

function useValidation() {
  const { school, academicYear } = useSchoolStore();

  // 1. All indicators
  const { data: allIndicators = [], isLoading: loadingIndicators } = useQuery({
    queryKey: ['indicators-full'],
    queryFn: async () => {
      const { data } = await supabase.from('indicators').select('id, domain_id');
      return (data ?? []) as { id: string; domain_id: string }[];
    },
    staleTime: 1000 * 60 * 60,
  });

  // 1. Rated indicators for this year
  const { data: ratedIds = [], isLoading: loadingRated } = useQuery({
    queryKey: ['all-ratings-judgements', school?.id, academicYear],
    queryFn: async () => {
      if (!school) return [] as { indicator_id: string }[];
      const { data } = await supabase
        .from('indicator_ratings')
        .select('indicator_id')
        .eq('school_id', school.id)
        .eq('academic_year', academicYear);
      return (data ?? []) as { indicator_id: string }[];
    },
    enabled: !!school,
  });

  // 2. Student performance subjects for this year
  const { data: perfRows = [], isLoading: loadingPerf } = useQuery({
    queryKey: ['perf-subjects-validation', school?.id, academicYear],
    queryFn: async () => {
      if (!school) return [] as { subject: string }[];
      const { data } = await supabase
        .from('student_performance')
        .select('subject')
        .eq('school_id', school.id)
        .eq('academic_year', academicYear);
      return (data ?? []) as { subject: string }[];
    },
    enabled: !!school,
  });

  // 3. Submitted teacher self-assessments (Domain 3 indicators)
  const { data: submittedTeacherRows = [], isLoading: loadingTeacher } = useQuery({
    queryKey: ['teacher-submitted-d3', school?.id],
    queryFn: async () => {
      if (!school) return [] as { indicator_id: string }[];
      // RLS lets school admins see all teacher ratings for their school
      const { data } = await supabase
        .from('teacher_indicator_ratings')
        .select('indicator_id')
        .eq('status', 'submitted');
      return (data ?? []) as { indicator_id: string }[];
    },
    enabled: !!school,
  });

  // 4. Evidence indicator links for this school
  const { data: evidenceLinks = [], isLoading: loadingEvidence } = useQuery({
    queryKey: ['evidence-links-validation', school?.id],
    queryFn: async () => {
      if (!school) return [] as { indicator_id: string | null }[];
      const { data } = await supabase
        .from('evidence_indicator_links')
        .select('indicator_id')
        .eq('school_id', school.id);
      return (data ?? []) as { indicator_id: string | null }[];
    },
    enabled: !!school,
  });

  const isLoading = loadingIndicators || loadingRated || loadingPerf || loadingTeacher || loadingEvidence;

  // ── Derived checks ────────────────────────────────────────────

  // 1. Indicator ratings
  const totalIndicators = allIndicators.length;
  const ratedCount = new Set(ratedIds.map((r) => r.indicator_id)).size;
  const unratedCount = totalIndicators - ratedCount;

  // 2. Core subjects with proficiency data
  const coveredSubjects = new Set(perfRows.map((r) => r.subject));
  const missingSubjects = CORE_SUBJECTS.filter((s) => !coveredSubjects.has(s));

  // 3. Domain 3 indicators covered by submitted teacher self-assessments
  const domain3Ids = new Set(allIndicators.filter((i) => i.domain_id === '3').map((i) => i.id));
  const submittedD3Set = new Set(
    submittedTeacherRows.map((r) => r.indicator_id).filter((id) => domain3Ids.has(id))
  );
  const uncoveredD3Count = [...domain3Ids].filter((id) => !submittedD3Set.has(id)).length;

  // 4. Indicators covered by at least 1 evidence file
  const indicatorsWithEvidence = new Set(
    evidenceLinks.map((l) => l.indicator_id).filter((id): id is string => id != null)
  );
  const indicatorsWithoutEvidenceCount = totalIndicators > 0
    ? allIndicators.filter((i) => !indicatorsWithEvidence.has(i.id)).length
    : 0;

  const checks: ValidationCheck[] = [
    {
      label: 'All indicators rated',
      pass: totalIndicators > 0 && unratedCount === 0,
      message: unratedCount > 0 ? `${unratedCount} indicator${unratedCount !== 1 ? 's' : ''} still unrated` : undefined,
    },
    {
      label: 'All 6 core subjects have proficiency data for current year',
      pass: missingSubjects.length === 0,
      message: missingSubjects.length > 0 ? `Missing: ${missingSubjects.join(', ')}` : undefined,
    },
    {
      label: 'Each Domain 3 indicator has a submitted teacher self-assessment',
      pass: domain3Ids.size > 0 && uncoveredD3Count === 0,
      message: uncoveredD3Count > 0 ? `${uncoveredD3Count} Domain 3 indicator${uncoveredD3Count !== 1 ? 's have' : ' has'} no teacher submissions` : undefined,
    },
    {
      label: 'Each indicator has at least 1 evidence file',
      pass: totalIndicators > 0 && indicatorsWithoutEvidenceCount === 0,
      message: indicatorsWithoutEvidenceCount > 0 ? `${indicatorsWithoutEvidenceCount} indicator${indicatorsWithoutEvidenceCount !== 1 ? 's have' : ' has'} no linked evidence` : undefined,
    },
  ];

  const allPass = checks.every((c) => c.pass);
  const rated = ratedCount;
  const total = totalIndicators;
  const pct = total > 0 ? Math.round((rated / total) * 100) : 0;

  return { checks, allPass, rated, total, pct, isLoading };
}

// ─── History hook ─────────────────────────────────────────────

function useSEDHistory() {
  const { school, academicYear } = useSchoolStore();
  return useQuery({
    queryKey: ['sed-documents', school?.id, academicYear],
    queryFn: async () => {
      if (!school) return [] as SEDDocument[];
      const { data, error } = await supabase
        .from('sed_documents')
        .select('*')
        .eq('school_id', school.id)
        .eq('academic_year', academicYear)
        .order('generated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SEDDocument[];
    },
    enabled: !!school,
  });
}

// ─── Page ─────────────────────────────────────────────────────

export default function SEDPage() {
  const { school, academicYear } = useSchoolStore();
  const { isSchoolAdmin, isSuperAdmin } = usePermissions();
  const { showToast } = useToast();
  const validation = useValidation();
  const { data: history = [], refetch: refetchHistory } = useSEDHistory();

  const [generating, setGenerating]         = useState(false);
  const [genError, setGenError]             = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen]       = useState(false);
  const [options, setOptions]               = useState<DocOptions>({
    includePlan:         true,
    includeQuantitative: true,
    includeSurveys:      true,
    includeObservations: true,
  });
  const [downloadingId, setDownloadingId]   = useState<string | null>(null);
  const [overrideGenerate, setOverrideGenerate] = useState(false);

  const canGenerate = isSchoolAdmin || isSuperAdmin;
  const generateEnabled = validation.allPass || overrideGenerate;

  function toggleOption(key: keyof DocOptions) {
    setOptions(o => ({ ...o, [key]: !o[key] }));
  }

  async function handleGenerate() {
    if (!school || !canGenerate) return;
    setGenerating(true);
    setGenError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('generate-sed', {
        body: { schoolId: school.id, academicYearId: academicYear, options },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error as string);
      const result = data as { signedUrl: string; fileName: string };
      window.open(result.signedUrl, '_blank');
      showToast('SED generated successfully', 'success');
      void refetchHistory();
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function downloadHistoryFile(doc: SEDDocument) {
    setDownloadingId(doc.id);
    try {
      const { data } = await supabase.storage.from('sed-documents').createSignedUrl(doc.file_path, 3600);
      if (data?.signedUrl) window.open(data.signedUrl, '_blank');
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* ── Header ─────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Self-Evaluation Document</h1>
        <p className="text-sm text-gray-500 mt-1">
          Generate the official OAAAQA SED for {school?.name_en} · {academicYear}
        </p>
      </div>

      {/* ── Validation Checklist ───────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold font-sans">Pre-Generation Validation</CardTitle>
            {!validation.isLoading && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                validation.allPass
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }`}>
                {validation.checks.filter((c) => c.pass).length}/{validation.checks.length} passed
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {validation.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-5 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* Rating progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Indicators rated</span>
                  <span className="font-medium">{validation.rated} / {validation.total}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${validation.pct}%`,
                      backgroundColor: validation.pct === 100 ? '#437a22' : validation.pct >= 50 ? '#d19900' : '#da7101',
                    }}
                  />
                </div>
              </div>

              {/* 4 checks */}
              <div className="divide-y divide-gray-100">
                {validation.checks.map((check) => (
                  <div key={check.label} className="flex items-start gap-3 py-2.5">
                    {check.pass
                      ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                      : <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${check.pass ? 'text-gray-700' : 'text-gray-900 font-medium'}`}>
                        {check.label}
                      </p>
                      {!check.pass && check.message && (
                        <p className="text-xs text-red-600 mt-0.5">{check.message}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Override for school admin */}
              {!validation.allPass && canGenerate && (
                <label className="flex items-start gap-2.5 cursor-pointer select-none pt-1 border-t border-gray-100">
                  <input
                    type="checkbox"
                    checked={overrideGenerate}
                    onChange={(e) => setOverrideGenerate(e.target.checked)}
                    className="h-4 w-4 mt-0.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-amber-700">Generate anyway (incomplete data)</p>
                    <p className="text-xs text-gray-400">Unmet conditions will be noted in the SED document</p>
                  </div>
                </label>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Generate card ──────────────────────────────── */}
      <Card>
        <CardContent className="pt-6">
          {!canGenerate ? (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                Only School Administrators and above can generate the SED. Contact your school admin.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#01696f]/10 flex items-center justify-center shrink-0">
                  <FileText className="h-6 w-6 text-[#01696f]" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">Generate DOCX</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Produces a structured Word document: School Profile, Domain-by-Domain Ratings &amp; Evidence, Improvement Plan, and optional annexes.
                  </p>
                </div>
              </div>

              {/* Document Options */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setOptionsOpen(o => !o)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
                >
                  Document Options
                  {optionsOpen
                    ? <ChevronUp className="h-4 w-4 text-gray-400" />
                    : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </button>
                {optionsOpen && (
                  <div className="px-4 py-3 space-y-2.5">
                    {(
                      [
                        { key: 'includePlan',         label: 'Include Improvement Plan' },
                        { key: 'includeQuantitative', label: 'Include Quantitative Annex (proficiency + attendance)' },
                        { key: 'includeSurveys',      label: 'Include Survey Results Annex' },
                        { key: 'includeObservations', label: 'Include Classroom Observations Summary' },
                      ] as Array<{ key: keyof DocOptions; label: string }>
                    ).map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={options[key]}
                          onChange={() => toggleOption(key)}
                          className="h-4 w-4 rounded border-gray-300 text-[#01696f] focus:ring-[#01696f]"
                        />
                        <span className="text-sm text-gray-700">{label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {overrideGenerate && (
                <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 font-medium">
                    Generating with incomplete data. The SED will include a note that validation conditions were not fully met.
                  </p>
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={generating || !generateEnabled}
                className="w-full flex items-center justify-center gap-2 py-3 bg-[#01696f] text-white text-sm font-semibold rounded-xl hover:bg-[#0c4e54] disabled:opacity-60 transition-colors"
              >
                {generating ? (
                  <><RefreshCw className="h-4 w-4 animate-spin" /> Generating…</>
                ) : (
                  <><FileText className="h-4 w-4" /> Generate SED</>
                )}
              </button>

              {generating && (
                <p className="text-xs text-gray-400 text-center">
                  Building document with all {validation.total} indicators, domain judgements
                  {options.includePlan ? ', improvement plan' : ''}
                  {options.includeQuantitative ? ', and quantitative data' : ''}…
                </p>
              )}

              {genError && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-800">Generation failed</p>
                    <p className="text-xs text-red-600 mt-0.5">{genError}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Previously Generated SEDs ──────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold font-sans">Previously Generated SEDs</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="h-8 w-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No SEDs generated yet for {academicYear}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {history.map((doc) => {
                const j = doc.overall_judgement_snapshot as JudgementLevel | null;
                return (
                  <div key={doc.id} className="flex items-center gap-4 py-3">
                    <FileText className="h-5 w-5 text-[#01696f] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(doc.generated_at).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'long', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {j != null && (
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: `${JUDGEMENT_COLORS[j]}15`,
                              color: JUDGEMENT_COLORS[j],
                              border: `1px solid ${JUDGEMENT_COLORS[j]}40`,
                            }}
                          >
                            {JUDGEMENT_LABELS[j]}
                          </span>
                        )}
                        {doc.file_size_bytes != null && (
                          <span className="text-xs text-gray-400">{(doc.file_size_bytes / 1024).toFixed(0)} KB</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => void downloadHistoryFile(doc)}
                      disabled={downloadingId === doc.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors shrink-0"
                    >
                      {downloadingId === doc.id
                        ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        : <Download className="h-3.5 w-3.5" />}
                      Download
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

