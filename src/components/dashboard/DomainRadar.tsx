import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ResponsiveContainer, Legend, Tooltip,
} from 'recharts';
import { ratingToPercent, type JudgementLevel } from '../../lib/judgement';

interface DomainRadarProps {
  domainJudgements: Record<string, JudgementLevel>;
}

const DOMAIN_LABELS: Record<string, string> = {
  '1': 'Academic Achievement',
  '2': 'Personal Development',
  '3': 'Teaching & Assessment',
  '4': 'School Climate',
  '5': 'Leadership',
};

export function DomainRadar({ domainJudgements }: DomainRadarProps) {
  const data = Object.entries(DOMAIN_LABELS).map(([id, label]) => ({
    domain: label,
    score: ratingToPercent(domainJudgements[id] || 3),
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data}>
          <PolarGrid stroke="#e2e0db" />
          <PolarAngleAxis
            dataKey="domain"
            tick={{ fontSize: 11, fill: '#6b7280' }}
          />
          <Radar
            name="Compliance %"
            dataKey="score"
            stroke="#01696f"
            fill="#01696f"
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Tooltip formatter={(val) => [`${val}%`, 'Score']} />
          <Legend />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
