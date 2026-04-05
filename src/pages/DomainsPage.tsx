import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronRight, FileCheck } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { JudgementBadge } from '../components/ui/judgement-badge';
import { Progress } from '../components/ui/progress';
import { useJudgements } from '../hooks/useJudgements';
import { useSchoolStore } from '../stores/schoolStore';
import { supabase } from '../lib/supabase';
import type { Domain, Standard } from '../types';
import type { JudgementLevel } from '../lib/judgement';

export function DomainsPage() {
  const { school } = useSchoolStore();
  const { judgements } = useJudgements();

  const { data: domains } = useQuery({
    queryKey: ['domains'],
    queryFn: async () => {
      const { data } = await supabase.from('domains').select('*').order('order_num');
      return (data || []) as Domain[];
    },
  });

  const { data: standards } = useQuery({
    queryKey: ['standards'],
    queryFn: async () => {
      const { data } = await supabase.from('standards').select('*').order('order_num');
      return (data || []) as Standard[];
    },
  });

  const { data: ratingCounts } = useQuery({
    queryKey: ['rating-counts', school?.id],
    queryFn: async () => {
      if (!school) return {};
      const { data: indicators } = await supabase.from('indicators').select('id, domain_id');
      const { data: ratings } = await supabase
        .from('indicator_ratings')
        .select('indicator_id')
        .eq('school_id', school.id);
      const ratedSet = new Set((ratings || []).map((r) => r.indicator_id));
      const domainTotal: Record<string, number> = {};
      const domainRated: Record<string, number> = {};
      (indicators || []).forEach((ind) => {
        domainTotal[ind.domain_id] = (domainTotal[ind.domain_id] || 0) + 1;
        if (ratedSet.has(ind.id)) domainRated[ind.domain_id] = (domainRated[ind.domain_id] || 0) + 1;
      });
      return { domainTotal, domainRated };
    },
    enabled: !!school,
  });

  const { data: evidenceCounts } = useQuery({
    queryKey: ['evidence-domain-counts', school?.id],
    queryFn: async () => {
      if (!school) return {};
      const { data } = await supabase
        .from('evidence_indicator_links')
        .select('domain_id')
        .eq('school_id', school.id);
      const counts: Record<string, number> = {};
      (data || []).forEach((link) => {
        counts[link.domain_id] = (counts[link.domain_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!school,
  });

  if (!domains) {
    return <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-32 bg-white rounded-lg border animate-pulse" />)}</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {domains.map((domain) => {
        const level = ((judgements?.domains as Record<string, JudgementLevel> || {})[domain.id] || 3) as JudgementLevel;
        const domainStandards = (standards || []).filter((s) => s.domain_id === domain.id);
        const total = ratingCounts?.domainTotal?.[domain.id] || 0;
        const rated = ratingCounts?.domainRated?.[domain.id] || 0;
        const evidence = evidenceCounts?.[domain.id] || 0;

        return (
          <Link key={domain.id} to={`/domains/${domain.id}`}>
            <Card className="hover:border-[#01696f] transition-colors h-full">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className="text-xs font-medium text-[#6b7280]">Domain {domain.id}</span>
                    <h3 className="text-base font-semibold text-[#1a1a1a] mt-0.5 leading-tight font-sans">
                      {domain.name_en}
                    </h3>
                  </div>
                  <ChevronRight className="h-5 w-5 text-[#6b7280] shrink-0 mt-1" />
                </div>

                <div className="mb-3">
                  <JudgementBadge level={level} size="sm" />
                  <span className="ml-2 text-xs text-[#6b7280]">
                    {domain.weight === 'high' ? 'High weight' : 'Medium weight'}
                  </span>
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-xs text-[#6b7280] mb-1">
                    <span>Indicators rated</span>
                    <span>{rated}/{total}</span>
                  </div>
                  <Progress value={total ? (rated / total) * 100 : 0} className="h-1.5" />
                </div>

                <div className="flex items-center gap-4 text-xs text-[#6b7280]">
                  <span className="flex items-center gap-1">
                    <FileCheck className="h-3.5 w-3.5" />
                    {evidence} evidence files
                  </span>
                  <span>{domainStandards.length} standards</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-1">
                  {domainStandards.map((s) => {
                    const sLevel = ((judgements?.standards as Record<string, JudgementLevel> || {})[s.id] || 3) as JudgementLevel;
                    const colors: Record<number, string> = {1:'#437a22',2:'#006494',3:'#d19900',4:'#da7101',5:'#a12c7b'};
                    return (
                      <span key={s.id} className="h-2 w-2 rounded-full inline-block" style={{ backgroundColor: colors[sLevel] }} title={s.name_en} />
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
