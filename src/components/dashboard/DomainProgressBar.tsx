import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useSchoolStore } from '../../stores/schoolStore';
import { JUDGEMENT_COLORS, type JudgementLevel } from '../../lib/judgement';
import { JudgementBadge } from '../ui/judgement-badge';

// ─── Domain metadata ──────────────────────────────────────────

const DOMAINS: { id: string; name: string; weight: 'high' | 'medium' }[] = [
  { id: '1', name: 'Academic Achievement',      weight: 'high'   },
  { id: '2', name: 'Personal Development',       weight: 'medium' },
  { id: '3', name: 'Teaching & Assessment',      weight: 'high'   },
  { id: '4', name: 'School Climate',             weight: 'medium' },
  { id: '5', name: 'Leadership & Governance',    weight: 'high'   },
];

// ─── Props ────────────────────────────────────────────────────

interface DomainProgressBarProps {
  /** Domain judgements from useJudgements — passed down to avoid a second calc */
  domainJudgements?: Record<string, JudgementLevel>;
}

// ─── Component ────────────────────────────────────────────────

export function DomainProgressBar({ domainJudgements }: DomainProgressBarProps) {
  const { school, academicYear } = useSchoolStore();

  // Reuse the exact same query keys used by useJudgements → guaranteed cache hits,
  // no additional network requests.
  const { data: ratings } = useQuery({
    queryKey: ['all-ratings-judgements', school?.id, academicYear],
    queryFn: async () => {
      if (!school) return [];
      const { data, error } = await supabase
        .from('indicator_ratings')
        .select('indicator_id, rating')
        .eq('school_id', school.id)
        .eq('academic_year', academicYear);
      if (error) throw error;
      return data as { indicator_id: string; rating: number }[];
    },
    enabled: !!school,
  });

  const { data: indicators } = useQuery({
    queryKey: ['indicators-by-standard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('indicators')
        .select('id, standard_id, domain_id');
      if (error) throw error;
      return data as { id: string; standard_id: string; domain_id: string }[];
    },
  });

  // Per-domain rated / total counts
  const domainStats = useMemo(() => {
    if (!indicators) return {} as Record<string, { rated: number; total: number }>;

    const ratedSet = new Set(
      (ratings ?? [])
        .filter(r => r.rating != null)
        .map(r => r.indicator_id)
    );

    const stats: Record<string, { rated: number; total: number }> = {};
    for (const ind of indicators) {
      if (!stats[ind.domain_id]) stats[ind.domain_id] = { rated: 0, total: 0 };
      stats[ind.domain_id].total += 1;
      if (ratedSet.has(ind.id)) stats[ind.domain_id].rated += 1;
    }
    return stats;
  }, [indicators, ratings]);

  const isLoading = !indicators;

  if (isLoading) return <DomainProgressBarSkeleton />;

  return (
    <div className="space-y-3">
      {DOMAINS.map(domain => {
        const stats  = domainStats[domain.id] ?? { rated: 0, total: 0 };
        const pct    = stats.total > 0 ? Math.round((stats.rated / stats.total) * 100) : 0;
        const colour = barColour(pct);
        const level  = domainJudgements?.[domain.id];

        return (
          <Link
            key={domain.id}
            to={`/domains/${domain.id}`}
            className="group flex items-center gap-4 rounded-xl border border-gray-100 bg-white px-4 py-3 hover:border-[#01696f]/40 hover:bg-[#01696f]/[0.02] transition-colors"
          >
            {/* Domain number pill */}
            <div
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: level ? JUDGEMENT_COLORS[level] : '#94a3b8' }}
            >
              {domain.id}
            </div>

            {/* Name + bar */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-gray-800 truncate">
                  {domain.name}
                </span>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {level && <JudgementBadge level={level} size="sm" />}
                  <span className="text-xs text-gray-400 tabular-nums">
                    {stats.rated}/{stats.total}
                  </span>
                </div>
              </div>

              {/* Progress track */}
              <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${pct}%`, backgroundColor: colour }}
                />
              </div>

              {/* Subtext */}
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-400">
                  {domain.weight === 'high' ? 'High weight' : 'Medium weight'}
                </span>
                <span
                  className="text-xs font-semibold tabular-nums"
                  style={{ color: colour }}
                >
                  {pct}%
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function barColour(pct: number): string {
  if (pct >= 80) return '#437a22'; // green
  if (pct >= 50) return '#d19900'; // amber
  if (pct > 0)   return '#da7101'; // orange
  return '#94a3b8';                 // grey — nothing rated yet
}

// ─── Skeleton ─────────────────────────────────────────────────

function DomainProgressBarSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {DOMAINS.map(d => (
        <div
          key={d.id}
          className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white px-4 py-3"
        >
          <div className="shrink-0 w-8 h-8 rounded-lg bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="flex justify-between">
              <div className="h-3.5 bg-gray-200 rounded w-40" />
              <div className="h-3.5 bg-gray-100 rounded w-16" />
            </div>
            <div className="h-2 bg-gray-100 rounded-full w-full" />
            <div className="flex justify-between">
              <div className="h-2.5 bg-gray-100 rounded w-16" />
              <div className="h-2.5 bg-gray-100 rounded w-8" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
