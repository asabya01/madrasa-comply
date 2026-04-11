import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown, ChevronRight, RefreshCw, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { JudgementBadge } from '../components/ui/judgement-badge';
import { useJudgements } from '../hooks/useJudgements';
import { useSchoolStore } from '../stores/schoolStore';
import {
  JUDGEMENT_LABELS, JUDGEMENT_COLORS, type JudgementLevel, type TraceStep,
} from '../lib/judgement';

// ─── Domain metadata ──────────────────────────────────────────

const DOMAINS: { id: string; name: string; weight: 'high' | 'medium' }[] = [
  { id: '1', name: 'Academic Achievement',               weight: 'high'   },
  { id: '2', name: 'Personal Development',               weight: 'medium' },
  { id: '3', name: 'Teaching and Assessment',            weight: 'high'   },
  { id: '4', name: 'School Climate and Learning Env.',   weight: 'medium' },
  { id: '5', name: 'Leadership, Management & Gov.',      weight: 'high'   },
];

// Background tints per judgement level
const LEVEL_BG: Record<JudgementLevel, string> = {
  1: 'bg-green-50  border-green-200',
  2: 'bg-teal-50   border-teal-200',
  3: 'bg-amber-50  border-amber-200',
  4: 'bg-orange-50 border-orange-200',
  5: 'bg-red-50    border-red-200',
};

const LEVEL_ICON_COLOR: Record<JudgementLevel, string> = {
  1: 'text-green-600',
  2: 'text-teal-600',
  3: 'text-amber-600',
  4: 'text-orange-600',
  5: 'text-red-600',
};

// ─── Overall banner colours ───────────────────────────────────

const OVERALL_BANNER: Record<JudgementLevel, { bg: string; border: string; text: string }> = {
  1: { bg: 'bg-green-600',  border: 'border-green-700',  text: 'text-white'     },
  2: { bg: 'bg-teal-600',   border: 'border-teal-700',   text: 'text-white'     },
  3: { bg: 'bg-amber-500',  border: 'border-amber-600',  text: 'text-white'     },
  4: { bg: 'bg-orange-500', border: 'border-orange-600', text: 'text-white'     },
  5: { bg: 'bg-red-600',    border: 'border-red-700',    text: 'text-white'     },
};

// ─── Small components ─────────────────────────────────────────

function TraceList({ steps }: { steps: TraceStep[] }) {
  return (
    <ol className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-2 text-xs">
          <span
            className="mt-0.5 shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
            style={{ backgroundColor: JUDGEMENT_COLORS[step.value as JudgementLevel] ?? '#94a3b8' }}
          >
            {step.value}
          </span>
          <div className="min-w-0">
            <span className="font-medium text-gray-700">{step.label}</span>
            {step.note && (
              <span className="ml-1 text-gray-400">— {step.note}</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function IncompleteBanner({ missing }: { missing: number }) {
  return (
    <div className="flex items-center gap-2 mt-2 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 text-xs">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span>{missing} indicator{missing !== 1 ? 's' : ''} not yet rated — judgement is provisional</span>
    </div>
  );
}

// ─── Domain card ─────────────────────────────────────────────

interface DomainCardProps {
  domainId: string;
  name: string;
  weight: 'high' | 'medium';
  judgement: JudgementLevel;
  traceSteps: TraceStep[];
  limitingStandard?: string;
  totalIndicators: number;
  ratedIndicators: number;
}

function DomainCard({
  domainId, name, weight, judgement, traceSteps,
  limitingStandard, totalIndicators, ratedIndicators,
}: DomainCardProps) {
  const [open, setOpen] = useState(false);
  const missing = totalIndicators - ratedIndicators;
  const isComplete = missing === 0;

  return (
    <div className={`rounded-xl border-2 p-4 transition-colors ${LEVEL_BG[judgement]}`}>
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Domain number pill */}
        <div
          className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold text-white"
          style={{ backgroundColor: JUDGEMENT_COLORS[judgement] }}
        >
          D{domainId}
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm text-gray-900">{name}</span>
            <span className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded
              ${weight === 'high' ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-600'}`}>
              {weight} weight
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <JudgementBadge level={judgement} size="md" />
            {isComplete ? (
              <span className="flex items-center gap-1 text-xs text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                All {totalIndicators} indicators rated
              </span>
            ) : (
              <IncompleteBanner missing={missing} />
            )}
          </div>

          {limitingStandard && (
            <p className="mt-1.5 text-xs text-gray-500">
              Limiting standard: <span className="font-semibold text-gray-700">{limitingStandard}</span>
            </p>
          )}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 p-1 rounded hover:bg-black/5 transition-colors"
          aria-label={open ? 'Collapse trace' : 'Expand trace'}
        >
          {open
            ? <ChevronDown className={`h-4 w-4 ${LEVEL_ICON_COLOR[judgement]}`} />
            : <ChevronRight className={`h-4 w-4 ${LEVEL_ICON_COLOR[judgement]}`} />}
        </button>
      </div>

      {/* Collapsible trace */}
      {open && <TraceList steps={traceSteps} />}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────

export default function JudgementsPage() {
  const { school, academicYear } = useSchoolStore();
  const { judgements, isLoading } = useJudgements();
  const queryClient = useQueryClient();
  const [recalculating, setRecalculating] = useState(false);

  const handleRecalculate = async () => {
    setRecalculating(true);
    await queryClient.invalidateQueries({ queryKey: ['all-ratings-judgements'] });
    await queryClient.invalidateQueries({ queryKey: ['indicators-full'] });
    // Brief visual feedback
    setTimeout(() => setRecalculating(false), 800);
  };

  if (!school) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-500">
        Loading school data…
      </div>
    );
  }

  // ── Per-domain rated/total counts from judgements.standards ──
  // We derive per-indicator counts by looking at what's in the standards
  // map vs what was returned by the ratings query.
  // Simpler: use the domainResults trace to infer completion status via
  // the indicator count data already in the hook's indicators query.
  // Since the hook doesn't expose per-domain counts directly, we'll rely
  // on comparing ratedCount/totalCount at domain level via the trace steps
  // (trace includes every standard with its worst indicator note).
  // For the page we need per-domain totals — expose from judgements.domainResults.
  const getStdCounts = (domainId: string) => {
    if (!judgements) return { rated: 0, total: 0 };
    // Each domain trace has steps for each standard, including the rule step.
    // We count standards whose trace note includes 'No indicators rated' as unrated.
    const dr = judgements.domainResults[Number(domainId) - 1];
    if (!dr) return { rated: 0, total: 0 };
    const stdSteps = dr.trace.filter((s) => s.label.startsWith('Standard'));
    const total = stdSteps.length;
    const rated = stdSteps.filter((s) => !s.note?.includes('No indicators rated')).length;
    return { rated, total };
  };

  const overall = judgements?.overall ?? 3 as JudgementLevel;
  const overallBanner = OVERALL_BANNER[overall];

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">School Judgements</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Auto-calculated from indicator ratings · {academicYear}
          </p>
        </div>
        <button
          onClick={handleRecalculate}
          disabled={recalculating || isLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm"
        >
          <RefreshCw className={`h-4 w-4 ${recalculating ? 'animate-spin' : ''}`} />
          Recalculate
        </button>
      </div>

      {/* ── Overall banner ── */}
      {isLoading ? (
        <div className="h-28 rounded-2xl bg-gray-100 animate-pulse" />
      ) : (
        <div className={`rounded-2xl border-2 px-6 py-5 ${overallBanner.bg} ${overallBanner.border}`}>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/70 mb-1">
                Overall School Performance
              </p>
              <p className="text-3xl font-bold text-white">
                {JUDGEMENT_LABELS[overall]}
              </p>
              <p className="text-sm text-white/80 mt-1">
                {judgements?.ratedCount ?? 0} of {judgements?.totalCount ?? 0} indicators rated
              </p>
            </div>
            {/* Overall trace accordion */}
            <OverallTrace steps={judgements?.overallResult?.trace ?? []} />
          </div>
        </div>
      )}

      {/* ── Domain cards ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Domain Judgements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
              ))
            : DOMAINS.map((domain) => {
                const level = (judgements?.domains[domain.id] ?? 3) as JudgementLevel;
                const dr = judgements?.domainResults[Number(domain.id) - 1];
                const { rated, total } = getStdCounts(domain.id);

                return (
                  <DomainCard
                    key={domain.id}
                    domainId={domain.id}
                    name={domain.name}
                    weight={domain.weight}
                    judgement={level}
                    traceSteps={dr?.trace ?? []}
                    limitingStandard={dr?.limitingStandard}
                    totalIndicators={total}
                    ratedIndicators={rated}
                  />
                );
              })}
        </CardContent>
      </Card>

      {/* ── Framework note ── */}
      <p className="text-xs text-gray-400 text-center">
        Judgement logic follows OAAAQA School Evaluation Framework (PSD §4.7–4.8).
        Domains 1, 3 &amp; 5 carry high weight in the overall outcome.
      </p>
    </div>
  );
}

// ─── Overall trace sub-component ─────────────────────────────

function OverallTrace({ steps }: { steps: TraceStep[] }) {
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;
  return (
    <div className="shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs text-white/80 hover:text-white transition-colors"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {open ? 'Hide' : 'Show'} calculation trace
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-black/20 px-3 py-2 max-w-sm">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-white/90 py-0.5">
              <span
                className="mt-0.5 shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{
                  backgroundColor: JUDGEMENT_COLORS[step.value as JudgementLevel] ?? 'rgba(255,255,255,0.3)',
                  color: 'white',
                }}
              >
                {step.value}
              </span>
              <div>
                <span className="font-medium">{step.label}</span>
                {step.note && <span className="ml-1 text-white/60">— {step.note}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
