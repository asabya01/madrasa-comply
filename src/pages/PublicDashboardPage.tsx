import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { JUDGEMENT_COLORS, JUDGEMENT_LABELS, type JudgementLevel } from '../lib/judgement';

// ─── Types ────────────────────────────────────────────────────

interface School {
  name_en: string | null;
  name_ar: string | null;
}

interface DomainJudgement {
  domain_id: string;
  judgement: number;
}

interface ActionItem {
  status: string;
}

const DOMAIN_NAMES: Record<string, { en: string; ar: string }> = {
  '1': { en: 'Academic Achievement',    ar: 'التحصيل الأكاديمي' },
  '2': { en: 'Personal Development',    ar: 'التنمية الشخصية' },
  '3': { en: 'Teaching & Assessment',   ar: 'التدريس والتقييم' },
  '4': { en: 'School Climate',          ar: 'المناخ المدرسي' },
  '5': { en: 'Leadership & Governance', ar: 'القيادة والحوكمة' },
};

// ─── Page ─────────────────────────────────────────────────────

export default function PublicDashboardPage() {
  const { schoolId } = useParams<{ schoolId: string }>();

  // 1. Fetch school + current academic year in parallel
  const { data: school, isLoading: schoolLoading, error: schoolError } = useQuery({
    queryKey: ['public-school', schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schools')
        .select('name_en, name_ar')
        .eq('id', schoolId!)
        .single();
      if (error) throw error;
      return data as School;
    },
    enabled: !!schoolId,
    retry: false,
  });

  const { data: currentYear, isLoading: yearLoading } = useQuery({
    queryKey: ['public-current-year', schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from('academic_years')
        .select('label')
        .eq('school_id', schoolId!)
        .eq('is_current', true)
        .maybeSingle();
      return data?.label as string | null ?? null;
    },
    enabled: !!schoolId,
  });

  // 2. Fetch judgements (depends on currentYear)
  const { data: overallJudgement, isLoading: ojLoading } = useQuery({
    queryKey: ['public-overall-judgement', schoolId, currentYear],
    queryFn: async () => {
      const { data } = await supabase
        .from('overall_judgements')
        .select('judgement')
        .eq('school_id', schoolId!)
        .eq('academic_year', currentYear!)
        .maybeSingle();
      return (data?.judgement as JudgementLevel | null) ?? null;
    },
    enabled: !!schoolId && !!currentYear,
  });

  const { data: domainJudgements = [], isLoading: djLoading } = useQuery({
    queryKey: ['public-domain-judgements', schoolId, currentYear],
    queryFn: async () => {
      const { data } = await supabase
        .from('domain_judgements')
        .select('domain_id, judgement')
        .eq('school_id', schoolId!)
        .eq('academic_year', currentYear!);
      return (data ?? []) as DomainJudgement[];
    },
    enabled: !!schoolId && !!currentYear,
  });

  // 3. Action items counts
  const { data: actionItems = [] } = useQuery({
    queryKey: ['public-action-items', schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from('action_items')
        .select('status')
        .eq('school_id', schoolId!)
        .eq('is_archived', false);
      return (data ?? []) as ActionItem[];
    },
    enabled: !!schoolId,
  });

  // 4. Survey response counts via templates
  const { data: surveyTemplates = [] } = useQuery({
    queryKey: ['public-survey-templates', schoolId, currentYear],
    queryFn: async () => {
      const { data } = await supabase
        .from('survey_templates')
        .select('id, target_group')
        .eq('school_id', schoolId!)
        .eq('academic_year', currentYear ?? '');
      return (data ?? []) as Array<{ id: string; target_group: string }>;
    },
    enabled: !!schoolId && !!currentYear,
  });

  const { data: surveyResponses = [] } = useQuery({
    queryKey: ['public-survey-responses', schoolId, currentYear],
    queryFn: async () => {
      const { data } = await supabase
        .from('survey_responses')
        .select('template_id')
        .eq('school_id', schoolId!)
        .eq('academic_year', currentYear ?? '');
      return (data ?? []) as Array<{ template_id: string }>;
    },
    enabled: !!schoolId && !!currentYear,
  });

  // ── Derived values ─────────────────────────────────────────
  const domainMap: Record<string, JudgementLevel> = {};
  for (const dj of domainJudgements) {
    domainMap[dj.domain_id] = dj.judgement as JudgementLevel;
  }

  const actionCounts = {
    in_progress: actionItems.filter((i) => i.status === 'in_progress').length,
    completed:   actionItems.filter((i) => i.status === 'completed').length,
    planned:     actionItems.filter((i) => ['not_started', 'planned'].includes(i.status)).length,
  };

  // Map template_id → target_group, then count responses per group
  const templateGroupMap: Record<string, string> = {};
  for (const t of surveyTemplates) templateGroupMap[t.id] = t.target_group;
  const surveyCounts: Record<string, number> = { staff: 0, parents: 0, students: 0 };
  for (const r of surveyResponses) {
    const group = templateGroupMap[r.template_id];
    if (group && group in surveyCounts) surveyCounts[group]++;
  }

  const isLoading = schoolLoading || yearLoading || ojLoading || djLoading;

  // ── Error / loading ────────────────────────────────────────
  if (schoolLoading) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-7 w-7 text-[#01696f] animate-spin" />
        </div>
      </Shell>
    );
  }

  if (schoolError || !school) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-24 text-center">
          <div>
            <p className="text-lg font-semibold text-gray-700">School not found</p>
            <p className="text-sm text-gray-400 mt-1">The link may be invalid or the school has no public profile.</p>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* ── 1. HEADER ────────────────────────────────────────── */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-900 leading-tight">{school.name_en}</h1>
        {school.name_ar && (
          <p className="text-xl text-gray-600 mt-1" dir="rtl">{school.name_ar}</p>
        )}
        <p className="text-sm text-[#01696f] font-semibold mt-3 tracking-wide uppercase">
          School Self-Evaluation Summary
        </p>
        {currentYear && (
          <p className="text-xs text-gray-400 mt-1">Academic Year {currentYear}</p>
        )}
      </div>

      {/* ── 2. OVERALL JUDGEMENT CARD ────────────────────────── */}
      <div className="flex justify-center mb-8">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-10 py-8 text-center min-w-[260px]">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Overall Judgement
          </p>
          {isLoading ? (
            <div className="h-12 w-40 bg-gray-100 rounded-full animate-pulse mx-auto" />
          ) : overallJudgement != null ? (
            <>
              <div
                className="inline-flex items-center justify-center px-6 py-3 rounded-full text-white text-lg font-bold shadow"
                style={{ backgroundColor: JUDGEMENT_COLORS[overallJudgement] }}
              >
                {JUDGEMENT_LABELS[overallJudgement]}
              </div>
              <p className="text-xs text-gray-400 mt-3">{currentYear}</p>
            </>
          ) : (
            <p className="text-sm text-gray-400 italic">Not yet calculated</p>
          )}
        </div>
      </div>

      {/* ── 3. DOMAIN JUDGEMENTS ─────────────────────────────── */}
      <Section title="Domain Judgements">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {['1', '2', '3', '4', '5'].map((id) => {
            const j = domainMap[id] ?? null;
            const names = DOMAIN_NAMES[id];
            return (
              <div key={id} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <p className="text-[10px] text-gray-400 font-semibold mb-1">DOMAIN {id}</p>
                <p className="text-xs font-medium text-gray-700 mb-3 leading-snug min-h-[2.5rem]">
                  {names.en}
                </p>
                {isLoading ? (
                  <div className="h-6 bg-gray-100 rounded-full animate-pulse" />
                ) : j != null ? (
                  <span
                    className="inline-block text-xs font-bold px-3 py-1 rounded-full text-white"
                    style={{ backgroundColor: JUDGEMENT_COLORS[j] }}
                  >
                    {JUDGEMENT_LABELS[j]}
                  </span>
                ) : (
                  <span className="text-xs text-gray-300 italic">—</span>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── 4. IMPROVEMENT PRIORITIES ────────────────────────── */}
      <Section title="Improvement Priorities">
        <div className="grid grid-cols-3 gap-4">
          {([
            { key: 'in_progress', label: 'In Progress', color: '#01696f' },
            { key: 'completed',   label: 'Completed',   color: '#437a22' },
            { key: 'planned',     label: 'Planned',     color: '#d19900' },
          ] as const).map(({ key, label, color }) => (
            <div key={key} className="bg-white rounded-xl border border-gray-200 p-5 text-center">
              <p
                className="text-4xl font-bold"
                style={{ color }}
              >
                {actionCounts[key]}
              </p>
              <p className="text-xs text-gray-500 mt-1 font-medium">{label}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 5. COMMUNITY ENGAGEMENT ──────────────────────────── */}
      <Section title="Community Engagement">
        <div className="grid grid-cols-3 gap-4">
          {([
            { key: 'staff',    label: 'Staff',   icon: '👩‍🏫' },
            { key: 'parents',  label: 'Parents', icon: '👨‍👩‍👧' },
            { key: 'students', label: 'Students',icon: '🎒' },
          ] as const).map(({ key, label, icon }) => (
            <div key={key} className="bg-white rounded-xl border border-gray-200 p-5 text-center">
              <p className="text-2xl mb-1">{icon}</p>
              <p className="text-3xl font-bold text-gray-900">{surveyCounts[key]}</p>
              <p className="text-xs text-gray-500 mt-1">{label} responses</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 6. FOOTER ────────────────────────────────────────── */}
      <footer className="mt-12 pt-6 border-t border-gray-200 text-center">
        <p className="text-xs text-gray-400 leading-relaxed max-w-lg mx-auto">
          Published by <span className="font-medium text-gray-600">{school.name_en}</span> in compliance with{' '}
          <span className="font-medium text-gray-600">OAAAQA Standard 5.5.3</span> —
          Transparency in data provision and sharing.
        </p>
        <p className="text-[10px] text-gray-300 mt-3">
          Powered by Madrasa Comply · OAAAQA School Evaluation Framework (2024)
        </p>
      </footer>
    </Shell>
  );
}

// ─── Layout shell (no sidebar, no top nav) ────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f6f2]">
      {/* Branded header bar */}
      <div className="bg-[#0c4e54] px-5 py-3 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
          <span className="text-white text-sm font-bold">M</span>
        </div>
        <span className="text-white text-sm font-semibold">Madrasa Comply</span>
        <span className="ml-auto text-white/50 text-xs">Public School Profile</span>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-10">{children}</div>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-base font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <span className="block w-3 h-3 rounded-sm" style={{ backgroundColor: '#01696f' }} />
        {title}
      </h2>
      {children}
    </div>
  );
}
