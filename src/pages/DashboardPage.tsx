import { useQuery } from '@tanstack/react-query';
import { Calendar, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { KPICards } from '../components/dashboard/KPICards';
import { DomainRadar } from '../components/dashboard/DomainRadar';
import { EvidenceHeatmap } from '../components/dashboard/EvidenceHeatmap';
import { ActionItemsWidget } from '../components/dashboard/ActionItemsWidget';
import { ComplianceTrend } from '../components/dashboard/ComplianceTrend';
import { JudgementBadge } from '../components/ui/judgement-badge';
import { useJudgements } from '../hooks/useJudgements';
import { useSchoolStore } from '../stores/schoolStore';
import { supabase } from '../lib/supabase';
import { type JudgementLevel } from '../lib/judgement';

const DOMAIN_NAMES: Record<string, string> = {
  '1': 'Academic Achievement',
  '2': 'Personal Development',
  '3': 'Teaching & Assessment',
  '4': 'School Climate',
  '5': 'Leadership & Governance',
};

export function DashboardPage() {
  const { school } = useSchoolStore();
  const { judgements, isLoading } = useJudgements();

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

  return (
    <div className="space-y-6">
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
              ? `${daysUntilAudit} days until OAAAQA audit`
              : 'Audit date has passed'}
          </span>
          <Link to="/audit-prep" className="ml-auto text-xs underline flex items-center gap-1">
            View preparation <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-[#e2e0db] bg-white">
          <Calendar className="h-5 w-5 text-[#6b7280] shrink-0" />
          <span className="text-sm text-[#6b7280]">No audit date set</span>
          <Link to="/audit-prep" className="ml-auto text-xs text-[#01696f] underline flex items-center gap-1 font-medium">
            Set audit date <ExternalLink className="h-3 w-3" />
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

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold font-sans">Domain Compliance Radar</CardTitle>
          </CardHeader>
          <CardContent>
            <DomainRadar domainJudgements={(judgements?.domains || {}) as Record<string, JudgementLevel>} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold font-sans">Compliance Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ComplianceTrend />
          </CardContent>
        </Card>
      </div>

      {/* Domain summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold font-sans">Domain Judgements</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {Object.entries(DOMAIN_NAMES).map(([id, name]) => {
              const level = ((judgements?.domains as Record<string, JudgementLevel> || {})[id] || 3) as JudgementLevel;
              return (
                <Link key={id} to={`/domains/${id}`} className="block">
                  <div className="p-3 rounded-lg border border-[#e2e0db] hover:border-[#01696f] transition-colors">
                    <div className="text-xs text-[#6b7280] mb-1">Domain {id}</div>
                    <div className="text-sm font-medium text-[#1a1a1a] mb-2 leading-tight">{name}</div>
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
              <CardTitle className="text-base font-semibold font-sans">Evidence Coverage</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <EvidenceHeatmap />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold font-sans">Top Action Items</CardTitle>
              <Link to="/improvement-plan" className="text-xs text-[#01696f] hover:underline">View all</Link>
            </div>
          </CardHeader>
          <CardContent>
            <ActionItemsWidget />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
