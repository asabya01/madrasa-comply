import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Download, RefreshCw, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { usePermissions } from '../hooks/usePermissions';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { JUDGEMENT_LABELS, type JudgementLevel } from '../lib/judgement';

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

interface GenerateResult {
  url: string;
  filePath: string;
  fileSizeBytes: number;
  overallJudgement: number | null;
}

// ─── Readiness check ──────────────────────────────────────────

interface ReadinessCheck {
  rated: number;
  total: number;
  pct: number;
  ready: boolean;
}

function useReadiness(): ReadinessCheck {
  const { school, academicYear } = useSchoolStore();
  const { data: ratings } = useQuery({
    queryKey: ['all-ratings-judgements', school?.id, academicYear],
    queryFn: async () => {
      if (!school) return [];
      const { data } = await supabase
        .from('indicator_ratings')
        .select('indicator_id')
        .eq('school_id', school.id)
        .eq('academic_year', academicYear);
      return data ?? [];
    },
    enabled: !!school,
  });
  const { data: indicators } = useQuery({
    queryKey: ['indicators-full'],
    queryFn: async () => {
      const { data } = await supabase.from('indicators').select('id');
      return data ?? [];
    },
    staleTime: 1000 * 60 * 60,
  });

  const rated = ratings?.length ?? 0;
  const total = indicators?.length ?? 56;
  const pct = total > 0 ? Math.round((rated / total) * 100) : 0;
  return { rated, total, pct, ready: rated >= total && total > 0 };
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
  const readiness = useReadiness();
  const { data: history = [], refetch: refetchHistory } = useSEDHistory();

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canGenerate = isSchoolAdmin || isSuperAdmin;

  async function handleGenerate() {
    if (!school || !canGenerate) return;
    setGenerating(true);
    setResult(null);
    setError(null);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('generate-sed', {
        body: { schoolId: school.id, academicYear },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      setResult(data as GenerateResult);
      void refetchHistory();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function getSignedUrl(filePath: string): Promise<string | null> {
    const { data } = await supabase.storage
      .from('sed-documents')
      .createSignedUrl(filePath, 3600);
    return data?.signedUrl ?? null;
  }

  async function downloadHistoryFile(filePath: string) {
    const url = await getSignedUrl(filePath);
    if (url) window.open(url, '_blank');
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

      {/* ── Readiness card ─────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold font-sans">Generation Readiness</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ReadinessRow
            label="Indicator ratings entered"
            value={`${readiness.rated} / ${readiness.total}`}
            done={readiness.ready}
            note={!readiness.ready ? `${readiness.total - readiness.rated} indicators still unrated` : undefined}
          />
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${readiness.pct}%`,
                backgroundColor: readiness.ready ? '#437a22' : readiness.pct >= 50 ? '#d19900' : '#da7101',
              }}
            />
          </div>
          <p className="text-xs text-gray-400">
            {readiness.ready
              ? 'All indicators rated — the SED will include complete evaluation data.'
              : 'You can still generate the SED with partial data; unrated indicators will show "Not rated".'}
          </p>
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
                    Produces a three-section Word document: School Profile, Domain-by-Domain Ratings &amp; Evidence, and Improvement Plan Summary.
                  </p>
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating}
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
                  Building document with all 56 indicators, domain judgements, and improvement plan…
                </p>
              )}

              {/* Success */}
              {result && (
                <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-green-800">SED generated successfully</p>
                    <p className="text-xs text-green-600 mt-0.5">
                      {(result.fileSizeBytes / 1024).toFixed(0)} KB
                      {result.overallJudgement != null && ` · Overall: ${JUDGEMENT_LABELS[result.overallJudgement as JudgementLevel]}`}
                    </p>
                  </div>
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-700 text-white text-sm font-medium rounded-lg hover:bg-green-800 transition-colors shrink-0"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </a>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-800">Generation failed</p>
                    <p className="text-xs text-red-600 mt-0.5">{error}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── History table ──────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold font-sans">Generation History</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="h-8 w-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No SEDs generated yet for {academicYear}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {history.map((doc) => (
                <div key={doc.id} className="flex items-center gap-4 py-3">
                  <FileText className="h-5 w-5 text-[#01696f] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(doc.generated_at).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'long', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {doc.overall_judgement_snapshot != null && (
                        <>Overall: {JUDGEMENT_LABELS[doc.overall_judgement_snapshot as JudgementLevel]} · </>
                      )}
                      {doc.file_size_bytes != null && `${(doc.file_size_bytes / 1024).toFixed(0)} KB`}
                    </p>
                  </div>
                  <button
                    onClick={() => void downloadHistoryFile(doc.file_path)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors shrink-0"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Readiness row ────────────────────────────────────────────

function ReadinessRow({
  label,
  value,
  done,
  note,
}: {
  label: string;
  value: string;
  done: boolean;
  note?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {done
        ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
      <span className="text-sm text-gray-700 flex-1">{label}</span>
      <span className={`text-sm font-medium ${done ? 'text-green-700' : 'text-amber-700'}`}>{value}</span>
      {note && <span className="text-xs text-gray-400 ml-1">({note})</span>}
    </div>
  );
}
