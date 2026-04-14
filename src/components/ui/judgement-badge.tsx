import { useTranslation } from 'react-i18next';
import { JUDGEMENT_LABELS, JUDGEMENT_LABELS_AR, JUDGEMENT_COLORS, type JudgementLevel } from '../../lib/judgement';
import { cn } from '../../lib/utils';

interface JudgementBadgeProps {
  level: JudgementLevel;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function JudgementBadge({ level, size = 'sm', className }: JudgementBadgeProps) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const color = JUDGEMENT_COLORS[level];
  const label = isAr ? JUDGEMENT_LABELS_AR[level] : JUDGEMENT_LABELS[level];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium text-white',
        size === 'sm' && 'px-2 py-0.5 text-xs',
        size === 'md' && 'px-3 py-1 text-sm',
        size === 'lg' && 'px-4 py-1.5 text-base',
        className
      )}
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  );
}
