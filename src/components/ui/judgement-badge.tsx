import { JUDGEMENT_LABELS, JUDGEMENT_COLORS, type JudgementLevel } from '../../lib/judgement';
import { cn } from '../../lib/utils';

interface JudgementBadgeProps {
  level: JudgementLevel;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function JudgementBadge({ level, size = 'sm', className }: JudgementBadgeProps) {
  const color = JUDGEMENT_COLORS[level];

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
      {JUDGEMENT_LABELS[level]}
    </span>
  );
}
