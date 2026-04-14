import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, ExternalLink, ChevronDown, ChevronRight, Share2, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { KPICards } from '../components/dashboard/KPICards';
import { DomainRadar } from '../components/dashboard/DomainRadar';
import { EvidenceHeatmap } from '../components/dashboard/EvidenceHeatmap';
import { ActionItemsWidget } from '../components/dashboard/ActionItemsWidget';
import { ComplianceTrend } from '../components/dashboard/ComplianceTrend';
import { DomainProgressBar } from '../components/dashboard/DomainProgressBar';
import { JudgementBadge } from '../components/ui/judgement-badge';
import { PreReviewChecklist } from '../components/PreReviewChecklist';
import { useJudgements } from '../hooks/useJudgements';
import { useSchoolStore } from '../stores/schoolStore';
import { usePermissions } from '../hooks/usePermissions';
import { supabase } from '../lib/supabase';
import { JUDGEMENT_COLORS, JUDGEMENT_LABELS_SHORT, type JudgementLevel } from '../lib/judgement';

const DOMAIN_NAMES: Record<string, { en: string; ar: string }> = {
  '1': { en: 'Academic Achievement',   ar: 'الإنجاز الدراسي' },
  '2': { en: 'Personal Development',   ar: 'النمو الشخصي' },
  '3': { en: 'Teaching & Assessment',  ar: 'التدريس والتقويم' },
  '4': { en: 'School Climate',         ar: 'مناخ المدرسة' },
  '5': { en: 'Leadership & Gov.',      ar: 'القيادة والحوكمة' },
};

// ─── Staff Performance Overview (admin/HOD only) ─────────────

interface TeacherStat {
  user_id: string;
  full_name: string | null;
  email: string | null;
  class_count: number;
  classes: Array<{ id: string; label: string; subject: string }>;
  ratings: Array<{ indicator_id: string; rating: number | null; submitted_at: string | null }>;
  avg_rating: number | null;
  last_submission: string | null;
}

function useStaffPerformance(schoolId: string | undefined, enabled: boolean, subjectFilter?: string | null) {
  return useQuery({
    queryKey: ['staff-performance', schoolId, subjectFilter],
    queryFn: async () => {
      if (!schoolId) return [] as TeacherStat[];

      let classesQuery = supabase
        .from('classes')
        .select('id, label, subject, teacher_id')
        .eq('school_id', schoolId);
      if (subjectFilter) classesQuery = classesQuery.eq('subject', subjectFilter);

      const [teachersRes, classesRes] = await Promise.all([
        supabase
          .from('school_members')
          .select('user_id, profiles:profiles!school_members_user_id_fkey(full_name, email)')
          .eq('school_id', schoolId)
          .eq('role', 'teacher')
          .eq('status', 'active'),
        classesQuery,
      ]);

      const classes = (classesRes.data ?? []) as Array<{ id: string; label: string; subject: string; teacher_id: string | null }>;
      const classIds = classes.map(c => c.id);

      const ratingsRes = classIds.length
        ? await supabase
            .from('teacher_indicator_ratings')
            .select('teacher_id, indicator_id, rating, submitted_at')
            .in('class_id', classIds)
        : { data: [] };

      const allRatings = (ratingsRes.data ?? []) as Array<{
        teacher_id: string;
        indicator_id: string;
        rating: number | null;
        submitted_at: string | null;
      }>;

      return ((teachersRes.data ?? []) as Array<{ user_id: string; profiles: unknown }>).map(t => {
        const p = (Array.isArray(t.profiles) ? t.profiles[0] : t.profiles) as
          | { full_name?: string; email?: string } | null;
        const teacherClasses = classes.filter(c => c.teacher_id === t.user_id);
        const teacherRatings = allRatings.filter(r => r.teacher_id === t.user_id && r.rating != null);
        const avgRating = teacherRatings.length
          ? teacherRatings.reduce((s, r) => s + (r.rating ?? 0), 0) / teacherRatings.length
          : null;
        const lastSub = teacherRatings
          .filter(r => r.submitted_at)
          .sort((a, b) => new Date(b.submitted_at!).getTime() - new Date(a.submitted_at!).getTime())[0]
          ?.submitted_at ?? null;
        return {
          user_id:         t.user_id,
          full_name:       p?.full_name  ?? null,
          email:           p?.email      ?? null,
          class_count:     teacherClasses.length,
          classes:         teacherClasses,
          ratings:         teacherRatings,
          avg_rating:      avgRating != null ? Math.round(avgRating * 10) / 10 : null,
          last_submission: lastSub,
        } satisfies TeacherStat;
      });
    },
    enabled: !!schoolId && enabled,
    staleTime: 1000 * 60 * 2,
  });
}

function RatingPill({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-xs text-gray-400">No data</span>;
  const level = Math.round(rating) as JudgementLevel;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full text-white"
      style={{ backgroundColor: JUDGEMENT_COLORS[level] }}
    >
      {rating.toFixed(1)} · {JUDGEMENT_LABELS_SHORT[level]}
    </span>
  );
}

function StaffPerformanceOverview({ schoolId, subjectFilter }: { schoolId: string; subjectFilter?: string | null }) {
  const { data: staff, isLoading } = useStaffPerformance(schoolId, true, subjectFilter);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [d3Indicators, setD3Indicators] = useState<Array<{ id: string; description_en: string }>>([]);
  const loadIndicators = async () => {
    if (d3Indicators.length) return;
    const { data } = await supabase.from('indicators').select('id, description_en').eq('domain_id', '3').order('id');
    if (data) setD3Indicators(data);
  };

  function toggle(userId: string) {
    if (expandedId !== userId) void loadIndicators();
    setExpandedId(prev => prev === userId ? null : userId);
  }

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg" />)}
      </div>
    );
  }
  if (!staff?.length) {
    return <p className="text-sm text-gray-400 py-4 text-center">No teachers with submitted assessments yet.</p>;
  }

  return (
    <div className="divide-y divide-gray-100">
      {staff.map(t => {
        const isExpanded = expandedId === t.user_id;
        const indMap = Object.fromEntries(t.ratings.map(r => [r.indicator_id, r.rating]));
        return (
          <div key={t.user_id}>
            <button
              onClick={() => toggle(t.user_id)}
              className="w-full flex items-center gap-3 px-1 py-3 hover:bg-gray-50 rounded-lg text-left transition-colors"
            >
              {isExpanded
                ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{t.full_name ?? t.email ?? 'Unknown'}</p>
                <p className="text-xs text-gray-400">{t.class_count} class{t.class_count !== 1 ? 'es' : ''}</p>
              </div>
              <div className="shrink-0 text-center w-28">
                <RatingPill rating={t.avg_rating} />
              </div>
              <div className="shrink-0 text-xs text-gray-400 w-32 text-right">
                {t.last_submission
                  ? new Date(t.last_submission).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                  : '—'}
              </div>
            </button>

            {isExpanded && (
              <div className="ml-7 mb-3 bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                {d3Indicators.length ? (
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium text-gray-500">Indicator</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-500">Description</th>
                        <th className="text-center px-4 py-2 font-medium text-gray-500">Rating</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {d3Indicators.map(ind => {
                        const r = indMap[ind.id];
                        const level = r != null ? (r as JudgementLevel) : null;
                        return (
                          <tr key={ind.id} className="hover:bg-gray-50/50">
                            <td className="px-4 py-2 font-mono font-bold text-gray-400">{ind.id}</td>
                            <td className="px-4 py-2 text-gray-600 max-w-xs">
                              <p className="line-clamp-2">{ind.description_en}</p>
                            </td>
                            <td className="px-4 py-2 text-center">
                              {level != null ? (
                                <span
                                  className="inline-flex w-6 h-6 items-center justify-center rounded text-white text-xs font-bold"
                                  style={{ backgroundColor: JUDGEMENT_COLORS[level] }}
                                >
                                  {r}
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="px-4 py-3 text-xs text-gray-400">Loading indicators…</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export function DashboardPage() {
  const { school, profile, academicYear } = useSchoolStore();
  const { judgements, isLoading } = useJudgements();
  const { isSchoolAdmin, isSuperAdmin, isHOD } = usePermissions();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const [shareCopied, setShareCopied] = useState(false);

  function handleSharePublic() {
    if (!school) return;
    const url = `${window.location.origin}/public/${school.id}`;
    void navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    });
  }

  // All hooks must be declared before any early return (Rules of Hooks)
  const { data: evidenceCount } = useQuery({
    queryKey: ['evidence-count', school?.id],
    queryFn: async () => {
      if (!school) return 0;
      const { count } = await supabase
        .from('evidence_files')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', school.id);
      return count || 0;
    },
    enabled: !!school,
  });

  const { data: actionStats } = useQuery({
    queryKey: ['action-stats', school?.id],
    queryFn: async () => {
      if (!school) return { pending: 0, total: 0, overdue: 0 };
      const { data } = await supabase
        .from('action_items')
        .select('status')
        .eq('school_id', school.id);
      const items = data || [];
      return {
        total: items.length,
        pending: items.filter((i) => ['not_started', 'in_progress'].includes(i.status)).length,
        overdue: items.filter((i) => i.status === 'overdue').length,
      };
    },
    enabled: !!school,
  });

  const { data: auditSettings } = useQuery({
    queryKey: ['audit-settings', school?.id],
    queryFn: async () => {
      if (!school) return null;
      const { data } = await supabase
        .from('audit_settings')
        .select('*')
        .eq('school_id', school.id)
        .maybeSingle();
      return data;
    },
    enabled: !!school,
  });

  const { data: nearestFollowUp } = useQuery({
    queryKey: ['dashboard-followup-deadline', school?.id],
    queryFn: async () => {
      if (!school) return null;
      const { data } = await supabase
        .from('review_visits')
        .select('overall_judgement, followup_deadline, visit_date')
        .eq('school_id', school.id)
        .not('followup_deadline', 'is', null)
        .order('followup_deadline', { ascending: true })
        .limit(1)
        .maybeSingle();
      return data as { overall_judgement: number; followup_deadline: string; visit_date: string } | null;
    },
    enabled: !!school,
  });

  // Early return AFTER all hooks
  if (!school) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-[#6b7280]">Loading school data…</div>
      </div>
    );
  }

  const daysUntilAudit = auditSettings?.expected_audit_date
    ? Math.ceil((new Date(auditSettings.expected_audit_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-32 bg-white rounded-lg border border-[#e2e0db] animate-pulse" />
        ))}
      </div>
    );
  }

  const overallJudgement = (judgements?.overall || 3) as JudgementLevel;

  // Academic year mismatch check
  const today = new Date();
  const yearStart = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
  const expectedLabel = `${yearStart}-${yearStart + 1}`;
  const academicYearMismatch = academicYear !== expectedLabel;

  // Subscription expiry check
  const subscriptionExpiresAt = (school as unknown as { subscription_expires_at?: string | null })?.subscription_expires_at ?? null;
  const subscriptionTier = school?.subscription_tier ?? '';
  const isTrial = subscriptionTier === 'trial';
  const isExpired = subscriptionExpiresAt
    ? new Date(subscriptionExpiresAt).getTime() < Date.now()
    : false;
  const daysUntilExpiry = subscriptionExpiresAt
    ? Math.ceil((new Date(subscriptionExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const showTrialWarning = isTrial && !isExpired && daysUntilExpiry !== null && daysUntilExpiry <= 14;

  return (
    <div className="space-y-6">
      {/* Subscription expired banner */}
      {isExpired && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg border bg-red-900 border-red-900 text-white">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-white" />
          <div className="flex-1">
            <p className="text-sm font-semibold">
              {t('banners.expired', {
                date: subscriptionExpiresAt
                  ? new Date(subscriptionExpiresAt).toLocaleDateString(i18n.language === 'ar' ? 'ar-OM' : 'en-GB')
                  : '',
              })}
            </p>
            <p className="text-xs mt-0.5 text-red-200">
              <a
                href="mailto:hello@asabya.com?subject=Madrasa Comply Renewal - Subscription expired"
                className="underline text-white font-semibold"
              >
                {t('banners.renewNow')} →
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Trial expiry warning banner */}
      {showTrialWarning && !isExpired && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg border bg-amber-50 border-amber-200 text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
          <div className="flex-1">
            <p className="text-sm font-semibold">
              {t('banners.trialWarning', { days: daysUntilExpiry ?? 0 })}
            </p>
            <p className="text-xs mt-0.5 text-amber-700">
              <a
                href="mailto:hello@asabya.com?subject=Madrasa Comply Upgrade - Please advise on pricing"
                className="underline font-semibold text-amber-900"
              >
                {t('banners.upgradePlan')} →
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Academic year mismatch banner — school admin / principal only */}
      {(isSchoolAdmin || isSuperAdmin) && academicYearMismatch && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg border bg-amber-50 border-amber-200 text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
          <div className="flex-1">
            <p className="text-sm font-semibold">
              Your academic year may need updating.
            </p>
            <p className="text-xs mt-0.5 text-amber-700">
              Current year shows <strong>{academicYear}</strong>, but the expected Oman school year is <strong>{expectedLabel}</strong>.
              Contact your school admin or update in{' '}
              <Link to="/settings" className="underline">Settings</Link>.
            </p>
          </div>
        </div>
      )}

      {/* Share Public Summary — school admin only */}
      {(isSchoolAdmin || isSuperAdmin) && (
        <div className="flex justify-end">
          <button
            onClick={handleSharePublic}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#01696f] border border-[#01696f]/30 rounded-lg hover:bg-[#01696f]/5 transition-colors"
          >
            <Share2 className="h-3.5 w-3.5" />
            {shareCopied ? t('dashboard.publicLinkCopied') : t('dashboard.sharePublicSummary')}
          </button>
        </div>
      )}

      {/* Follow-up visit banner */}
      {nearestFollowUp?.followup_deadline && (() => {
        const days = Math.ceil(
          (new Date(nearestFollowUp.followup_deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        const overdue = days < 0;
        const critical = !overdue && days < 90;
        return (
          <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${
            overdue  ? 'bg-red-900 border-red-900 text-white' :
            critical ? 'bg-red-50 border-red-200 text-red-800' :
                       'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${overdue ? 'text-white' : critical ? 'text-red-500' : 'text-amber-500'}`} />
            <div className="flex-1">
              <p className="text-sm font-semibold">
                {overdue
                  ? `OVERDUE — Follow-up visit was due ${new Date(nearestFollowUp.followup_deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
                  : `Follow-up visit required by ${new Date(nearestFollowUp.followup_deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`}
              </p>
              <p className={`text-xs mt-0.5 ${overdue ? 'text-white/80' : critical ? 'text-red-600' : 'text-amber-700'}`}>
                {overdue ? `${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} overdue` : `${days} day${days !== 1 ? 's' : ''} remaining`}
              </p>
            </div>
            <Link to="/review-visits" className={`text-xs underline shrink-0 ${overdue ? 'text-white/80' : ''}`}>
              View
            </Link>
          </div>
        );
      })()}

      {/* Audit countdown */}
      {daysUntilAudit !== null ? (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${
          daysUntilAudit <= 30 ? 'bg-red-50 border-red-200 text-red-800' :
          daysUntilAudit <= 90 ? 'bg-amber-50 border-amber-200 text-amber-800' :
          'bg-[#e6f2f8] border-[#006494]/20 text-[#006494]'
        }`}>
          <Calendar className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">
            {daysUntilAudit > 0
              ? t('dashboard.daysUntilAudit', { count: daysUntilAudit })
              : t('dashboard.auditDatePassed')}
          </span>
          <Link to="/audit-prep" className="ml-auto text-xs underline flex items-center gap-1">
            View preparation <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-[#e2e0db] bg-white">
          <Calendar className="h-5 w-5 text-[#6b7280] shrink-0" />
          <span className="text-sm text-[#6b7280]">{t('dashboard.noAuditDate')}</span>
          <Link to="/audit-prep" className="ml-auto text-xs text-[#01696f] underline flex items-center gap-1 font-medium">
            {t('dashboard.setAuditDate')} <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* KPI Cards */}
      <KPICards
        overallJudgement={overallJudgement}
        ratedCount={judgements?.ratedCount || 0}
        totalCount={judgements?.totalCount || 0}
        evidenceCount={evidenceCount || 0}
        pendingActions={actionStats?.pending || 0}
        totalActions={actionStats?.total || 0}
        overdueActions={actionStats?.overdue || 0}
      />

      {/* Domain progress */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold font-sans">{t('dashboard.selfEvalProgress')}</CardTitle>
            <span className="text-xs text-[#6b7280]">{t('dashboard.indicatorsRated', { rated: judgements?.ratedCount || 0, total: judgements?.totalCount || 0 })}</span>
          </div>
        </CardHeader>
        <CardContent>
          <DomainProgressBar domainJudgements={(judgements?.domains || {}) as Record<string, JudgementLevel>} />
        </CardContent>
      </Card>

      {/* Pre-Review Readiness Checklist — school admin + super admin only */}
      {(isSchoolAdmin || isSuperAdmin) && <PreReviewChecklist />}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold font-sans">{t('dashboard.domainComplianceRadar')}</CardTitle>
          </CardHeader>
          <CardContent>
            <DomainRadar domainJudgements={(judgements?.domains || {}) as Record<string, JudgementLevel>} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold font-sans">{t('dashboard.complianceTrend')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ComplianceTrend />
          </CardContent>
        </Card>
      </div>

      {/* Domain summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold font-sans">{t('dashboard.domainJudgements')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {Object.entries(DOMAIN_NAMES).map(([id, names]) => {
              const level = ((judgements?.domains as Record<string, JudgementLevel> || {})[id] || 3) as JudgementLevel;
              return (
                <Link key={id} to={`/domains/${id}`} className="block">
                  <div className="p-3 rounded-lg border border-[#e2e0db] hover:border-[#01696f] transition-colors">
                    <div className="text-xs text-[#6b7280] mb-1">{t('dashboard.domain')} {id}</div>
                    <div className="text-sm font-medium text-[#1a1a1a] mb-2 leading-tight">{isAr ? names.ar : names.en}</div>
                    <JudgementBadge level={level} size="sm" />
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold font-sans">{t('dashboard.evidenceCoverage')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <EvidenceHeatmap />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold font-sans">{t('dashboard.topActionItems')}</CardTitle>
              <Link to="/improvement-plan" className="text-xs text-[#01696f] hover:underline">{t('dashboard.viewAll')}</Link>
            </div>
          </CardHeader>
          <CardContent>
            <ActionItemsWidget />
          </CardContent>
        </Card>
      </div>

      {/* Staff Performance Overview — admin / HOD only */}
      {(isSchoolAdmin || isHOD) && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold font-sans">{t('dashboard.staffPerformance')}</CardTitle>
              <span className="text-xs text-gray-400">
                Domain 3 — Teaching & Assessment
                {isHOD && profile?.department ? ` · ${profile.department}` : ''}
              </span>
            </div>
            {/* Column headers */}
            <div className="flex items-center gap-3 px-5 pt-2 text-xs font-medium text-gray-400">
              <span className="w-4 shrink-0" />
              <span className="flex-1">Teacher</span>
              <span className="w-28 text-center">Avg Rating</span>
              <span className="w-32 text-right">Last Submission</span>
            </div>
          </CardHeader>
          <CardContent>
            <StaffPerformanceOverview
              schoolId={school.id}
              subjectFilter={isHOD && !isSchoolAdmin ? profile?.department : null}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
