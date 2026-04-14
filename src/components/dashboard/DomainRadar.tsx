import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ResponsiveContainer, Legend, Tooltip,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { ratingToPercent, type JudgementLevel } from '../../lib/judgement';

interface DomainRadarProps {
  domainJudgements: Record<string, JudgementLevel>;
}

const DOMAIN_LABELS_EN: Record<string, string> = {
  '1': 'Academic Achievement',
  '2': 'Personal Development',
  '3': 'Teaching & Assessment',
  '4': 'School Climate',
  '5': 'Leadership',
};

const DOMAIN_LABELS_AR: Record<string, string> = {
  '1': 'الإنجاز الأكاديمي',
  '2': 'التطور الشخصي',
  '3': 'التدريس والتقييم',
  '4': 'المناخ المدرسي',
  '5': 'القيادة',
};

export function DomainRadar({ domainJudgements }: DomainRadarProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const DOMAIN_LABELS = isAr ? DOMAIN_LABELS_AR : DOMAIN_LABELS_EN;

  const data = Object.entries(DOMAIN_LABELS).map(([id, label]) => ({
    domain: label,
    score: ratingToPercent(domainJudgements[id] || 3),
  }));

  return (
    <div style={{ width: '100%', height: 256, minHeight: 256 }}>
      <ResponsiveContainer width="100%" height={256}>
        <RadarChart data={data}>
          <PolarGrid stroke="#e2e0db" />
          <PolarAngleAxis
            dataKey="domain"
            tick={{ fontSize: 11, fill: '#6b7280' }}
          />
          <Radar
            name={t('dashboard.compliancePercent')}
            dataKey="score"
            stroke="#01696f"
            fill="#01696f"
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Tooltip formatter={(val) => [`${val}%`, t('dashboard.score')]} />
          <Legend />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
