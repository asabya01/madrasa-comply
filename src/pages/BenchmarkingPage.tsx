import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Line,
} from 'recharts';
import {
  BarChart3, Loader2, ChevronDown, ChevronUp,
  Camera, Sparkles,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { usePermissions } from '../hooks/usePermissions';
import { useToast } from '../components/ui/toast';
import { useAcademicYears } from '../hooks/useAcademicYears';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';

// ─── Types ────────────────────────────────────────────────────

interface BenchmarkSnapshot {
  id: string;
  school_id: string;
  academic_year: string;
  domain_scores: Record<string, number>;
  overall_score: number | null;
  obs_avg_rating: number | null;
  cpd_hours_total: number | null;
  appraisal_avg: number | null;
  snapshot_date: string;
  created_at: string;
}

interface AIInsight {
  id: string;
  insight_type: 'strengths' | 'improvement_areas' | 'peer_comparison' | 'recommended_actions';
  content: string;
  generated_at: string;
  model_version: string | null;
}

// ─── Constants ────────────────────────────────────────────────

const DOMAIN_AXES = [
  { key: '1', label: 'D1 Academic Achievement' },
  { key: '2', label: 'D2 Personal Development' },
  { key: '3', label: 'D3 Teaching & Assessment' },
  { key: '4', label: 'D4 School Climate' },
  { key: '5', label: 'D5 Leadership & Governance' },
];

// OAAAQA: 1=Outstanding (best), 4=Needs Improvement (worst)
// Radar chart: invert so higher = better visually
function invertScore(v: number | null | undefined): number {
  if (v == null) return 0;
  // clamp and invert: 1→4, 2→3, 3→2, 4→1, 0→0
  const c = Math.max(1, Math.min(4, v));
  return 5 - c;
}

// ─── Collapsible card ─────────────────────────────────────────

function CollapsibleCard({
  icon,
  title,
  children,
  generatedAt,
  modelVersion,
  defaultOpen = false,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
  generatedAt?: string;
  modelVersion?: string | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <span>{icon}</span> {title}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="p-4">
          {children}
          {(generatedAt || modelVersion) && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
              {generatedAt && (
                <span className="text-xs text-gray-400">
                  Generated {new Date(generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
              {modelVersion && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{modelVersion}</Badge>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="border border-gray-200 rounded-xl p-4 animate-pulse space-y-2">
      <div className="h-4 bg-gray-200 rounded w-1/3" />
      <div className="h-3 bg-gray-100 rounded w-full" />
      <div className="h-3 bg-gray-100 rounded w-4/5" />
    </div>
  );
}

// ─── Data hooks ───────────────────────────────────────────────

function useSnapshots(schoolId: string | undefined, year: string) {
  return useQuery<BenchmarkSnapshot[]>({
    queryKey: ['benchmark_snapshots', schoolId, year],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data, error } = await supabase
        .from('benchmark_snapshots')
        .select('*')
        .eq('school_id', schoolId)
        .eq('academic_year', year)
        .order('snapshot_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as BenchmarkSnapshot[];
    },
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 2,
  });
}

function useInsights(schoolId: string | undefined, year: string) {
  return useQuery<AIInsight[]>({
    queryKey: ['ai_insights', schoolId, year],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data, error } = await supabase
        .from('ai_insights')
        .select('*')
        .eq('school_id', schoolId)
        .eq('academic_year', year);
      if (error) throw error;
      return (data ?? []) as AIInsight[];
    },
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 2,
  });
}

// ─── Snapshot builder ─────────────────────────────────────────

async function buildSnapshot(schoolId: string, year: string): Promise<Omit<BenchmarkSnapshot, 'id' | 'created_at'>> {
  // Fetch all in parallel
  const [domainRes, obsRes, cpdRes, appraisalRes] = await Promise.all([
    supabase
      .from('domain_judgements')
      .select('domain_id, judgement')
      .eq('school_id', schoolId)
      .order('calculated_at', { ascending: false }),
    supabase
      .from('classroom_observations')
      .select('overall_rating')
      .eq('school_id', schoolId)
      .eq('obs_status', 'completed'),
    supabase
      .from('cpd_entries')
      .select('hours')
      .eq('school_id', schoolId)
      .eq('academic_year', year),
    supabase
      .from('appraisal_cycles')
      .select('overall_rating')
      .eq('school_id', schoolId)
      .eq('academic_year', year)
      .not('overall_rating', 'is', null),
  ]);

  // Latest domain judgement per domain (first row per domain_id after desc sort)
  const seenDomains = new Set<string>();
  const domainScores: Record<string, number> = {};
  for (const row of (domainRes.data ?? []) as Array<{ domain_id: string; judgement: number }>) {
    if (!seenDomains.has(row.domain_id)) {
      seenDomains.add(row.domain_id);
      domainScores[row.domain_id] = row.judgement;
    }
  }

  // Overall score: average of domain scores
  const domainVals = Object.values(domainScores);
  const overall_score = domainVals.length
    ? Number((domainVals.reduce((a, b) => a + b, 0) / domainVals.length).toFixed(2))
    : null;

  // Observation avg
  const obsRatings = (obsRes.data ?? [])
    .map((r: { overall_rating: number | null }) => r.overall_rating)
    .filter((v): v is number => v != null);
  const obs_avg_rating = obsRatings.length
    ? Number((obsRatings.reduce((a, b) => a + b, 0) / obsRatings.length).toFixed(2))
    : null;

  // CPD total
  const cpdTotal = (cpdRes.data ?? [])
    .reduce((sum: number, r: { hours: number }) => sum + Number(r.hours), 0);
  const cpd_hours_total = cpdTotal > 0 ? Number(cpdTotal.toFixed(1)) : null;

  // Appraisal avg
  const appraisalRatings = (appraisalRes.data ?? [])
    .map((r: { overall_rating: number | null }) => r.overall_rating)
    .filter((v): v is number => v != null);
  const appraisal_avg = appraisalRatings.length
    ? Number((appraisalRatings.reduce((a, b) => a + b, 0) / appraisalRatings.length).toFixed(2))
    : null;

  return {
    school_id: schoolId,
    academic_year: year,
    domain_scores: domainScores,
    overall_score,
    obs_avg_rating,
    cpd_hours_total,
    appraisal_avg,
    snapshot_date: new Date().toISOString().slice(0, 10),
  };
}

// ─── Page ─────────────────────────────────────────────────────

export default function BenchmarkingPage() {
  const { t } = useTranslation();
  const { school } = useSchoolStore();
  const { isSchoolAdmin, isSuperAdmin } = usePermissions();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const { years, currentYear } = useAcademicYears();

  const [yearFilter, setYearFilter] = useState('');
  const [snapshotting, setSnapshotting] = useState(false);
  const [generating, setGenerating] = useState(false);

  const resolvedYear =
    yearFilter ||
    currentYear?.label ||
    years[0]?.label ||
    String(new Date().getFullYear());

  const { data: snapshots = [], isLoading: snapsLoading } = useSnapshots(school?.id, resolvedYear);
  const { data: insights = [], isLoading: insightsLoading } = useInsights(school?.id, resolvedYear);

  const latestSnapshot = snapshots[snapshots.length - 1] ?? null;

  // Radar data
  const radarData = useMemo(() =>
    DOMAIN_AXES.map(axis => ({
      domain: axis.label,
      score: invertScore(latestSnapshot?.domain_scores[axis.key]),
      rawScore: latestSnapshot?.domain_scores[axis.key] ?? null,
    })),
    [latestSnapshot]
  );

  // Trend data (only when 2+ snapshots)
  const trendData = useMemo(() =>
    snapshots.map(s => ({
      date: s.snapshot_date,
      score: s.overall_score != null ? Number((5 - s.overall_score).toFixed(2)) : null,
    })).filter(d => d.score != null),
    [snapshots]
  );

  // Insight lookup
  const insightMap = useMemo(() => {
    const map: Partial<Record<AIInsight['insight_type'], AIInsight>> = {};
    for (const ins of insights) map[ins.insight_type] = ins;
    return map;
  }, [insights]);

  const hasInsights = insights.length > 0;

  // ── Handlers ─────────────────────────────────────────────────

  const handleSnapshot = async () => {
    if (!school?.id) return;
    setSnapshotting(true);
    try {
      const payload = await buildSnapshot(school.id, resolvedYear);
      const { error } = await supabase
        .from('benchmark_snapshots')
        .upsert(payload, { onConflict: 'school_id,academic_year,snapshot_date' });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['benchmark_snapshots', school.id, resolvedYear] });
      showToast('Snapshot saved', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Snapshot failed', 'error');
    } finally {
      setSnapshotting(false);
    }
  };

  const handleGenerateInsights = async () => {
    if (!school?.id) return;
    if (!latestSnapshot) {
      showToast('Take a snapshot first', 'error');
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-insights', {
        body: { school_id: school.id, academic_year: resolvedYear },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await qc.invalidateQueries({ queryKey: ['ai_insights', school.id, resolvedYear] });
      showToast('Insights generated', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Generation failed', 'error');
    } finally {
      setGenerating(false);
    }
  };

  // ── Render helpers ────────────────────────────────────────────

  function renderInsightContent(type: AIInsight['insight_type'], ins: AIInsight | undefined) {
    if (!ins) return null;
    if (type === 'peer_comparison') {
      return <p className="text-sm text-gray-700 leading-relaxed">{ins.content}</p>;
    }
    try {
      const items = JSON.parse(ins.content) as string[];
      if (type === 'recommended_actions') {
        return (
          <ol className="space-y-2">
            {items.map((item, i) => (
              <li key={i} className="flex gap-3 text-sm text-gray-700">
                <span className="shrink-0 w-5 h-5 rounded-full bg-[#01696f] text-white text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                {item}
              </li>
            ))}
          </ol>
        );
      }
      return (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700">
              <span className="text-[#01696f] shrink-0">•</span> {item}
            </li>
          ))}
        </ul>
      );
    } catch {
      return <p className="text-sm text-gray-700">{ins.content}</p>;
    }
  }

  const canManage = isSchoolAdmin || isSuperAdmin;

  return (
    <div className="min-h-screen bg-[#f7f6f2]">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">

        {/* Page header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-6 w-6 text-[#01696f]" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">{t('nav.benchmarking')}</h1>
              <p className="text-sm text-gray-500">{t('benchmarking.subtitle')}</p>
            </div>
          </div>
          <select
            value={yearFilter}
            onChange={e => setYearFilter(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#01696f]"
          >
            <option value="">{t('benchmarking.currentYear')}</option>
            {years.map(y => (
              <option key={y.id} value={y.label}>{y.label}</option>
            ))}
          </select>
        </div>

        {/* Main two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

          {/* ── LEFT: Your Performance ── */}
          <div className="space-y-5">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">{t('benchmarking.yourPerformance')} — {resolvedYear}</CardTitle>
                  {canManage && (
                    <button
                      onClick={handleSnapshot}
                      disabled={snapshotting}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#01696f] text-white rounded-lg text-xs font-medium hover:bg-[#015a5f] disabled:opacity-50 transition-colors"
                    >
                      {snapshotting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Camera className="h-3 w-3" />
                      )}
                      {snapshotting ? t('benchmarking.takingSnapshot') : t('benchmarking.takeSnapshot')}
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {snapsLoading ? (
                  <div className="h-56 flex items-center justify-center text-sm text-gray-400 animate-pulse">
                    Loading chart…
                  </div>
                ) : !latestSnapshot ? (
                  <div className="h-56 flex flex-col items-center justify-center text-center text-sm text-gray-400">
                    <BarChart3 className="h-10 w-10 text-gray-200 mb-2" />
                    <p className="font-medium text-gray-500">{t('benchmarking.noSnapshot')}</p>
                    <p className="text-xs mt-1">{t('benchmarking.noSnapshotHint')}</p>
                  </div>
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="#e5e7eb" />
                        <PolarAngleAxis
                          dataKey="domain"
                          tick={{ fontSize: 10, fill: '#6b7280' }}
                        />
                        <Radar
                          name="Score"
                          dataKey="score"
                          stroke="#01696f"
                          fill="#01696f"
                          fillOpacity={0.2}
                          dot={false}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-4">
              <StatCard
                label={t('benchmarking.overallScore')}
                value={latestSnapshot?.overall_score != null ? `${latestSnapshot.overall_score}/4` : '—'}
                sub={latestSnapshot?.overall_score != null
                  ? latestSnapshot.overall_score <= 1.5 ? t('judgements.outstanding')
                  : latestSnapshot.overall_score <= 2.5 ? t('judgements.good')
                  : latestSnapshot.overall_score <= 3.5 ? t('judgements.satisfactory')
                  : t('judgements.inadequate')
                  : undefined}
              />
              <StatCard
                label={t('benchmarking.obsAvgRating')}
                value={latestSnapshot?.obs_avg_rating != null ? `${latestSnapshot.obs_avg_rating}/4` : '—'}
              />
              <StatCard
                label={t('benchmarking.cpdHours')}
                value={latestSnapshot?.cpd_hours_total != null ? latestSnapshot.cpd_hours_total : '—'}
              />
              <StatCard
                label={t('benchmarking.appraisalAvg')}
                value={latestSnapshot?.appraisal_avg != null ? `${latestSnapshot.appraisal_avg}/4` : '—'}
              />
            </div>
          </div>

          {/* ── RIGHT: AI Insights ── */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">{t('benchmarking.aiInsights')}</CardTitle>
                  {canManage && (
                    <button
                      onClick={handleGenerateInsights}
                      disabled={generating || !latestSnapshot}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      title={!latestSnapshot ? 'Take a snapshot first' : undefined}
                    >
                      {generating ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      {generating ? t('benchmarking.generating') : t('benchmarking.generateInsights')}
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {insightsLoading ? (
                  <>
                    <SkeletonCard />
                    <SkeletonCard />
                  </>
                ) : !hasInsights ? (
                  <div className="border border-dashed border-gray-300 rounded-xl p-6 text-center text-sm text-gray-400">
                    <Sparkles className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                    <p className="font-medium text-gray-500">{t('benchmarking.noInsights')}</p>
                    <p className="text-xs mt-1 max-w-xs mx-auto">
                      {t('benchmarking.noInsightsHint')}
                    </p>
                  </div>
                ) : (
                  <>
                    <CollapsibleCard
                      icon="✅"
                      title={t('benchmarking.strengths')}
                      defaultOpen
                      generatedAt={insightMap.strengths?.generated_at}
                      modelVersion={insightMap.strengths?.model_version}
                    >
                      {renderInsightContent('strengths', insightMap.strengths)}
                    </CollapsibleCard>
                    <CollapsibleCard
                      icon="⚠️"
                      title={t('benchmarking.improvementAreas')}
                      generatedAt={insightMap.improvement_areas?.generated_at}
                      modelVersion={insightMap.improvement_areas?.model_version}
                    >
                      {renderInsightContent('improvement_areas', insightMap.improvement_areas)}
                    </CollapsibleCard>
                    <CollapsibleCard
                      icon="📊"
                      title={t('benchmarking.peerComparison')}
                      generatedAt={insightMap.peer_comparison?.generated_at}
                      modelVersion={insightMap.peer_comparison?.model_version}
                    >
                      {renderInsightContent('peer_comparison', insightMap.peer_comparison)}
                    </CollapsibleCard>
                    <CollapsibleCard
                      icon="🎯"
                      title={t('benchmarking.recommendedActions')}
                      generatedAt={insightMap.recommended_actions?.generated_at}
                      modelVersion={insightMap.recommended_actions?.model_version}
                    >
                      {renderInsightContent('recommended_actions', insightMap.recommended_actions)}
                    </CollapsibleCard>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── BOTTOM: Performance Trend ── */}
        {trendData.length >= 2 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{t('benchmarking.performanceTrend')} — {resolvedYear}</CardTitle>
              <p className="text-xs text-gray-400 mt-0.5">Higher = better (inverted from 1–4 scale)</p>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      tickFormatter={v => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    />
                    <YAxis
                      domain={[0, 4]}
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      tickCount={5}
                    />
                    <Tooltip
                      formatter={(v) => [Number(v).toFixed(2), 'Score (inverted)']}
                      labelFormatter={l => new Date(l as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#01696f"
                      strokeWidth={2}
                      dot={{ fill: '#01696f', r: 3 }}
                      activeDot={{ r: 5 }}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Snapshot history (only show when multiple exist) */}
        {snapshots.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('benchmarking.snapshotHistory')}</h2>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-5 py-3">{t('observations.date')}</th>
                    <th className="text-left px-4 py-3">{t('benchmarking.overallScore')}</th>
                    <th className="text-left px-4 py-3">{t('benchmarking.obsAvgRating')}</th>
                    <th className="text-left px-4 py-3">{t('benchmarking.cpdHours')}</th>
                    <th className="text-left px-4 py-3">{t('benchmarking.appraisalAvg')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...snapshots].reverse().map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{s.snapshot_date}</td>
                      <td className="px-4 py-3 text-gray-600">{s.overall_score ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{s.obs_avg_rating ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{s.cpd_hours_total ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{s.appraisal_avg ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
