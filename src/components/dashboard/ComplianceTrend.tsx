import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../../lib/supabase';
import { useSchoolStore } from '../../stores/schoolStore';
import { ratingToPercent } from '../../lib/judgement';

export function ComplianceTrend() {
  const { t } = useTranslation();
  const { school } = useSchoolStore();

  const { data: snapshots } = useQuery({
    queryKey: ['kpi-snapshots', school?.id],
    queryFn: async () => {
      if (!school) return [];
      const { data } = await supabase
        .from('kpi_snapshots')
        .select('*')
        .eq('school_id', school.id)
        .order('snapshot_date', { ascending: true })
        .limit(12);
      return data || [];
    },
    enabled: !!school,
  });

  if (!snapshots?.length) {
    return (
      <div className="h-40 flex items-center justify-center">
        <p className="text-sm text-[#6b7280]">{t('dashboard.noTrendData')}</p>
      </div>
    );
  }

  const chartData = snapshots.map((s) => ({
    date: new Date(s.snapshot_date).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
    score: ratingToPercent(Number(s.overall_judgement) || 3),
  }));

  return (
    <div style={{ height: 200, minHeight: 200 }}>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e0db" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
          <Tooltip formatter={(val) => [`${val}%`, t('dashboard.compliance')]} />
          <Line type="monotone" dataKey="score" stroke="#01696f" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
