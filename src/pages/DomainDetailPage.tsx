import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ChevronDown, Sparkles, Copy, Check, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { JudgementBadge } from '../components/ui/judgement-badge';
import { Progress } from '../components/ui/progress';
import { useJudgements } from '../hooks/useJudgements';
import { useSchoolStore } from '../stores/schoolStore';
import { JUDGEMENT_LABELS, JUDGEMENT_COLORS, type JudgementLevel } from '../lib/judgement';
import { useDomainNarrative } from '../hooks/useAIFeedback';
import type { Domain, Standard, Indicator } from '../types';

export function DomainDetailPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const { school } = useSchoolStore();
  const { judgements } = useJudgements();
  const [openStandards, setOpenStandards] = useState<Set<string>>(new Set());
  const [narrative, setNarrative] = useState('');
  const [copied, setCopied] = useState(false);
  const domainNarrative = useDomainNarrative();

  const { data: domain } = useQuery({
    queryKey: ['domain', domainId],
    queryFn: async () => {
      const { data } = await supabase.from('domains').select('*').eq('id', domainId).single();
      return data as Domain;
    },
  });

  const { data: standards } = useQuery({
    queryKey: ['standards-domain', domainId],
    queryFn: async () => {
      const { data } = await supabase.from('standards').select('*').eq('domain_id', domainId).order('order_num');
      return (data || []) as Standard[];
    },
  });

  const { data: indicators } = useQuery({
    queryKey: ['indicators-domain', domainId],
    queryFn: async () => {
      const { data } = await supabase.from('indicators').select('*').eq('domain_id', domainId).order('order_num');
      return (data || []) as Indicator[];
    },
  });

  const { data: ratings } = useQuery({
    queryKey: ['ratings-domain', school?.id, domainId],
    queryFn: async () => {
      if (!school) return {};
      const indIds = (indicators || []).map((i) => i.id);
      if (!indIds.length) return {};
      const { data } = await supabase
        .from('indicator_ratings')
        .select('*')
        .eq('school_id', school.id)
        .in('indicator_id', indIds);
      const map: Record<string, number> = {};
      (data || []).forEach((r) => { map[r.indicator_id] = r.rating; });
      return map;
    },
    enabled: !!school && !!indicators,
  });

  const toggleStandard = (sid: string) => {
    setOpenStandards((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid); else next.add(sid);
      return next;
    });
  };

  if (!domain || !standards) {
    return <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-white rounded-lg border animate-pulse" />)}</div>;
  }

  const domainLevel = ((judgements?.domains as Record<string, JudgementLevel> || {})[domainId!] || 3) as JudgementLevel;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[#6b7280]">
        <Link to="/domains" className="hover:text-[#01696f]">Domains</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-[#1a1a1a]">Domain {domainId}: {domain.name_en}</span>
      </div>

      {/* Domain header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs text-[#6b7280]">Domain {domainId}</span>
              <h2 className="text-xl font-semibold text-[#1a1a1a] mt-1 font-sans">{domain.name_en}</h2>
              {domain.name_ar && <p className="text-sm text-[#6b7280] mt-1">{domain.name_ar}</p>}
            </div>
            <JudgementBadge level={domainLevel} size="md" />
          </div>
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <span className={`text-xs px-2 py-1 rounded-full ${domain.weight === 'high' ? 'bg-[#a12c7b]/10 text-[#a12c7b]' : 'bg-blue-50 text-blue-700'}`}>
              {domain.weight === 'high' ? 'High weight — directly impacts overall judgement' : 'Medium weight'}
            </span>
            <button
              onClick={async () => {
                if (!school || !domainId) return;
                const result = await domainNarrative.mutateAsync({
                  action: 'draft_domain_narrative',
                  school_id: school.id,
                  domain_id: domainId,
                });
                setNarrative(result.narrative);
              }}
              disabled={domainNarrative.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-[#01696f]/10 text-[#01696f] hover:bg-[#01696f]/20 transition-colors disabled:opacity-50"
            >
              {domainNarrative.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Drafting…</>
              ) : (
                <><Sparkles className="h-3.5 w-3.5" />✨ Draft Domain Narrative</>
              )}
            </button>
          </div>

          {domainNarrative.isError && (
            <p className="mt-3 text-xs text-red-600">
              {domainNarrative.error?.message ?? 'Failed to generate narrative.'}
            </p>
          )}

          {narrative && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-[#6b7280]">AI-drafted SED narrative — review and edit before pasting</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(narrative);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="inline-flex items-center gap-1 text-xs text-[#01696f] hover:underline"
                >
                  {copied ? <><Check className="h-3.5 w-3.5" />Copied!</> : <><Copy className="h-3.5 w-3.5" />Copy to clipboard</>}
                </button>
              </div>
              <textarea
                readOnly
                value={narrative}
                rows={6}
                className="w-full text-sm text-[#1a1a1a] bg-gray-50 border border-[#e2e0db] rounded-lg p-3 resize-none leading-relaxed focus:outline-none"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Standards accordion */}
      <div className="space-y-3">
        {standards.map((standard) => {
          const standardLevel = ((judgements?.standards as Record<string, JudgementLevel> || {})[standard.id] || 3) as JudgementLevel;
          const stdIndicators = (indicators || []).filter((i) => i.standard_id === standard.id);
          const ratedCount = stdIndicators.filter((i) => ratings?.[i.id]).length;
          const isOpen = openStandards.has(standard.id);

          return (
            <Card key={standard.id} className={standard.is_primary ? 'border-l-4' : ''} style={standard.is_primary ? { borderLeftColor: JUDGEMENT_COLORS[standardLevel] } : {}}>
              <button
                className="w-full text-left"
                onClick={() => toggleStandard(standard.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-[#6b7280]">{standard.id}</span>
                        {standard.is_primary && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">Primary</span>
                        )}
                      </div>
                      <CardTitle className="text-sm font-semibold text-[#1a1a1a] mt-1 font-sans">
                        {standard.name_en}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <JudgementBadge level={standardLevel} size="sm" />
                      {isOpen ? <ChevronDown className="h-4 w-4 text-[#6b7280]" /> : <ChevronRight className="h-4 w-4 text-[#6b7280]" />}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-[#6b7280]">{ratedCount}/{stdIndicators.length} rated</span>
                    <div className="flex-1">
                      <Progress value={stdIndicators.length ? (ratedCount / stdIndicators.length) * 100 : 0} className="h-1" />
                    </div>
                  </div>
                </CardHeader>
              </button>

              {isOpen && (
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {stdIndicators.map((ind) => {
                      const rating = ratings?.[ind.id];
                      return (
                        <div key={ind.id} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-[#e2e0db]">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <span className="text-xs font-mono text-[#6b7280] shrink-0 mt-0.5">{ind.id}</span>
                            <p className="text-xs text-[#1a1a1a] leading-relaxed">{ind.description_en}</p>
                          </div>
                          <div className="ml-3 shrink-0">
                            {rating ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs text-white" style={{ backgroundColor: JUDGEMENT_COLORS[rating as JudgementLevel] }}>
                                {JUDGEMENT_LABELS[rating as JudgementLevel]}
                              </span>
                            ) : (
                              <span className="text-xs text-[#6b7280] bg-gray-200 px-2 py-0.5 rounded">Not rated</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3">
                    <Link
                      to={`/domains/${domainId}/${standard.id}`}
                      className="inline-flex items-center gap-1.5 text-sm text-[#01696f] hover:underline font-medium"
                    >
                      Rate Indicators <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
