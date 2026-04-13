import { useQuery } from '@tanstack/react-query';
import { Building2, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { usePermissions } from '../hooks/usePermissions';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { JudgementBadge } from '../components/ui/judgement-badge';
import { Progress } from '../components/ui/progress';
import { JUDGEMENT_COLORS, JUDGEMENT_LABELS_SHORT, type JudgementLevel } from '../lib/judgement';

// ─── Types ────────────────────────────────────────────────────

interface SchoolGroup {
  id: string;
  name: string;
}

interface SchoolRow {
  id: string;
  name_en: string;
  governorate: string | null;
  school_type: string;
}

interface SchoolStat {
  school: SchoolRow;
  groupId: string | null;
  groupName: string | null;
  overallJudgement: JudgementLevel | null;
  domainJudgements: Record<string, JudgementLevel>; // domain_id → judgement
  checklistPct: number;
  followUpDeadline: string | null;
  followUpOverdue: boolean;
  lastActivity: string | null;
  ratedCount: number;
  totalIndicators: number;
}

// ─── Colour helpers ───────────────────────────────────────────

function judgementDot(level: JudgementLevel | null) {
  if (!level) return <span className="inline-block w-3 h-3 rounded-full bg-gray-200" title="No data" />;
  const colour = JUDGEMENT_COLORS[level];
  return (
    <span
      className="inline-block w-3 h-3 rounded-full"
      style={{ backgroundColor: colour }}
      title={JUDGEMENT_LABELS_SHORT[level]}
    />
  );
}

function followUpBadge(deadline: string | null, overdue: boolean) {
  if (!deadline) return <span className="text-xs text-gray-400">None</span>;
  const date = new Date(deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (overdue) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
        <AlertTriangle className="h-3 w-3" />
        Overdue
      </span>
    );
  }
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  const cls = days <= 30 ? 'text-red-700 bg-red-50' : days <= 90 ? 'text-amber-700 bg-amber-50' : 'text-blue-700 bg-blue-50';
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {date}
    </span>
  );
}

// ─── Data hook ──────────────────────────────────────────────��─

function useChainData(userId: string | undefined, isSuperAdmin: boolean) {
  return useQuery({
    queryKey: ['chain-dashboard', userId, isSuperAdmin],
    queryFn: async (): Promise<{ groups: SchoolGroup[]; stats: SchoolStat[]; totalIndicators: number }> => {
      if (!userId) return { groups: [], stats: [], totalIndicators: 0 };

      // 1. Get all indicators count
      const { count: indTotal } = await supabase
        .from('indicators')
        .select('*', { count: 'exact', head: true });
      const totalIndicators = indTotal ?? 0;

      let schoolIds: string[] = [];
      let groups: SchoolGroup[] = [];
      let schoolGroupMap: Record<string, { groupId: string; groupName: string }> = {};

      if (isSuperAdmin) {
        // Super admin: load all schools, all groups
        const [schoolsRes, groupsRes, membersRes] = await Promise.all([
          supabase.from('schools').select('id, name_en, governorate, school_type').eq('is_active', true),
          supabase.from('school_groups').select('id, name'),
          supabase.from('school_group_members').select('school_id, group_id'),
        ]);
        schoolIds = (schoolsRes.data ?? []).map((s: SchoolRow) => s.id);
        groups = (groupsRes.data ?? []) as SchoolGroup[];
        // build lookup: school_id → group
        const groupById = Object.fromEntries((groupsRes.data ?? []).map((g: SchoolGroup) => [g.id, g.name]));
        for (const m of (membersRes.data ?? []) as Array<{ school_id: string; group_id: string }>) {
          schoolGroupMap[m.school_id] = { groupId: m.group_id, groupName: groupById[m.group_id] ?? '' };
        }
      } else {
        // Chain admin: look up their group memberships first
        const { data: capData } = await supabase
          .from('chain_admin_profiles')
          .select('group_id, school_groups(id, name)')
          .eq('user_id', userId);

        groups = ((capData ?? []) as Array<{ group_id: string; school_groups: unknown }>).map(r => {
          const g = r.school_groups as { id: string; name: string } | null;
          return { id: r.group_id, name: g?.name ?? r.group_id };
        });
        const groupIds = groups.map(g => g.id);
        if (!groupIds.length) return { groups: [], stats: [], totalIndicators };

        const { data: memberData } = await supabase
          .from('school_group_members')
          .select('school_id, group_id')
          .in('group_id', groupIds);

        const groupNameById = Object.fromEntries(groups.map(g => [g.id, g.name]));
        for (const m of (memberData ?? []) as Array<{ school_id: string; group_id: string }>) {
          schoolGroupMap[m.school_id] = { groupId: m.group_id, groupName: groupNameById[m.group_id] ?? '' };
        }
        schoolIds = Object.keys(schoolGroupMap);
        if (!schoolIds.length) return { groups, stats: [], totalIndicators };
      }

      if (!schoolIds.length) return { groups, stats: [], totalIndicators };

      // 2. Fetch all data in parallel
      const [schoolsRes, overallRes, domainRes, checklistRes, visitsRes, ratingsRes] = await Promise.all([
        supabase.from('schools').select('id, name_en, governorate, school_type').in('id', schoolIds),
        supabase.from('overall_judgements').select('school_id, judgement, calculated_at').in('school_id', schoolIds),
        supabase.from('domain_judgements').select('school_id, domain_id, judgement, calculated_at').in('school_id', schoolIds),
        supabase.from('audit_checklist_items').select('school_id, is_completed').in('school_id', schoolIds),
        supabase
          .from('review_visits')
          .select('school_id, followup_deadline, visit_date')
          .in('school_id', schoolIds)
          .not('followup_deadline', 'is', null),
        supabase.from('indicator_ratings').select('school_id, indicator_id, rated_at').in('school_id', schoolIds),
      ]);

      const schools = (schoolsRes.data ?? []) as SchoolRow[];

      // Latest overall judgement per school
      const overallBySchool: Record<string, { judgement: number; calculated_at: string }> = {};
      for (const r of (overallRes.data ?? []) as Array<{ school_id: string; judgement: number; calculated_at: string }>) {
        const cur = overallBySchool[r.school_id];
        if (!cur || r.calculated_at > cur.calculated_at) overallBySchool[r.school_id] = r;
      }

      // Latest domain judgements per school
      const domainBySchool: Record<string, Record<string, JudgementLevel>> = {};
      for (const r of (domainRes.data ?? []) as Array<{ school_id: string; domain_id: string; judgement: number; calculated_at: string }>) {
        if (!domainBySchool[r.school_id]) domainBySchool[r.school_id] = {};
        domainBySchool[r.school_id][r.domain_id] = r.judgement as JudgementLevel;
      }

      // Checklist % per school
      const checklistBySchool: Record<string, { total: number; done: number }> = {};
      for (const r of (checklistRes.data ?? []) as Array<{ school_id: string; is_completed: boolean }>) {
        if (!checklistBySchool[r.school_id]) checklistBySchool[r.school_id] = { total: 0, done: 0 };
        checklistBySchool[r.school_id].total++;
        if (r.is_completed) checklistBySchool[r.school_id].done++;
      }

      // Latest follow-up deadline per school
      const visitBySchool: Record<string, { followup_deadline: string; visit_date: string }> = {};
      for (const r of (visitsRes.data ?? []) as Array<{ school_id: string; followup_deadline: string; visit_date: string }>) {
        const cur = visitBySchool[r.school_id];
        if (!cur || r.followup_deadline > cur.followup_deadline) visitBySchool[r.school_id] = r;
      }

      // Rated indicators per school + last activity
      const ratingsBySchool: Record<string, { indicatorIds: Set<string>; lastActivity: string | null }> = {};
      for (const r of (ratingsRes.data ?? []) as Array<{ school_id: string; indicator_id: string; rated_at: string }>) {
        if (!ratingsBySchool[r.school_id]) ratingsBySchool[r.school_id] = { indicatorIds: new Set(), lastActivity: null };
        ratingsBySchool[r.school_id].indicatorIds.add(r.indicator_id);
        const cur = ratingsBySchool[r.school_id].lastActivity;
        if (!cur || r.rated_at > cur) ratingsBySchool[r.school_id].lastActivity = r.rated_at;
      }

      const now = Date.now();
      const stats: SchoolStat[] = schools.map(school => {
        const overall = overallBySchool[school.id];
        const cl = checklistBySchool[school.id];
        const visit = visitBySchool[school.id];
        const ratings = ratingsBySchool[school.id];
        const groupInfo = schoolGroupMap[school.id] ?? null;

        const followUpDeadline = visit?.followup_deadline ?? null;
        const followUpOverdue = followUpDeadline
          ? new Date(followUpDeadline).getTime() < now
          : false;

        return {
          school,
          groupId: groupInfo?.groupId ?? null,
          groupName: groupInfo?.groupName ?? null,
          overallJudgement: overall ? (overall.judgement as JudgementLevel) : null,
          domainJudgements: domainBySchool[school.id] ?? {},
          checklistPct: cl && cl.total > 0 ? Math.round((cl.done / cl.total) * 100) : 0,
          followUpDeadline,
          followUpOverdue,
          lastActivity: ratings?.lastActivity ?? null,
          ratedCount: ratings?.indicatorIds.size ?? 0,
          totalIndicators,
        };
      });

      return { groups, stats, totalIndicators };
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  });
}

// ─── School table row ─────────────────────────────────────────

function SchoolTableRow({ stat }: { stat: SchoolStat }) {
  const lastActivityStr = stat.lastActivity
    ? new Date(stat.lastActivity).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <div className="font-medium text-sm text-gray-900">{stat.school.name_en}</div>
        <div className="text-xs text-gray-400">{stat.school.governorate ?? '—'} · {stat.school.school_type}</div>
      </td>
      <td className="px-4 py-3 text-center">
        {stat.overallJudgement ? (
          <JudgementBadge level={stat.overallJudgement} size="sm" />
        ) : (
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">No data</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 justify-center">
          {['1', '2', '3', '4', '5'].map(d => (
            <div key={d} className="flex flex-col items-center gap-0.5">
              <span className="text-[9px] text-gray-400 leading-none">D{d}</span>
              {judgementDot(stat.domainJudgements[d] ?? null)}
            </div>
          ))}
        </div>
      </td>
      <td className="px-4 py-3 min-w-[120px]">
        <div className="flex items-center gap-2">
          <Progress value={stat.checklistPct} className="h-1.5 flex-1" />
          <span className="text-xs text-gray-500 w-8 text-right shrink-0">{stat.checklistPct}%</span>
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        {followUpBadge(stat.followUpDeadline, stat.followUpOverdue)}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500 text-right">
        <div>{lastActivityStr}</div>
        <div className="text-gray-400">{stat.ratedCount}/{stat.totalIndicators} indicators</div>
      </td>
    </tr>
  );
}

// ─── School group section ─────────────────────────────────────

function GroupSection({ name, stats }: { name: string; stats: SchoolStat[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-[#01696f]" />
          <CardTitle className="text-sm font-semibold">{name}</CardTitle>
          <span className="text-xs text-gray-400 ml-auto">{stats.length} school{stats.length !== 1 ? 's' : ''}</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">School</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Overall</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Domains</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Checklist</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Follow-Up</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Activity</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(s => <SchoolTableRow key={s.school.id} stat={s} />)}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function ChainDashboardPage() {
  const { profile } = useSchoolStore();
  const { isSuperAdmin } = usePermissions();
  const { data, isLoading, dataUpdatedAt, refetch, isFetching } = useChainData(profile?.id, isSuperAdmin);

  const groups = data?.groups ?? [];
  const stats  = data?.stats ?? [];

  // Summary stats
  const totalSchools = stats.length;
  const withJudgement = stats.filter(s => s.overallJudgement !== null);
  const avgJudgement = withJudgement.length
    ? Math.round(withJudgement.reduce((sum, s) => sum + (s.overallJudgement ?? 3), 0) / withJudgement.length)
    : null;
  const followUpDue = stats.filter(s => s.followUpDeadline !== null).length;
  const avgRatedPct = stats.length
    ? Math.round(stats.reduce((sum, s) => sum + (s.totalIndicators > 0 ? (s.ratedCount / s.totalIndicators) * 100 : 0), 0) / stats.length)
    : 0;

  const updatedStr = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-40 bg-white rounded-xl border border-gray-200 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!groups.length && !isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Building2 className="h-12 w-12 text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700 mb-1">No groups assigned</h2>
        <p className="text-sm text-gray-400 max-w-xs">
          You haven't been assigned to any school groups yet. Contact a super admin to set up your chain dashboard.
        </p>
      </div>
    );
  }

  if (!stats.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Building2 className="h-12 w-12 text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700 mb-1">No schools in groups</h2>
        <p className="text-sm text-gray-400 max-w-xs">
          Groups exist but no schools have been added to them yet.
        </p>
      </div>
    );
  }

  // Build group sections
  const groupedStats: Record<string, SchoolStat[]> = {};
  const ungrouped: SchoolStat[] = [];

  for (const stat of stats) {
    if (stat.groupId) {
      (groupedStats[stat.groupId] ??= []).push(stat);
    } else {
      ungrouped.push(stat);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chain Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalSchools} school{totalSchools !== 1 ? 's' : ''} across {groups.length} group{groups.length !== 1 ? 's' : ''}
            {updatedStr && <span className="ml-2 text-gray-400">· Last updated {updatedStr}</span>}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="text-2xl font-bold text-gray-900">{totalSchools}</div>
            <div className="text-xs text-gray-500 mt-0.5">Total Schools</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            {avgJudgement ? (
              <>
                <div className="mb-1">
                  <JudgementBadge level={avgJudgement as JudgementLevel} size="md" />
                </div>
                <div className="text-xs text-gray-500 mt-0.5">Avg Overall Judgement</div>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-gray-400">—</div>
                <div className="text-xs text-gray-500 mt-0.5">Avg Overall Judgement</div>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className={`text-2xl font-bold ${followUpDue > 0 ? 'text-red-600' : 'text-gray-900'}`}>{followUpDue}</div>
            <div className="text-xs text-gray-500 mt-0.5">Schools with Follow-Up Due</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-2xl font-bold text-gray-900">{avgRatedPct}%</div>
            <div className="text-xs text-gray-500 mt-0.5">Avg Indicators Rated</div>
            <Progress value={avgRatedPct} className="h-1.5 mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Per-group sections (super admin) */}
      {isSuperAdmin && groups.map(group => {
        const groupStats = groupedStats[group.id] ?? [];
        if (!groupStats.length) return null;
        return <GroupSection key={group.id} name={group.name} stats={groupStats} />;
      })}

      {/* Chain admin: show all their schools in each group */}
      {!isSuperAdmin && groups.map(group => {
        const groupStats = groupedStats[group.id] ?? [];
        return <GroupSection key={group.id} name={group.name} stats={groupStats} />;
      })}

      {/* Ungrouped schools (super admin only) */}
      {isSuperAdmin && ungrouped.length > 0 && (
        <GroupSection name="Ungrouped Schools" stats={ungrouped} />
      )}
    </div>
  );
}
