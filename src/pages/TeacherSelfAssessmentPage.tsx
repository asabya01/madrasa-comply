import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { usePermissions } from '../hooks/usePermissions';
import { useToast } from '../components/ui/toast';
import {
  JUDGEMENT_LABELS_SHORT,
  JUDGEMENT_COLORS,
  type JudgementLevel,
} from '../lib/judgement';

// ─── Types ────────────────────────────────────────────────────

type Term = 'term_1' | 'term_2' | 'term_3' | 'annual';
type SubmitStatus = 'not_started' | 'draft' | 'submitted' | 'reviewed';

interface ClassRow {
  id: string;
  school_id: string;
  label: string;
  subject: string;
  student_count: number;
  teacher_id: string;
  academic_year_id: string | null;
}

interface StandardRow {
  id: string;
  domain_id: string;
  name_en: string;
  is_primary: boolean;
  order_num: number;
}

interface IndicatorRow {
  id: string;
  standard_id: string;
  domain_id: string;
  description_en: string;
  order_num: number;
}

interface TeacherRatingRow {
  id: string;
  teacher_id: string;
  class_id: string;
  indicator_id: string;
  term: Term;
  rating: number | null;
  self_assessment: string | null;
  status: 'draft' | 'submitted' | 'reviewed';
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

interface DraftEntry {
  rating: number | null;
  assessment: string;
}

// ─── Constants ────────────────────────────────────────────────

const TERM_LABELS: Record<Term, string> = {
  term_1: 'Term 1',
  term_2: 'Term 2',
  term_3: 'Term 3',
  annual: 'Annual',
};

// ─── Queries ─────────────────────────────────────────────────

function useMyClasses(schoolId: string | undefined, profileId: string | undefined) {
  return useQuery({
    queryKey: ['my-classes', schoolId, profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, school_id, label, subject, student_count, teacher_id, academic_year_id')
        .eq('school_id', schoolId!)
        .eq('teacher_id', profileId!)
        .order('label');
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
    enabled: !!schoolId && !!profileId,
  });
}

function useDomain3Framework() {
  return useQuery({
    queryKey: ['domain3-framework'],
    queryFn: async () => {
      const [{ data: standards, error: se }, { data: indicators, error: ie }] =
        await Promise.all([
          supabase.from('standards').select('*').eq('domain_id', '3').order('order_num'),
          supabase.from('indicators').select('*').eq('domain_id', '3').order('order_num'),
        ]);
      if (se) throw se;
      if (ie) throw ie;
      return {
        standards: (standards ?? []) as StandardRow[],
        indicators: (indicators ?? []) as IndicatorRow[],
      };
    },
    staleTime: 1000 * 60 * 60,
  });
}

function useTeacherRatings(
  profileId: string | undefined,
  classId: string | null,
  term: Term
) {
  return useQuery({
    queryKey: ['teacher-ratings', profileId, classId, term],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teacher_indicator_ratings')
        .select('*')
        .eq('teacher_id', profileId!)
        .eq('class_id', classId!)
        .eq('term', term);
      if (error) throw error;
      return (data ?? []) as TeacherRatingRow[];
    },
    enabled: !!profileId && !!classId,
  });
}

// ─── Page ─────────────────────────────────────────────────────

export default function TeacherSelfAssessmentPage() {
  const { school, profile } = useSchoolStore();
  const perms = usePermissions();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedTerm, setSelectedTerm] = useState<Term>('annual');
  const [drafts, setDrafts] = useState<Record<string, DraftEntry>>({});
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null);

  const { data: classes, isLoading: classesLoading } = useMyClasses(
    school?.id,
    profile?.id
  );
  const { data: framework, isLoading: frameworkLoading } = useDomain3Framework();
  const { data: existingRatings, isLoading: ratingsLoading } = useTeacherRatings(
    profile?.id,
    selectedClassId,
    selectedTerm
  );

  // Auto-select first class
  useEffect(() => {
    if (classes?.length && !selectedClassId) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId]);

  // Seed drafts from DB when class/term changes — don't overwrite live edits
  useEffect(() => {
    if (!existingRatings) return;
    setDrafts(prev => {
      const next: Record<string, DraftEntry> = {};
      // Wipe drafts for the new context and re-seed from DB
      for (const r of existingRatings) {
        next[r.indicator_id] = {
          rating: r.rating ?? null,
          assessment: r.self_assessment ?? '',
        };
      }
      // Preserve any local edits already present that aren't in DB yet
      for (const [id, d] of Object.entries(prev)) {
        if (!(id in next)) next[id] = d;
      }
      return next;
    });
  }, [existingRatings, selectedClassId, selectedTerm]);

  const setDraft = useCallback((indicatorId: string, patch: Partial<DraftEntry>) => {
    setDrafts(prev => ({
      ...prev,
      [indicatorId]: {
        rating: prev[indicatorId]?.rating ?? null,
        assessment: prev[indicatorId]?.assessment ?? '',
        ...patch,
      },
    }));
  }, []);

  // Derive submission status for current class+term
  const submissionStatus: SubmitStatus = (() => {
    if (!existingRatings?.length) return 'not_started';
    const statuses = existingRatings.map(r => r.status);
    if (statuses.some(s => s === 'reviewed')) return 'reviewed';
    if (statuses.every(s => s === 'submitted')) return 'submitted';
    return 'draft';
  })();

  const isReadOnly = submissionStatus === 'submitted' || submissionStatus === 'reviewed';

  const ratedCount = (framework?.indicators ?? []).filter(
    i => drafts[i.id]?.rating != null
  ).length;
  const totalCount = framework?.indicators.length ?? 0;

  async function handleSave(submitAction: boolean) {
    if (!school || !profile || !selectedClassId || !framework) return;

    const status = submitAction ? 'submitted' : 'draft';
    const now = new Date().toISOString();

    const rows = framework.indicators.map(ind => ({
      teacher_id: profile.id,
      class_id: selectedClassId,
      indicator_id: ind.id,
      term: selectedTerm,
      rating: drafts[ind.id]?.rating ?? null,
      self_assessment: drafts[ind.id]?.assessment || null,
      status,
      submitted_at: submitAction ? now : null,
    }));

    // Only upsert indicators that have at least a rating or assessment
    const toSave = rows.filter(r => r.rating != null || r.self_assessment);
    if (!toSave.length) {
      showToast('Rate at least one indicator before saving', 'info');
      return;
    }

    if (submitAction && ratedCount < totalCount) {
      const missing = totalCount - ratedCount;
      const confirmed = window.confirm(
        `${missing} indicator${missing > 1 ? 's are' : ' is'} not yet rated. Submit anyway?`
      );
      if (!confirmed) return;
    }

    setSaving(submitAction ? 'submit' : 'draft');
    const { error } = await supabase
      .from('teacher_indicator_ratings')
      .upsert(toSave, { onConflict: 'teacher_id,class_id,indicator_id,term' });
    setSaving(null);

    if (error) {
      showToast(`Save failed: ${error.message}`, 'error');
      return;
    }

    queryClient.invalidateQueries({
      queryKey: ['teacher-ratings', profile.id, selectedClassId, selectedTerm],
    });

    showToast(
      submitAction
        ? 'Self-assessment submitted for review'
        : `Draft saved (${toSave.length} indicator${toSave.length > 1 ? 's' : ''})`,
      'success'
    );
  }

  // ── No access ────────────────────────────────────────────────
  if (!perms.canRateDomain3Indicators) {
    return (
      <div className="min-h-screen bg-[#f7f6f2] flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center max-w-sm">
          <p className="text-2xl mb-3">🔒</p>
          <p className="text-base font-semibold text-gray-900">Access Restricted</p>
          <p className="text-sm text-gray-500 mt-1">
            Domain 3 self-assessment is only available to teachers and heads of department.
          </p>
        </div>
      </div>
    );
  }

  const loading = classesLoading || frameworkLoading;

  return (
    <div className="min-h-screen bg-[#f7f6f2]">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <h1 className="text-2xl font-semibold text-gray-900">Teacher Self-Assessment</h1>
        <p className="text-sm text-gray-500 mt-1">
          Domain 3 — Teaching and Assessment ·{' '}
          {profile?.full_name ?? 'Your classes'}
        </p>
      </div>

      {loading ? (
        <div className="px-8 py-6">
          <SkeletonPage />
        </div>
      ) : !classes?.length ? (
        <EmptyClasses />
      ) : (
        <>
          {/* ── Class + Term selectors ── */}
          <div className="px-8 pt-5 space-y-3">
            {/* Class tabs / select */}
            <ClassSelector
              classes={classes}
              selectedId={selectedClassId}
              onSelect={id => {
                setSelectedClassId(id);
                setDrafts({});
              }}
            />

            {/* Term pills */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 mr-1">Term:</span>
              {(Object.keys(TERM_LABELS) as Term[]).map(t => (
                <button
                  key={t}
                  onClick={() => {
                    setSelectedTerm(t);
                    setDrafts({});
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedTerm === t
                      ? 'bg-[#01696f] text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {TERM_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* ── Status banner ── */}
          {submissionStatus !== 'not_started' && (
            <div className="mx-8 mt-4">
              <StatusBanner
                status={submissionStatus}
                ratings={existingRatings ?? []}
              />
            </div>
          )}

          {/* ── Progress bar ── */}
          <div className="mx-8 mt-4">
            <ProgressBar rated={ratedCount} total={totalCount} />
          </div>

          {/* ── Indicator standards ── */}
          <div className="px-8 py-5 space-y-5 pb-28">
            {ratingsLoading ? (
              <SkeletonStandards />
            ) : (
              framework?.standards.map(standard => {
                const indicators = (framework.indicators ?? []).filter(
                  i => i.standard_id === standard.id
                );
                return (
                  <StandardSection
                    key={standard.id}
                    standard={standard}
                    indicators={indicators}
                    drafts={drafts}
                    existingRatings={existingRatings ?? []}
                    isReadOnly={isReadOnly}
                    onSetDraft={setDraft}
                  />
                );
              })
            )}
          </div>

          {/* ── Bottom action bar ── */}
          {!isReadOnly && (
            <div className="fixed bottom-0 left-60 right-0 bg-white border-t border-gray-200 px-8 py-4 flex items-center justify-between shadow-lg z-10">
              <div className="text-sm text-gray-500">
                {ratedCount} of {totalCount} indicators rated
                {ratedCount < totalCount && (
                  <span className="text-amber-600 ml-2">
                    ({totalCount - ratedCount} remaining)
                  </span>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleSave(false)}
                  disabled={saving !== null}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {saving === 'draft' ? <InlineSpinner /> : 'Save Draft'}
                </button>
                <button
                  onClick={() => handleSave(true)}
                  disabled={saving !== null || ratedCount === 0}
                  className="px-5 py-2 bg-[#01696f] text-white text-sm font-medium rounded-lg hover:bg-[#0c4e54] disabled:opacity-50 transition-colors"
                >
                  {saving === 'submit' ? <InlineSpinner /> : 'Submit for Review'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Class selector ───────────────────────────────────────────

function ClassSelector({
  classes,
  selectedId,
  onSelect,
}: {
  classes: ClassRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (classes.length <= 5) {
    return (
      <div className="flex gap-1.5 flex-wrap">
        {classes.map(c => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
              selectedId === c.id
                ? 'bg-[#01696f] text-white border-[#01696f]'
                : 'bg-white text-gray-700 border-gray-200 hover:border-[#01696f]/40 hover:bg-[#01696f]/5'
            }`}
          >
            <span className="font-semibold">{c.label}</span>
            <span className="ml-1.5 text-xs opacity-75">{c.subject}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <select
      value={selectedId ?? ''}
      onChange={e => onSelect(e.target.value)}
      className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#01696f] bg-white"
    >
      {classes.map(c => (
        <option key={c.id} value={c.id}>
          {c.label} — {c.subject}
        </option>
      ))}
    </select>
  );
}

// ─── Status banner ────────────────────────────────────────────

function StatusBanner({
  status,
  ratings,
}: {
  status: SubmitStatus;
  ratings: TeacherRatingRow[];
}) {
  const submittedAt = ratings.find(r => r.submitted_at)?.submitted_at;
  const reviewedAt  = ratings.find(r => r.reviewed_at)?.reviewed_at;

  const config = {
    draft: {
      bg: 'bg-amber-50 border-amber-200',
      text: 'text-amber-800',
      icon: '✏️',
      label: 'Draft — not yet submitted',
      sub: 'Your ratings are saved as a draft. Submit when ready for HOD review.',
    },
    submitted: {
      bg: 'bg-blue-50 border-blue-200',
      text: 'text-blue-800',
      icon: '📤',
      label: 'Submitted for review',
      sub: submittedAt
        ? `Submitted ${new Date(submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
        : 'Awaiting HOD review.',
    },
    reviewed: {
      bg: 'bg-green-50 border-green-200',
      text: 'text-green-800',
      icon: '✅',
      label: 'Reviewed by HOD',
      sub: reviewedAt
        ? `Reviewed ${new Date(reviewedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
        : 'This self-assessment has been reviewed.',
    },
    not_started: { bg: '', text: '', icon: '', label: '', sub: '' },
  }[status];

  if (status === 'not_started') return null;

  return (
    <div className={`flex items-start gap-3 p-3.5 rounded-xl border ${config.bg}`}>
      <span className="text-lg leading-none mt-0.5">{config.icon}</span>
      <div>
        <p className={`text-sm font-semibold ${config.text}`}>{config.label}</p>
        <p className={`text-xs mt-0.5 ${config.text} opacity-80`}>{config.sub}</p>
      </div>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────

function ProgressBar({ rated, total }: { rated: number; total: number }) {
  const pct = total > 0 ? Math.round((rated / total) * 100) : 0;
  const color = pct === 100 ? '#437a22' : pct >= 50 ? '#d19900' : '#da7101';

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-3.5 flex items-center gap-4">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-gray-600">
            Domain 3 completion
          </span>
          <span className="text-xs font-bold" style={{ color }}>
            {pct}%
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-lg font-bold text-gray-900 leading-none">
          {rated}
          <span className="text-sm font-normal text-gray-400"> / {total}</span>
        </p>
        <p className="text-xs text-gray-400 mt-0.5">indicators</p>
      </div>
    </div>
  );
}

// ─── Standard section ─────────────────────────────────────────

function StandardSection({
  standard,
  indicators,
  drafts,
  existingRatings,
  isReadOnly,
  onSetDraft,
}: {
  standard: StandardRow;
  indicators: IndicatorRow[];
  drafts: Record<string, DraftEntry>;
  existingRatings: TeacherRatingRow[];
  isReadOnly: boolean;
  onSetDraft: (id: string, patch: Partial<DraftEntry>) => void;
}) {
  const ratingsMap = Object.fromEntries(existingRatings.map(r => [r.indicator_id, r]));
  const ratedInStd = indicators.filter(i => drafts[i.id]?.rating != null).length;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Standard header */}
      <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-400 font-mono">{standard.id}</span>
          <span className="text-sm font-semibold text-gray-800">{standard.name_en}</span>
          {standard.is_primary && (
            <span className="text-xs px-1.5 py-0.5 bg-[#01696f]/10 text-[#01696f] rounded font-medium">
              Primary
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">
          {ratedInStd}/{indicators.length} rated
        </span>
      </div>

      {/* Indicator rows */}
      <div className="divide-y divide-gray-50">
        {indicators.map(indicator => (
          <IndicatorAssessmentRow
            key={indicator.id}
            indicator={indicator}
            draft={drafts[indicator.id] ?? { rating: null, assessment: '' }}
            saved={ratingsMap[indicator.id] ?? null}
            isReadOnly={isReadOnly}
            onSetDraft={onSetDraft}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Indicator row ────────────────────────────────────────────

function IndicatorAssessmentRow({
  indicator,
  draft,
  saved,
  isReadOnly,
  onSetDraft,
}: {
  indicator: IndicatorRow;
  draft: DraftEntry;
  saved: TeacherRatingRow | null;
  isReadOnly: boolean;
  onSetDraft: (id: string, patch: Partial<DraftEntry>) => void;
}) {
  const [assessOpen, setAssessOpen] = useState(false);

  return (
    <div className="px-5 py-4 hover:bg-gray-50/40 transition-colors">
      <div className="flex items-start gap-4">
        {/* Code */}
        <span className="shrink-0 text-xs font-mono font-bold text-gray-400 w-12 pt-0.5">
          {indicator.id}
        </span>

        {/* Description + assessment */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-700 leading-relaxed">{indicator.description_en}</p>

          {isReadOnly ? (
            saved?.self_assessment ? (
              <p className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 italic">
                "{saved.self_assessment}"
              </p>
            ) : null
          ) : (
            assessOpen ? (
              <textarea
                autoFocus
                value={draft.assessment}
                onChange={e => onSetDraft(indicator.id, { assessment: e.target.value })}
                onBlur={() => !draft.assessment && setAssessOpen(false)}
                placeholder="Describe your practice for this indicator…"
                rows={3}
                className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#01696f] text-gray-700 placeholder-gray-400"
              />
            ) : (
              <button
                onClick={() => setAssessOpen(true)}
                className="mt-1.5 text-xs transition-colors"
              >
                {draft.assessment ? (
                  <span className="text-gray-600 italic line-clamp-2">{draft.assessment}</span>
                ) : (
                  <span className="text-gray-400 hover:text-[#01696f]">+ Add self-assessment</span>
                )}
              </button>
            )
          )}
        </div>

        {/* Rating selector */}
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          {isReadOnly ? (
            <ReadOnlyRating rating={saved?.rating ?? null} />
          ) : (
            <RatingButtons
              value={draft.rating}
              onChange={r => onSetDraft(indicator.id, { rating: r })}
            />
          )}
          <RatingLabel rating={draft.rating ?? saved?.rating ?? null} />
        </div>
      </div>
    </div>
  );
}

// ─── Rating buttons ───────────────────────────────────────────

function RatingButtons({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (r: number | null) => void;
}) {
  return (
    <div className="flex gap-1">
      {([1, 2, 3, 4, 5] as JudgementLevel[]).map(level => {
        const active = value === level;
        return (
          <button
            key={level}
            title={`${level} — ${JUDGEMENT_LABELS_SHORT[level]}`}
            onClick={() => onChange(active ? null : level)}
            className={`w-8 h-8 rounded-lg text-xs font-bold transition-all border-2 ${
              active
                ? 'text-white border-transparent shadow-sm scale-105'
                : 'text-gray-500 bg-white border-gray-200 hover:border-gray-300'
            }`}
            style={
              active
                ? { backgroundColor: JUDGEMENT_COLORS[level], borderColor: JUDGEMENT_COLORS[level] }
                : {}
            }
          >
            {level}
          </button>
        );
      })}
    </div>
  );
}

function ReadOnlyRating({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-xs text-gray-400">Not rated</span>;
  const level = rating as JudgementLevel;
  return (
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow-sm"
      style={{ backgroundColor: JUDGEMENT_COLORS[level] }}
      title={JUDGEMENT_LABELS_SHORT[level]}
    >
      {rating}
    </div>
  );
}

function RatingLabel({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-xs text-gray-400">Not rated</span>;
  const level = rating as JudgementLevel;
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
      style={{ backgroundColor: JUDGEMENT_COLORS[level] }}
    >
      {JUDGEMENT_LABELS_SHORT[level]}
    </span>
  );
}

// ─── Empty states ─────────────────────────────────────────────

function EmptyClasses() {
  return (
    <div className="px-8 py-16 text-center">
      <p className="text-4xl mb-4">📚</p>
      <p className="text-base font-semibold text-gray-900">No classes assigned</p>
      <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">
        You don't have any classes assigned yet. Ask your school admin to assign classes to your profile.
      </p>
    </div>
  );
}

// ─── Skeletons ────────────────────────────────────────────────

function SkeletonPage() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex gap-2">
        {[1, 2, 3].map(i => <div key={i} className="h-10 w-32 bg-white rounded-xl border border-gray-200" />)}
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-8 w-20 bg-white rounded-lg border border-gray-200" />)}
      </div>
      <SkeletonStandards />
    </div>
  );
}

function SkeletonStandards() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100">
            <div className="h-4 bg-gray-200 rounded w-56" />
          </div>
          {[1, 2, 3].map(j => (
            <div key={j} className="px-5 py-4 flex gap-4 border-b border-gray-50 last:border-0">
              <div className="h-4 bg-gray-100 rounded w-10 mt-1 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-100 rounded w-full" />
                <div className="h-4 bg-gray-100 rounded w-2/3" />
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

// ─── Inline spinner ───────────────────────────────────────────

function InlineSpinner() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      Saving…
    </span>
  );
}
