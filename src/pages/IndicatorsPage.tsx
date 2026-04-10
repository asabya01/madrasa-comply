import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { useAllRatings } from '../hooks/useIndicatorRatings';
import { useToast } from '../components/ui/toast';
import {
  JUDGEMENT_LABELS_SHORT,
  JUDGEMENT_COLORS,
  type JudgementLevel,
} from '../lib/judgement';
import type { Domain, Standard, Indicator, IndicatorRating } from '../types';

// ─── Types ────────────────────────────────────────────────────

interface DraftRating {
  rating: number | null;
  notes: string;
}

// ─── Framework query (static seed data — long cache) ─────────

function useFramework() {
  return useQuery({
    queryKey: ['framework'],
    queryFn: async () => {
      const [{ data: domains }, { data: standards }, { data: indicators }] =
        await Promise.all([
          supabase.from('domains').select('*').order('order_num'),
          supabase.from('standards').select('*').order('order_num'),
          supabase.from('indicators').select('*').order('order_num'),
        ]);
      return {
        domains: (domains ?? []) as Domain[],
        standards: (standards ?? []) as Standard[],
        indicators: (indicators ?? []) as Indicator[],
      };
    },
    staleTime: 1000 * 60 * 60, // 1 hour — framework data is static
  });
}

// ─── Page ─────────────────────────────────────────────────────

export default function IndicatorsPage() {
  const { school, academicYear, profile } = useSchoolStore();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: framework, isLoading: frameworkLoading } = useFramework();
  const { data: ratings, isLoading: ratingsLoading } = useAllRatings();

  const [activeTab, setActiveTab] = useState<string>('1');
  // drafts: local edits not yet saved
  const [drafts, setDrafts] = useState<Record<string, DraftRating>>({});
  // recentlySaved: indicatorId → Date saved in this session
  const [recentlySaved, setRecentlySaved] = useState<Record<string, Date>>({});
  // saving: standardId currently being bulk-saved
  const [saving, setSaving] = useState<string | null>(null);

  // Build ratingsMap for dirty-check and last-saved display
  const ratingsMap: Record<string, IndicatorRating> = {};
  for (const r of ratings ?? []) {
    ratingsMap[r.indicator_id] = r;
  }

  // Seed drafts from DB on first load — don't overwrite user edits
  useEffect(() => {
    if (!ratings) return;
    setDrafts(prev => {
      const next = { ...prev };
      for (const r of ratings) {
        if (!(r.indicator_id in next)) {
          next[r.indicator_id] = {
            rating: r.rating ?? null,
            notes: r.self_eval_notes ?? '',
          };
        }
      }
      return next;
    });
  }, [ratings]);

  // Set active tab to first domain once loaded
  useEffect(() => {
    if (framework?.domains.length && !activeTab) {
      setActiveTab(framework.domains[0].id);
    }
  }, [framework]);

  const setDraft = useCallback(
    (indicatorId: string, patch: Partial<DraftRating>) => {
      setDrafts(prev => ({
        ...prev,
        [indicatorId]: {
          rating: prev[indicatorId]?.rating ?? null,
          notes: prev[indicatorId]?.notes ?? '',
          ...patch,
        },
      }));
    },
    []
  );

  function isDirty(indicatorId: string): boolean {
    const draft = drafts[indicatorId];
    if (!draft) return false;
    const saved = ratingsMap[indicatorId];
    return (
      draft.rating !== (saved?.rating ?? null) ||
      draft.notes !== (saved?.self_eval_notes ?? '')
    );
  }

  async function saveStandard(standardId: string, indicatorIds: string[]) {
    if (!school) return;

    const toSave = indicatorIds
      .filter(id => {
        const d = drafts[id];
        return d?.rating != null && isDirty(id);
      })
      .map(id => ({
        school_id: school.id,
        indicator_id: id,
        academic_year: academicYear,
        rating: drafts[id].rating,
        self_eval_notes: drafts[id].notes || null,
        rated_by: profile?.id ?? null,
        rated_at: new Date().toISOString(),
      }));

    if (!toSave.length) {
      showToast('No rated indicators to save', 'info');
      return;
    }

    setSaving(standardId);
    const { error } = await supabase
      .from('indicator_ratings')
      .upsert(toSave, { onConflict: 'school_id,indicator_id,academic_year' });
    setSaving(null);

    if (error) {
      showToast(`Save failed: ${error.message}`, 'error');
      return;
    }

    const now = new Date();
    setRecentlySaved(prev => {
      const next = { ...prev };
      for (const row of toSave) next[row.indicator_id] = now;
      return next;
    });

    queryClient.invalidateQueries({ queryKey: ['all-ratings'] });
    queryClient.invalidateQueries({ queryKey: ['indicator-ratings'] });
    showToast(`Saved ${toSave.length} indicator${toSave.length > 1 ? 's' : ''}`, 'success');
  }

  const loading = frameworkLoading || ratingsLoading;

  if (!school) {
    return (
      <div className="p-8 text-center text-gray-400">
        No school context. Please log in again.
      </div>
    );
  }

  const domains = framework?.domains ?? [];
  const standards = framework?.standards ?? [];
  const indicators = framework?.indicators ?? [];

  // Stats for tab badges
  const totalIndicators = indicators.length;
  const ratedCount = indicators.filter(i => ratingsMap[i.id]?.rating != null).length;

  return (
    <div className="min-h-screen bg-[#f7f6f2]">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Indicator Ratings</h1>
            <p className="text-sm text-gray-500 mt-1">
              {school.name_en} · {academicYear}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <ProgressPill rated={ratedCount} total={totalIndicators} />
          </div>
        </div>
      </div>

      {/* ── Domain tabs ── */}
      <div className="px-8 pt-5">
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1.5 w-fit shadow-sm overflow-x-auto">
          {domains.map(d => {
            const domainIndicators = indicators.filter(i =>
              standards.filter(s => s.domain_id === d.id).some(s => s.id === i.standard_id)
            );
            const domainRated = domainIndicators.filter(
              i => ratingsMap[i.id]?.rating != null
            ).length;
            const complete = domainRated === domainIndicators.length && domainIndicators.length > 0;

            return (
              <button
                key={d.id}
                onClick={() => setActiveTab(d.id)}
                className={`relative flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                  activeTab === d.id
                    ? 'bg-[#01696f] text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Domain {d.id}
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeTab === d.id
                      ? complete ? 'bg-white/30' : 'bg-white/20'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {domainRated}/{domainIndicators.length}
                </span>
                {complete && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#437a22] rounded-full border-2 border-white" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="px-8 py-6 space-y-5">
        {loading ? (
          <SkeletonStandards />
        ) : (
          domains
            .filter(d => d.id === activeTab)
            .map(domain => (
              <div key={domain.id}>
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-gray-800">
                    Domain {domain.id}: {domain.name_en}
                  </h2>
                  <p className="text-xs text-gray-400 capitalize mt-0.5">
                    Weight: {domain.weight} · {domain.key_category}
                  </p>
                </div>

                {standards
                  .filter(s => s.domain_id === domain.id)
                  .map(standard => {
                    const stdIndicators = indicators.filter(
                      i => i.standard_id === standard.id
                    );
                    const dirtyIds = stdIndicators
                      .filter(i => isDirty(i.id))
                      .map(i => i.id);
                    const ratedInStd = stdIndicators.filter(
                      i => (drafts[i.id]?.rating ?? ratingsMap[i.id]?.rating) != null
                    ).length;

                    return (
                      <StandardCard
                        key={standard.id}
                        standard={standard}
                        indicators={stdIndicators}
                        ratingsMap={ratingsMap}
                        drafts={drafts}
                        recentlySaved={recentlySaved}
                        dirtyCount={dirtyIds.length}
                        ratedCount={ratedInStd}
                        isSaving={saving === standard.id}
                        onSetDraft={setDraft}
                        onSave={() =>
                          saveStandard(
                            standard.id,
                            stdIndicators.map(i => i.id)
                          )
                        }
                      />
                    );
                  })}
              </div>
            ))
        )}
      </div>
    </div>
  );
}

// ─── Standard Card ────────────────────────────────────────────

function StandardCard({
  standard,
  indicators,
  ratingsMap,
  drafts,
  recentlySaved,
  dirtyCount,
  ratedCount,
  isSaving,
  onSetDraft,
  onSave,
}: {
  standard: Standard;
  indicators: Indicator[];
  ratingsMap: Record<string, IndicatorRating>;
  drafts: Record<string, DraftRating>;
  recentlySaved: Record<string, Date>;
  dirtyCount: number;
  ratedCount: number;
  isSaving: boolean;
  onSetDraft: (id: string, patch: Partial<DraftRating>) => void;
  onSave: () => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Standard header */}
      <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-gray-400 font-mono shrink-0">
            {standard.id}
          </span>
          <span className="text-sm font-semibold text-gray-800 truncate">
            {standard.name_en}
          </span>
          {standard.is_primary && (
            <span className="shrink-0 text-xs px-1.5 py-0.5 bg-[#01696f]/10 text-[#01696f] rounded font-medium">
              Primary
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0 ml-4">
          <span className="text-xs text-gray-400">
            {ratedCount}/{indicators.length} rated
          </span>
          <button
            onClick={onSave}
            disabled={isSaving || dirtyCount === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              dirtyCount > 0
                ? 'bg-[#01696f] text-white hover:bg-[#0c4e54]'
                : 'bg-gray-100 text-gray-400 cursor-default'
            } disabled:opacity-60`}
          >
            {isSaving ? (
              <>
                <Spinner />
                Saving…
              </>
            ) : dirtyCount > 0 ? (
              `Save ${dirtyCount} change${dirtyCount > 1 ? 's' : ''}`
            ) : (
              '✓ Saved'
            )}
          </button>
        </div>
      </div>

      {/* Indicator rows */}
      <div className="divide-y divide-gray-50">
        {indicators.map(indicator => (
          <IndicatorRow
            key={indicator.id}
            indicator={indicator}
            saved={ratingsMap[indicator.id] ?? null}
            draft={drafts[indicator.id] ?? { rating: null, notes: '' }}
            savedAt={recentlySaved[indicator.id] ?? null}
            onSetDraft={onSetDraft}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Indicator Row ────────────────────────────────────────────

function IndicatorRow({
  indicator,
  saved,
  draft,
  savedAt,
  onSetDraft,
}: {
  indicator: Indicator;
  saved: IndicatorRating | null;
  draft: DraftRating;
  savedAt: Date | null;
  onSetDraft: (id: string, patch: Partial<DraftRating>) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);

  const displayRating = draft.rating;
  const dbTimestamp = savedAt ?? (saved?.rated_at ? new Date(saved.rated_at) : null);

  return (
    <div className="px-5 py-4 hover:bg-gray-50/40 transition-colors">
      <div className="flex items-start gap-4">
        {/* Indicator code */}
        <span className="shrink-0 text-xs font-mono font-bold text-gray-400 w-12 pt-0.5">
          {indicator.id}
        </span>

        {/* Description + notes */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-700 leading-relaxed">{indicator.description_en}</p>

          {/* Notes toggle */}
          {notesOpen ? (
            <textarea
              autoFocus
              value={draft.notes}
              onChange={e => onSetDraft(indicator.id, { notes: e.target.value })}
              onBlur={() => !draft.notes && setNotesOpen(false)}
              placeholder="Add evaluation notes…"
              rows={2}
              className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#01696f] text-gray-700 placeholder-gray-400"
            />
          ) : (
            <button
              onClick={() => setNotesOpen(true)}
              className="mt-1.5 text-xs text-gray-400 hover:text-[#01696f] transition-colors"
            >
              {draft.notes ? (
                <span className="text-gray-600 italic line-clamp-1">{draft.notes}</span>
              ) : (
                '+ Add notes'
              )}
            </button>
          )}

          {/* Last saved timestamp */}
          {dbTimestamp && (
            <p className="mt-1 text-xs text-gray-400">
              Last saved {formatRelative(dbTimestamp)}
            </p>
          )}
        </div>

        {/* Rating selector */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          <div className="flex gap-1">
            {([1, 2, 3, 4, 5] as JudgementLevel[]).map(level => {
              const active = displayRating === level;
              return (
                <button
                  key={level}
                  title={`${level} — ${JUDGEMENT_LABELS_SHORT[level]}`}
                  onClick={() =>
                    onSetDraft(indicator.id, {
                      rating: active ? null : level,
                    })
                  }
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-all border-2 ${
                    active
                      ? 'text-white border-transparent shadow-sm scale-105'
                      : 'text-gray-500 bg-white border-gray-200 hover:border-gray-300'
                  }`}
                  style={active ? { backgroundColor: JUDGEMENT_COLORS[level], borderColor: JUDGEMENT_COLORS[level] } : {}}
                >
                  {level}
                </button>
              );
            })}
          </div>
          {displayRating ? (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: JUDGEMENT_COLORS[displayRating as JudgementLevel] }}
            >
              {JUDGEMENT_LABELS_SHORT[displayRating as JudgementLevel]}
            </span>
          ) : (
            <span className="text-xs text-gray-400">Not rated</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Progress Pill ────────────────────────────────────────────

function ProgressPill({ rated, total }: { rated: number; total: number }) {
  const pct = total > 0 ? Math.round((rated / total) * 100) : 0;
  const color =
    pct >= 80 ? '#437a22' : pct >= 50 ? '#d19900' : '#da7101';

  return (
    <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm">
      <div>
        <p className="text-xs text-gray-500">Indicators Rated</p>
        <p className="text-lg font-bold text-gray-900 leading-none mt-0.5">
          {rated} <span className="text-sm font-normal text-gray-400">/ {total}</span>
        </p>
      </div>
      <div className="w-px h-8 bg-gray-200" />
      <div>
        <p className="text-xs text-gray-500">Complete</p>
        <p className="text-lg font-bold leading-none mt-0.5" style={{ color }}>
          {pct}%
        </p>
      </div>
      <div className="w-24">
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Inline spinner ───────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────

function SkeletonStandards() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex justify-between">
            <div className="h-4 bg-gray-200 rounded w-64" />
            <div className="h-7 bg-gray-200 rounded w-28" />
          </div>
          {[1, 2, 3, 4].map(j => (
            <div key={j} className="px-5 py-4 flex gap-4 border-b border-gray-50">
              <div className="h-4 bg-gray-100 rounded w-10 mt-1 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-100 rounded w-full" />
                <div className="h-4 bg-gray-100 rounded w-3/4" />
              </div>
              <div className="flex gap-1 shrink-0">
                {[1,2,3,4,5].map(k => (
                  <div key={k} className="w-8 h-8 bg-gray-100 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function formatRelative(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
