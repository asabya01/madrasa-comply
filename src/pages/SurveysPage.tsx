import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare, Copy, Check, ToggleLeft, ToggleRight, ChevronDown,
  Users, GraduationCap, Briefcase, BarChart2, Link2, X, Loader2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../stores/schoolStore';
import { useToast } from '../components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

// ─── Types ────────────────────────────────────────────────────

interface SurveyTemplate {
  id: string;
  school_id: string | null;
  academic_year: string | null;
  name_en: string;
  name_ar: string | null;
  target_group: 'staff' | 'parents' | 'students';
  share_token: string | null;
  is_active: boolean;
}

interface SurveyQuestion {
  id: string;
  template_id: string;
  question_en: string;
  question_type: 'scale_1_5' | 'yes_no' | 'text';
  domain_id: string | null;
  standard_id: string | null;
  sort_order: number;
}

interface SurveyResponse {
  id: string;
  template_id: string;
  responses_json: Record<string, string | number>;
}

// ─── Config ───────────────────────────────────────────────────

const TARGET_CONFIG = {
  staff: {
    label: 'Teaching Staff',
    icon: Briefcase,
    color: '#01696f',
    description: 'Teaching and support staff feedback on school quality',
  },
  parents: {
    label: 'Parents',
    icon: Users,
    color: '#d19900',
    description: 'Parent perspectives on school environment and engagement',
  },
  students: {
    label: 'Students',
    icon: GraduationCap,
    color: '#437a22',
    description: 'Student views on learning experiences and wellbeing',
  },
} as const;

const SCALE_COLORS = ['#c0392b', '#da7101', '#d19900', '#6fa832', '#437a22'];

// ─── Hooks ────────────────────────────────────────────────────

function usePlatformTemplates() {
  return useQuery({
    queryKey: ['platform-survey-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('survey_templates')
        .select('*')
        .is('school_id', null);
      if (error) throw error;
      return (data ?? []) as SurveyTemplate[];
    },
    staleTime: 1000 * 60 * 60,
  });
}

function useSchoolTemplates() {
  const { school, academicYear } = useSchoolStore();
  return useQuery({
    queryKey: ['school-survey-templates', school?.id, academicYear],
    queryFn: async () => {
      if (!school) return [] as SurveyTemplate[];
      const { data, error } = await supabase
        .from('survey_templates')
        .select('*')
        .eq('school_id', school.id)
        .eq('academic_year', academicYear);
      if (error) throw error;
      return (data ?? []) as SurveyTemplate[];
    },
    enabled: !!school,
  });
}

function useResponseCounts(templateIds: string[]) {
  return useQuery({
    queryKey: ['survey-response-counts', templateIds.sort().join(',')],
    queryFn: async () => {
      if (templateIds.length === 0) return {} as Record<string, number>;
      const counts: Record<string, number> = {};
      await Promise.all(
        templateIds.map(async (id) => {
          const { count } = await supabase
            .from('survey_responses')
            .select('id', { count: 'exact', head: true })
            .eq('template_id', id);
          counts[id] = count ?? 0;
        })
      );
      return counts;
    },
    enabled: templateIds.length > 0,
  });
}

// ─── Page ─────────────────────────────────────────────────────

export default function SurveysPage() {
  const [resultsTemplateId, setResultsTemplateId] = useState<string | null>(null);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Surveys</h1>
        <p className="text-sm text-gray-500 mt-1">
          Collect feedback from staff, parents, and students to support your self-evaluation.
        </p>
      </div>

      {resultsTemplateId ? (
        <ResultsPanel
          templateId={resultsTemplateId}
          onBack={() => setResultsTemplateId(null)}
        />
      ) : (
        <SurveyCards onViewResults={(id) => setResultsTemplateId(id)} />
      )}
    </div>
  );
}

// ─── Survey Cards ─────────────────────────────────────────────

function SurveyCards({ onViewResults }: { onViewResults: (id: string) => void }) {
  const { school, academicYear } = useSchoolStore();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [attachingId, setAttachingId] = useState<string | null>(null);

  const { data: platformTemplates = [] } = usePlatformTemplates();
  const { data: schoolTemplates = [], isLoading } = useSchoolTemplates();
  const { data: responseCounts = {} } = useResponseCounts(schoolTemplates.map((t) => t.id));

  // Auto-clone platform templates for this school+year on first load
  const cloneMutation = useMutation({
    mutationFn: async () => {
      if (!school) throw new Error('No school');
      const rows = platformTemplates.map((pt) => ({
        school_id: school.id,
        academic_year: academicYear,
        name_en: pt.name_en,
        name_ar: pt.name_ar,
        target_group: pt.target_group,
        is_active: true,
      }));
      const { data: newTemplates, error } = await supabase
        .from('survey_templates')
        .insert(rows)
        .select('*');
      if (error) throw error;

      // Clone questions for each new template
      for (const newTpl of (newTemplates ?? []) as SurveyTemplate[]) {
        const src = platformTemplates.find((p) => p.name_en === newTpl.name_en);
        if (!src) continue;
        const { data: questions } = await supabase
          .from('survey_questions')
          .select('*')
          .eq('template_id', src.id);
        if (questions && questions.length > 0) {
          await supabase.from('survey_questions').insert(
            (questions as SurveyQuestion[]).map((q) => ({
              template_id: newTpl.id,
              question_en: q.question_en,
              question_type: q.question_type,
              domain_id: q.domain_id,
              standard_id: q.standard_id,
              sort_order: q.sort_order,
            }))
          );
        }
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['school-survey-templates'] }),
  });

  const hasTriedClone = schoolTemplates.length > 0 || cloneMutation.isPending || cloneMutation.isSuccess;
  if (!isLoading && !hasTriedClone && platformTemplates.length > 0 && school) {
    cloneMutation.mutate();
  }

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('survey_templates').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['school-survey-templates'] }),
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  function copyLink(token: string, id: string) {
    const url = `${window.location.origin}/survey/${token}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      showToast('Survey link copied!', 'success');
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2500);
    });
  }

  async function attachAsEvidence(tpl: SurveyTemplate) {
    if (!school) return;
    setAttachingId(tpl.id);
    try {
      // 1. Get questions for this template to find mapped standard_ids
      const { data: questions, error: qErr } = await supabase
        .from('survey_questions')
        .select('domain_id, standard_id')
        .eq('template_id', tpl.id);
      if (qErr) throw qErr;

      // Unique standard_ids from questions
      const standardIds = [...new Set(
        (questions ?? [])
          .map((q: { standard_id: string | null }) => q.standard_id)
          .filter((s): s is string => !!s)
      )];

      if (!standardIds.length) throw new Error('No standard mappings found in questions');

      // 2. Find indicators matching those standards
      const { data: indicators, error: iErr } = await supabase
        .from('indicators')
        .select('id, standard_id, domain_id')
        .in('standard_id', standardIds);
      if (iErr) throw iErr;
      if (!indicators?.length) throw new Error('No indicators found for the mapped standards');

      // 3. Create a virtual evidence_files record representing this survey
      const { data: evFile, error: efErr } = await supabase
        .from('evidence_files')
        .insert({
          school_id: school.id,
          file_name: `Survey Results — ${tpl.name_en}`,
          file_path: `surveys/${tpl.id}`,
          file_type: 'survey',
          description: `Stakeholder survey responses (${TARGET_CONFIG[tpl.target_group]?.label ?? tpl.target_group})`,
        })
        .select('id')
        .single();
      if (efErr) throw efErr;

      // 4. Link each indicator to the evidence file
      const links = indicators.map((ind: { id: string; standard_id: string | null; domain_id: string | null }) => ({
        evidence_file_id: evFile.id,
        indicator_id: ind.id,
        standard_id: ind.standard_id,
        domain_id: ind.domain_id,
        school_id: school.id,
      }));

      const { error: linkErr } = await supabase
        .from('evidence_indicator_links')
        .upsert(links, { onConflict: 'evidence_file_id,indicator_id' });
      if (linkErr) throw linkErr;

      showToast(`Linked to ${indicators.length} indicators`, 'success');
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setAttachingId(null);
    }
  }

  if (isLoading || cloneMutation.isPending) {
    return (
      <div className="text-center py-12 text-sm text-gray-400">
        Setting up your surveys…
      </div>
    );
  }

  // Order: staff, parents, students
  const ORDER: SurveyTemplate['target_group'][] = ['staff', 'parents', 'students'];
  const sorted = [...schoolTemplates].sort(
    (a, b) => ORDER.indexOf(a.target_group) - ORDER.indexOf(b.target_group)
  );

  return (
    <div className="grid gap-5 md:grid-cols-3">
      {sorted.map((tpl) => {
        const cfg = TARGET_CONFIG[tpl.target_group];
        const Icon = cfg.icon;
        const count = responseCounts[tpl.id] ?? 0;
        const isAttaching = attachingId === tpl.id;

        return (
          <Card key={tpl.id} className="flex flex-col">
            <CardContent className="pt-5 flex flex-col flex-1 gap-4">
              {/* Header */}
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${cfg.color}18` }}
                >
                  <Icon className="h-5 w-5" style={{ color: cfg.color }} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{cfg.label}</h3>
                  <p className="text-xs text-gray-400 mt-0.5 leading-snug">{cfg.description}</p>
                </div>
              </div>

              {/* Response count */}
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl">
                <MessageSquare className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="text-sm font-semibold text-gray-900">{count}</span>
                <span className="text-xs text-gray-500">response{count !== 1 ? 's' : ''} received</span>
              </div>

              {/* Actions */}
              <div className="mt-auto space-y-2">
                {/* Active toggle */}
                <button
                  onClick={() => toggleMutation.mutate({ id: tpl.id, is_active: !tpl.is_active })}
                  disabled={toggleMutation.isPending}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {tpl.is_active
                    ? <ToggleRight className="h-4 w-4 text-[#01696f]" />
                    : <ToggleLeft className="h-4 w-4 text-gray-400" />}
                  <span>{tpl.is_active ? 'Active — accepting responses' : 'Inactive — not accepting'}</span>
                </button>

                {/* Copy link */}
                {tpl.share_token && (
                  <button
                    onClick={() => copyLink(tpl.share_token!, tpl.id)}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {copiedId === tpl.id
                      ? <Check className="h-3.5 w-3.5 text-green-600" />
                      : <Copy className="h-3.5 w-3.5 text-gray-400" />}
                    {copiedId === tpl.id ? 'Link copied!' : 'Copy Survey Link'}
                  </button>
                )}

                {/* View results */}
                <button
                  onClick={() => onViewResults(tpl.id)}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <BarChart2 className="h-3.5 w-3.5 text-gray-400" />
                  View Results
                </button>

                {/* Attach as evidence */}
                <button
                  onClick={() => void attachAsEvidence(tpl)}
                  disabled={isAttaching || count === 0}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-dashed border-[#01696f] text-xs font-medium text-[#01696f] hover:bg-[#01696f]/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isAttaching
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Link2 className="h-3.5 w-3.5" />}
                  {isAttaching ? 'Linking…' : 'Attach as Evidence'}
                </button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {sorted.length === 0 && !cloneMutation.isPending && (
        <div className="col-span-3 text-center py-12 text-sm text-gray-400">
          No surveys found. Platform templates may not be seeded — contact your admin.
        </div>
      )}
    </div>
  );
}

// ─── Results Panel ────────────────────────────────────────────

function ResultsPanel({ templateId, onBack }: { templateId: string; onBack: () => void }) {
  const { data: schoolTemplates = [] } = useSchoolTemplates();
  const [selectedId, setSelectedId] = useState(templateId);
  const effectiveId = selectedId || templateId;

  const { data: questions = [] } = useQuery({
    queryKey: ['survey-questions', effectiveId],
    queryFn: async () => {
      if (!effectiveId) return [] as SurveyQuestion[];
      const { data, error } = await supabase
        .from('survey_questions')
        .select('*')
        .eq('template_id', effectiveId)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as SurveyQuestion[];
    },
    enabled: !!effectiveId,
  });

  const { data: responses = [] } = useQuery({
    queryKey: ['survey-responses', effectiveId],
    queryFn: async () => {
      if (!effectiveId) return [] as SurveyResponse[];
      const { data, error } = await supabase
        .from('survey_responses')
        .select('id, template_id, responses_json')
        .eq('template_id', effectiveId);
      if (error) throw error;
      return (data ?? []) as SurveyResponse[];
    },
    enabled: !!effectiveId,
  });

  const tpl = schoolTemplates.find((t) => t.id === effectiveId);

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-[#01696f] hover:underline"
        >
          <X className="h-4 w-4" /> Close results
        </button>

        <div className="relative ml-auto w-64">
          <select
            value={effectiveId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full appearance-none bg-white border border-gray-200 rounded-xl px-4 py-2.5 pr-9 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#01696f]"
          >
            {schoolTemplates.map((t) => (
              <option key={t.id} value={t.id}>{t.name_en}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {tpl && (
        <div className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl">
          <MessageSquare className="h-5 w-5 text-gray-400" />
          <div>
            <p className="text-sm font-semibold text-gray-900">{tpl.name_en}</p>
            <p className="text-xs text-gray-400">{responses.length} total responses</p>
          </div>
        </div>
      )}

      {responses.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">
          No responses yet for this survey.
        </div>
      ) : (
        <div className="space-y-5">
          {questions.map((q) => (
            <QuestionResult key={q.id} question={q} responses={responses} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Question result card ─────────────────────────────────────

function QuestionResult({ question, responses }: {
  question: SurveyQuestion;
  responses: SurveyResponse[];
}) {
  const answers = responses.map((r) => r.responses_json[question.id]);
  const n = answers.filter((a) => a != null).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-900">{question.question_en}</CardTitle>
        <p className="text-xs text-gray-400">{n} response{n !== 1 ? 's' : ''}</p>
      </CardHeader>
      <CardContent>
        {question.question_type === 'scale_1_5' && <Scale5Chart answers={answers as number[]} />}
        {question.question_type === 'yes_no'    && <YesNoChart  answers={answers as string[]} />}
        {question.question_type === 'text'      && <TextAnswers answers={answers as string[]} />}
      </CardContent>
    </Card>
  );
}

function Scale5Chart({ answers }: { answers: number[] }) {
  const labels = ['1 – Strongly Disagree', '2 – Disagree', '3 – Neutral', '4 – Agree', '5 – Strongly Agree'];
  const data = [1, 2, 3, 4, 5].map((v, i) => ({
    label: labels[i],
    count: answers.filter((a) => Number(a) === v).length,
  }));
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={160} />
        <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} formatter={(v) => [v, 'Responses']} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => <Cell key={i} fill={SCALE_COLORS[i]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function YesNoChart({ answers }: { answers: string[] }) {
  const yes   = answers.filter((a) => String(a).toLowerCase() === 'yes').length;
  const no    = answers.filter((a) => String(a).toLowerCase() === 'no').length;
  const total = yes + no || 1;
  return (
    <div className="space-y-2">
      {[
        { label: 'Yes', count: yes, color: '#437a22' },
        { label: 'No',  count: no,  color: '#c0392b' },
      ].map(({ label, count, color }) => (
        <div key={label} className="flex items-center gap-3">
          <span className="text-xs text-gray-600 w-6">{label}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(count / total) * 100}%`, backgroundColor: color }}
            />
          </div>
          <span className="text-xs text-gray-500 w-16 text-right">
            {count} ({Math.round((count / total) * 100)}%)
          </span>
        </div>
      ))}
    </div>
  );
}

function TextAnswers({ answers }: { answers: string[] }) {
  const nonEmpty = answers.filter((a) => a && String(a).trim()).slice(-5);
  if (!nonEmpty.length) return <p className="text-xs text-gray-400">No text responses yet.</p>;
  return (
    <ul className="space-y-2">
      {nonEmpty.map((a, i) => (
        <li key={i} className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
          {String(a).slice(0, 120)}{String(a).length > 120 ? '…' : ''}
        </li>
      ))}
    </ul>
  );
}
