import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar, AlertTriangle, Clock, CheckCircle2,
  FileText, RefreshCw, ChevronUp,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { useToast } from '../components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { JUDGEMENT_LABELS, JUDGEMENT_COLORS, type JudgementLevel } from '../lib/judgement';

// ─── Types ────────────────────────────────────────────────────

interface ReviewVisit {
  id: string;
  school_id: string;
  visit_date: string;
  visit_type: 'external_review' | 'follow_up_1' | 'follow_up_2';
  overall_judgement: JudgementLevel;
  domain_judgements_json: Record<string, number> | null;
  reviewer_recommendations: string | null;
  followup_deadline: string | null;
  created_at: string;
}

interface ProgressReport {
  id: string;
  review_visit_id: string;
  file_path: string | null;
  generated_at: string | null;
}

interface DomainContent {
  actionsTaken: string;
  evidenceSummary: string;
  currentJudgement: number | null;
}

interface ReportForm {
  domains: Record<string, DomainContent>;
  summaryEn: string;
  summaryAr: string;
}

const VISIT_TYPE_LABELS: Record<string, string> = {
  external_review: 'External Review',
  follow_up_1:      'Follow-Up Visit 1',
  follow_up_2:      'Follow-Up Visit 2',
};

const DOMAIN_NAMES: Record<string, string> = {
  '1': 'Academic Achievement',
  '2': 'Personal Development',
  '3': 'Teaching and Assessment',
  '4': 'School Climate',
  '5': 'Leadership and Governance',
};

// ─── Helpers ──────────────────────────────────────────────────

function calcDeadline(visitDate: string, judgement: number): string | null {
  const d = new Date(visitDate);
  if (judgement === 5) { d.setMonth(d.getMonth() + 12); return d.toISOString().split('T')[0]; }
  if (judgement === 4) { d.setMonth(d.getMonth() + 24); return d.toISOString().split('T')[0]; }
  return null;
}

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── Page ─────────────────────────────────────────────────────

export default function ReviewVisitsPage() {
  const { school } = useSchoolStore();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // ── Queries ──────────────────────────────────────────────────
  const { data: visits = [] } = useQuery({
    queryKey: ['review-visits', school?.id],
    queryFn: async () => {
      if (!school) return [] as ReviewVisit[];
      const { data, error } = await supabase
        .from('review_visits')
        .select('*')
        .eq('school_id', school.id)
        .order('visit_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReviewVisit[];
    },
    enabled: !!school,
  });

  const { data: progressReports = [] } = useQuery({
    queryKey: ['progress-reports', school?.id],
    queryFn: async () => {
      if (!school) return [] as ProgressReport[];
      const { data, error } = await supabase
        .from('progress_reports')
        .select('id, review_visit_id, file_path, generated_at')
        .eq('school_id', school.id);
      if (error) throw error;
      return (data ?? []) as ProgressReport[];
    },
    enabled: !!school,
  });

  const reportByVisit = useMemo(
    () => Object.fromEntries(progressReports.map((r) => [r.review_visit_id, r])),
    [progressReports]
  );

  // ── Follow-up banner data ─────────────────────────────────────
  const deadlineVisits = visits.filter((v) => v.followup_deadline != null);
  const nearestDeadline = deadlineVisits.sort(
    (a, b) => new Date(a.followup_deadline!).getTime() - new Date(b.followup_deadline!).getTime()
  )[0];

  // ── Record visit form ─────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [visitDate, setVisitDate] = useState('');
  const [visitType, setVisitType] = useState<ReviewVisit['visit_type']>('external_review');
  const [overallJ, setOverallJ] = useState<number>(3);
  const [domainJs, setDomainJs] = useState<Record<string, number>>({ '1': 3, '2': 3, '3': 3, '4': 3, '5': 3 });
  const [recommendations, setRecommendations] = useState('');

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!school || !visitDate) throw new Error('Missing required fields');
      const deadline = calcDeadline(visitDate, overallJ);
      const { error } = await supabase.from('review_visits').insert({
        school_id:                school.id,
        visit_date:               visitDate,
        visit_type:               visitType,
        overall_judgement:        overallJ,
        domain_judgements_json:   domainJs,
        reviewer_recommendations: recommendations || null,
        followup_deadline:       deadline,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      showToast('Review visit recorded', 'success');
      setFormOpen(false);
      setVisitDate(''); setRecommendations(''); setOverallJ(3);
      void queryClient.invalidateQueries({ queryKey: ['review-visits'] });
    },
    onError: (e) => showToast(e instanceof Error ? e.message : 'Save failed', 'error'),
  });

  // ── Progress report form state ────────────────────────────────
  const [reportVisitId, setReportVisitId] = useState<string | null>(null);
  const reportVisit = visits.find((v) => v.id === reportVisitId);

  const blankDomains: Record<string, DomainContent> = Object.fromEntries(
    ['1', '2', '3', '4', '5'].map((id) => [id, { actionsTaken: '', evidenceSummary: '', currentJudgement: null }])
  );
  const [reportForm, setReportForm] = useState<ReportForm>({ domains: blankDomains, summaryEn: '', summaryAr: '' });
  const [generatingReport, setGeneratingReport] = useState(false);

  function openReportForm(visitId: string) {
    setReportVisitId(visitId);
    setReportForm({ domains: blankDomains, summaryEn: '', summaryAr: '' });
  }

  function setDomainField(domainId: string, field: keyof DomainContent, value: string | number | null) {
    setReportForm((prev) => ({
      ...prev,
      domains: { ...prev.domains, [domainId]: { ...prev.domains[domainId], [field]: value } },
    }));
  }

  async function handleGenerateReport() {
    if (!school || !reportVisitId) return;
    setGeneratingReport(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('generate-progress-report', {
        body: { schoolId: school.id, reviewVisitId: reportVisitId, contentJson: reportForm },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error as string);
      window.open((data as { signedUrl: string }).signedUrl, '_blank');
      showToast('Progress report generated', 'success');
      setReportVisitId(null);
      void queryClient.invalidateQueries({ queryKey: ['progress-reports'] });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Generation failed', 'error');
    } finally {
      setGeneratingReport(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Review Visits</h1>
        <p className="text-sm text-gray-500 mt-1">
          Track external review visits, follow-up deadlines, and progress reports.
        </p>
      </div>

      {/* ── Section 2: Follow-up banner ─────────────────────── */}
      {nearestDeadline && <FollowUpBanner visit={nearestDeadline} />}

      {/* ── Section 1: Record Visit ──────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold font-sans">Record Visit</CardTitle>
            <button
              onClick={() => setFormOpen((o) => !o)}
              className="flex items-center gap-1.5 text-sm text-[#01696f] hover:text-[#0c4e54] font-medium"
            >
              {formOpen ? <><ChevronUp className="h-4 w-4" /> Hide</> : <><Calendar className="h-4 w-4" /> New Visit</>}
            </button>
          </div>
        </CardHeader>
        {formOpen && (
          <CardContent className="pt-0 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Visit Date">
                <input
                  type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#01696f]"
                />
              </Field>
              <Field label="Visit Type">
                <select value={visitType} onChange={(e) => setVisitType(e.target.value as ReviewVisit['visit_type'])} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#01696f]">
                  {Object.entries(VISIT_TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Overall Judgement">
              <JSelect value={overallJ} onChange={setOverallJ} />
            </Field>

            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Domain Judgements</p>
              <div className="grid grid-cols-5 gap-2">
                {(['1', '2', '3', '4', '5'] as const).map((id) => (
                  <div key={id}>
                    <p className="text-[10px] text-gray-400 mb-1 truncate">{DOMAIN_NAMES[id]}</p>
                    <JSelect value={domainJs[id] ?? 3} onChange={(v) => setDomainJs((d) => ({ ...d, [id]: v }))} />
                  </div>
                ))}
              </div>
            </div>

            <Field label="Reviewer Recommendations">
              <textarea
                value={recommendations}
                onChange={(e) => setRecommendations(e.target.value)}
                rows={4}
                placeholder="Key recommendations from the review team…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#01696f] resize-none"
              />
            </Field>

            {visitDate && overallJ >= 4 && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Follow-up deadline: <strong>{fmtDate(calcDeadline(visitDate, overallJ)!)}</strong>{' '}
                ({overallJ === 5 ? '12 months' : '24 months'} from visit date)
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => saveMutation.mutate()}
                disabled={!visitDate || saveMutation.isPending}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#01696f] text-white text-sm font-semibold rounded-xl hover:bg-[#0c4e54] disabled:opacity-60 transition-colors"
              >
                {saveMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
                Save Visit
              </button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Section 3: Annex 4 Progress Reports ─────────────── */}
      {deadlineVisits.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold font-sans">Annex 4 — Progress Reports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {deadlineVisits.map((v) => {
              const existing = reportByVisit[v.id];
              const days = daysUntil(v.followup_deadline!);
              return (
                <div key={v.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <FileText className="h-5 w-5 text-[#01696f] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {VISIT_TYPE_LABELS[v.visit_type]} — {fmtDate(v.visit_date)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Follow-up deadline: {fmtDate(v.followup_deadline!)} ·{' '}
                      <span className={days < 0 ? 'text-red-600 font-semibold' : days < 30 ? 'text-red-500' : 'text-amber-600'}>
                        {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d remaining`}
                      </span>
                    </p>
                    {existing?.generated_at && (
                      <p className="text-xs text-green-600 mt-0.5">
                        Last generated: {fmtDate(existing.generated_at)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => openReportForm(v.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-[#01696f] text-[#01696f] text-xs font-medium rounded-lg hover:bg-[#01696f]/5 transition-colors shrink-0"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {existing ? 'Regenerate' : 'Prepare Report'}
                  </button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Progress Report Form (modal-style inline) ─────────── */}
      {reportVisitId && reportVisit && (
        <Card className="border-[#01696f] ring-1 ring-[#01696f]/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold font-sans">
                Progress Report — {fmtDate(reportVisit.visit_date)}
              </CardTitle>
              <button onClick={() => setReportVisitId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
            </div>
            <div className="flex gap-3 mt-1 text-xs text-gray-500">
              <span>{school?.name_en}</span>
              <span>·</span>
              <span>Original: {JUDGEMENT_LABELS[reportVisit.overall_judgement as JudgementLevel]}</span>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            {/* Per-domain */}
            {(['1', '2', '3', '4', '5'] as const).map((domainId) => (
              <div key={domainId} className="border border-gray-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-900">
                  Domain {domainId}: {DOMAIN_NAMES[domainId]}
                </p>
                <Field label="Actions taken since review">
                  <textarea
                    value={reportForm.domains[domainId]?.actionsTaken ?? ''}
                    onChange={(e) => setDomainField(domainId, 'actionsTaken', e.target.value)}
                    rows={3} placeholder="Describe actions taken…" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#01696f] resize-none"
                  />
                </Field>
                <Field label="Evidence of improvement">
                  <textarea
                    value={reportForm.domains[domainId]?.evidenceSummary ?? ''}
                    onChange={(e) => setDomainField(domainId, 'evidenceSummary', e.target.value)}
                    rows={2} placeholder="Reference evidence files by name or describe evidence…" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#01696f] resize-none"
                  />
                </Field>
                <Field label="Current self-assessed judgement">
                  <JSelect
                    value={reportForm.domains[domainId]?.currentJudgement ?? 3}
                    onChange={(v) => setDomainField(domainId, 'currentJudgement', v)}
                  />
                </Field>
              </div>
            ))}

            {/* Overall narrative */}
            <Field label="Overall summary (English)">
              <textarea
                value={reportForm.summaryEn}
                onChange={(e) => setReportForm((f) => ({ ...f, summaryEn: e.target.value }))}
                rows={4} placeholder="Provide an overall summary of progress and improvements since the review…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#01696f] resize-none"
              />
            </Field>
            <Field label="الملخص العام (عربي)">
              <textarea
                value={reportForm.summaryAr}
                onChange={(e) => setReportForm((f) => ({ ...f, summaryAr: e.target.value }))}
                rows={4} dir="rtl" placeholder="قدّم ملخصاً شاملاً للتقدم المحرز منذ المراجعة…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#01696f] resize-none text-right"
              />
            </Field>

            <button
              onClick={() => void handleGenerateReport()}
              disabled={generatingReport}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#01696f] text-white text-sm font-semibold rounded-xl hover:bg-[#0c4e54] disabled:opacity-60 transition-colors"
            >
              {generatingReport
                ? <><RefreshCw className="h-4 w-4 animate-spin" /> Generating…</>
                : <><FileText className="h-4 w-4" /> Generate DOCX</>}
            </button>
          </CardContent>
        </Card>
      )}

      {/* ── Section 4: Past Visits ──────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold font-sans">Past Visits</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {visits.length === 0 ? (
            <div className="text-center py-10">
              <Calendar className="h-8 w-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No review visits recorded yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {visits.map((v) => {
                const j = v.overall_judgement as JudgementLevel;
                const existing = reportByVisit[v.id];
                return (
                  <div key={v.id} className="flex items-center gap-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900">{fmtDate(v.visit_date)}</p>
                        <span className="text-xs text-gray-500">{VISIT_TYPE_LABELS[v.visit_type]}</span>
                        <JudgementBadge level={j} />
                      </div>
                      {v.followup_deadline && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Follow-up deadline: {fmtDate(v.followup_deadline)}
                        </p>
                      )}
                    </div>
                    {existing && (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Report ready
                      </span>
                    )}
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

// ─── Follow-up Banner ─────────────────────────────────────────

function FollowUpBanner({ visit }: { visit: ReviewVisit }) {
  const days = daysUntil(visit.followup_deadline!);
  const overdue = days < 0;
  const critical = !overdue && days < 30;

  const bg    = overdue ? 'bg-red-900' : critical ? 'bg-red-50' : 'bg-amber-50';
  const text  = overdue ? 'text-white'  : critical ? 'text-red-800' : 'text-amber-800';
  const border = overdue ? '' : critical ? 'border border-red-200' : 'border border-amber-200';
  const Icon  = overdue ? AlertTriangle : critical ? AlertTriangle : Clock;
  const iconCls = overdue ? 'text-white' : critical ? 'text-red-500' : 'text-amber-500';

  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl ${bg} ${border}`}>
      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${iconCls}`} />
      <div>
        <p className={`text-sm font-semibold ${text}`}>
          {overdue
            ? `OVERDUE — Follow-up visit was required by ${fmtDate(visit.followup_deadline!)}`
            : `Follow-up visit required by ${fmtDate(visit.followup_deadline!)}`}
        </p>
        <p className={`text-xs mt-0.5 ${overdue ? 'text-white/80' : critical ? 'text-red-600' : 'text-amber-700'}`}>
          {overdue
            ? `${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} overdue — immediate action required`
            : `${days} day${days !== 1 ? 's' : ''} remaining`}
        </p>
      </div>
    </div>
  );
}

// ─── Small components ─────────────────────────────────────────

function JudgementBadge({ level }: { level: JudgementLevel }) {
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded-full"
      style={{
        backgroundColor: `${JUDGEMENT_COLORS[level]}15`,
        color: JUDGEMENT_COLORS[level],
        border: `1px solid ${JUDGEMENT_COLORS[level]}40`,
      }}
    >
      {JUDGEMENT_LABELS[level]}
    </span>
  );
}

function JSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#01696f]"
    >
      {([1, 2, 3, 4, 5] as JudgementLevel[]).map((j) => (
        <option key={j} value={j}>{j} — {JUDGEMENT_LABELS[j]}</option>
      ))}
    </select>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
