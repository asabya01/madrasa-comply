import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Upload, ChevronRight, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { JUDGEMENT_COLORS, JUDGEMENT_LABELS, JUDGEMENT_LABELS_SHORT, type JudgementLevel } from '../lib/judgement';

// ─── Types ────────────────────────────────────────────────────

type Term = 'term_1' | 'term_2' | 'term_3' | 'annual';

interface ClassStat {
  id: string;
  label: string;
  subject: string;
  student_count: number;
  completionByTerm: Record<Term, { rated: number; total: number; status: string | null }>;
}

// ─── Queries ─────────────────────────────────────────────────

function useTeacherDashboard(schoolId: string | undefined, profileId: string | undefined) {
  return useQuery({
    queryKey: ['teacher-dashboard', schoolId, profileId],
    queryFn: async () => {
      if (!schoolId || !profileId) return null;

      const [classesRes, indicatorsRes, ratingsRes, judgementRes] = await Promise.all([
        supabase.from('classes')
          .select('id, label, subject, student_count, teacher_id')
          .eq('school_id', schoolId)
          .eq('teacher_id', profileId)
          .order('label'),
        supabase.from('indicators').select('id').eq('domain_id', '3'),
        supabase.from('teacher_indicator_ratings')
          .select('class_id, indicator_id, term, rating, status')
          .eq('teacher_id', profileId),
        supabase.from('overall_judgements')
          .select('judgement, calculated_at')
          .eq('school_id', schoolId)
          .order('calculated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const classes   = (classesRes.data   ?? []) as Array<{ id: string; label: string; subject: string; student_count: number; teacher_id: string }>;
      const indicators = (indicatorsRes.data ?? []) as Array<{ id: string }>;
      const allRatings = (ratingsRes.data   ?? []) as Array<{ class_id: string; indicator_id: string; term: Term; rating: number | null; status: string }>;
      const overallJudgement = judgementRes.data as { judgement: number; calculated_at: string } | null;

      const TERMS: Term[] = ['term_1', 'term_2', 'term_3', 'annual'];
      const total = indicators.length;

      const classStats: ClassStat[] = classes.map(c => {
        const completionByTerm: ClassStat['completionByTerm'] = {} as ClassStat['completionByTerm'];
        for (const term of TERMS) {
          const termRatings = allRatings.filter(r => r.class_id === c.id && r.term === term);
          const rated = termRatings.filter(r => r.rating != null).length;
          const statuses = termRatings.map(r => r.status);
          const status = statuses.some(s => s === 'reviewed')
            ? 'reviewed'
            : statuses.every(s => s === 'submitted') && termRatings.length > 0
            ? 'submitted'
            : termRatings.length > 0
            ? 'draft'
            : null;
          completionByTerm[term] = { rated, total, status };
        }
        return { id: c.id, label: c.label, subject: c.subject, student_count: c.student_count, completionByTerm };
      });

      return { classStats, overallJudgement, totalIndicators: total };
    },
    enabled: !!schoolId && !!profileId,
  });
}

// ─── Page ─────────────────────────────────────────────────────

const TERM_LABELS: Record<Term, string> = {
  term_1: 'T1', term_2: 'T2', term_3: 'T3', annual: 'Annual',
};

export default function TeacherHomePage() {
  const { school, profile } = useSchoolStore();
  const { data, isLoading } = useTeacherDashboard(school?.id, profile?.id);
  const [activeTerm, setActiveTerm] = useState<Term>('annual');

  const greet = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="min-h-screen bg-[#f7f6f2]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <h1 className="text-2xl font-semibold text-gray-900">
          {greet()}, {profile?.full_name?.split(' ')[0] ?? 'Teacher'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Domain 3 Self-Assessment · {school?.name_en}
        </p>
      </div>

      {/* School judgement banner */}
      {data?.overallJudgement && (
        <div className="mx-8 mt-5">
          <OverallBanner judgement={data.overallJudgement.judgement} calculatedAt={data.overallJudgement.calculated_at} />
        </div>
      )}

      {/* Quick actions */}
      <div className="px-8 mt-5 flex gap-3">
        <Link
          to="/teacher-assessment"
          className="flex items-center gap-2 px-5 py-2.5 bg-[#01696f] text-white text-sm font-medium rounded-xl hover:bg-[#0c4e54] transition-colors shadow-sm"
        >
          <BookOpen className="h-4 w-4" />
          Self-Assessment
        </Link>
        <Link
          to="/evidence"
          className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
        >
          <Upload className="h-4 w-4" />
          Upload Evidence
        </Link>
      </div>

      {/* Term selector */}
      <div className="px-8 mt-6 flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500 mr-1">Viewing term:</span>
        {(['term_1', 'term_2', 'term_3', 'annual'] as Term[]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTerm(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTerm === t
                ? 'bg-[#01696f] text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {TERM_LABELS[t]}
          </button>
        ))}
      </div>

      {/* My Classes */}
      <div className="px-8 py-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">My Classes</h2>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-36 bg-white rounded-xl border border-gray-200 animate-pulse" />)}
          </div>
        ) : !data?.classStats.length ? (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
            <p className="text-4xl mb-3">📚</p>
            <p className="text-sm font-semibold text-gray-900">No classes assigned yet</p>
            <p className="text-xs text-gray-500 mt-1">Ask your school admin to assign classes to your profile.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.classStats.map(cls => {
              const stat = cls.completionByTerm[activeTerm];
              const pct  = stat.total > 0 ? Math.round((stat.rated / stat.total) * 100) : 0;
              const pctColor = pct === 100 ? '#437a22' : pct >= 50 ? '#d19900' : '#da7101';
              return (
                <Link
                  key={cls.id}
                  to="/teacher-assessment"
                  className="group bg-white border border-gray-200 rounded-xl p-5 hover:border-[#01696f] hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-base font-semibold text-gray-900 group-hover:text-[#01696f] transition-colors">
                        {cls.label}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{cls.subject}</p>
                    </div>
                    <StatusChip status={stat.status} />
                  </div>

                  {/* Progress bar */}
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">Domain 3 completion</span>
                      <span className="text-xs font-bold" style={{ color: pctColor }}>{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: pctColor }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">
                      {stat.rated} / {stat.total} indicators
                    </p>
                  </div>

                  <div className="flex items-center justify-end mt-3 text-[#01696f]">
                    <span className="text-xs font-medium group-hover:underline">Open</span>
                    <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Completion summary */}
      {data && data.classStats.length > 0 && (
        <div className="px-8 pb-8">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Overall Progress — {TERM_LABELS[activeTerm]}</h3>
            <div className="grid grid-cols-4 gap-3">
              {(['term_1', 'term_2', 'term_3', 'annual'] as Term[]).map(t => {
                const totalRated = data.classStats.reduce((s, c) => s + c.completionByTerm[t].rated, 0);
                const totalPossible = data.classStats.reduce((s, c) => s + c.completionByTerm[t].total, 0);
                const pct = totalPossible > 0 ? Math.round((totalRated / totalPossible) * 100) : 0;
                return (
                  <div key={t} className={`p-3 rounded-lg border ${t === activeTerm ? 'border-[#01696f] bg-[#01696f]/5' : 'border-gray-100'}`}>
                    <p className="text-xs font-medium text-gray-500">{TERM_LABELS[t]}</p>
                    <p className="text-xl font-bold text-gray-900 mt-0.5">{pct}%</p>
                    <p className="text-xs text-gray-400">{totalRated}/{totalPossible}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Status chip ──────────────────────────────────────────────

function StatusChip({ status }: { status: string | null }) {
  if (!status) return (
    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full font-medium">Not started</span>
  );
  const cfg = {
    draft:     { cls: 'bg-amber-100 text-amber-700', label: 'Draft' },
    submitted: { cls: 'bg-blue-100 text-blue-700',  label: 'Submitted', icon: true },
    reviewed:  { cls: 'bg-green-100 text-green-700', label: 'Reviewed',  icon: true },
  }[status] ?? { cls: 'bg-gray-100 text-gray-500', label: status };

  return (
    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>
      {status === 'reviewed' && <CheckCircle className="h-3 w-3" />}
      {cfg.label}
    </span>
  );
}

// ─── School judgement banner ──────────────────────────────────

function OverallBanner({ judgement, calculatedAt }: { judgement: number; calculatedAt: string }) {
  const level = judgement as JudgementLevel;
  const color = JUDGEMENT_COLORS[level];
  const date  = new Date(calculatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div
      className="flex items-center gap-4 px-5 py-3.5 rounded-xl border"
      style={{ backgroundColor: `${color}12`, borderColor: `${color}40` }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0"
        style={{ backgroundColor: color }}
      >
        {judgement}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">
          School Overall Judgement:{' '}
          <span style={{ color }}>{JUDGEMENT_LABELS[level]}</span>
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          Calculated {date} · Read-only
        </p>
      </div>
      <span className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: color }}>
        {JUDGEMENT_LABELS_SHORT[level]}
      </span>
    </div>
  );
}
