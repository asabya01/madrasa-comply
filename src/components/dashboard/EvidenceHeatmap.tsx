import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useSchoolStore } from '../../stores/schoolStore';

export function EvidenceHeatmap() {
  const { school } = useSchoolStore();

  const { data: indicators } = useQuery({
    queryKey: ['indicators-list'],
    queryFn: async () => {
      const { data } = await supabase.from('indicators').select('id, domain_id, standard_id').order('order_num');
      return data || [];
    },
  });

  const { data: links } = useQuery({
    queryKey: ['evidence-links-heat', school?.id],
    queryFn: async () => {
      if (!school) return [];
      const { data } = await supabase
        .from('evidence_indicator_links')
        .select('indicator_id')
        .eq('school_id', school.id);
      return (data || []).map((l) => l.indicator_id);
    },
    enabled: !!school,
  });

  const coveredSet = new Set(links || []);

  if (!indicators?.length) return null;

  const covered = indicators.filter((i) => coveredSet.has(i.id)).length;
  const total = indicators.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-[#6b7280]">{covered}/{total} indicators have evidence</p>
        <div className="flex items-center gap-3 text-xs text-[#6b7280]">
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-[#437a22] inline-block" /> Has evidence</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-red-200 inline-block" /> Missing</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {indicators.map((ind) => (
          <div
            key={ind.id}
            title={ind.id}
            className={`h-4 w-4 rounded-sm cursor-default transition-colors ${
              coveredSet.has(ind.id) ? 'bg-[#437a22]' : 'bg-red-200'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
