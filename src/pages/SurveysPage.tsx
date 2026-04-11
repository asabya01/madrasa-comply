import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare, Copy, Check, ToggleLeft, ToggleRight, ChevronDown,
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
  question_type: 'scale5' | 'yesno' | 'text';
  domain_id: string | null;
  standard_id: string | null;
  sort_order: number;
}

interface SurveyResponse {
  id: string;
  template_id: string;
  responses_json: Record<string, string | number>;
}

const TARGET_GROUP_LABELS: Record<string, string> = {
  staff: 'Teaching Staff',
  parents: 'Parents',
  students: 'Students',
};

const TARGET_GROUP_COLORS: Record<string, string> = {
  staff: '#01696f',
  parents: '#d19900',
  students: '#437a22',
};

const SCALE5_COLORS = ['#437a22', '#6fa832', '#d19900', '#da7101', '#c0392b'];

// ─── Hooks ────────────────────────────────────────────────────

function usePlatformTemplates() {
  return useQuery({
    queryKey: ['platform-survey-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('survey_templates')
        .select('*')
        .is('school_id', null)
        .eq('is_active', false);
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
  const [tab, setTab] = useState<'manage' | 'results'>('manage');

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Surveys</h1>
        <p className="text-sm text-gray-500 mt-1">
          Collect feedback from staff, parents, and students to support your self-evaluation.
        </p>
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {(['manage', 'results'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'manage' ? 'Manage Surveys' : 'Results'}
          </button>
        ))}
      </div>

      {tab === 'manage' ? <ManageTab /> : <ResultsTab />}
    </div>
  );
}

// ─── Manage Tab ───────────────────────────────────────────────

function ManageTab() {
  const { school, academicYear } = useSchoolStore();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: platformTemplates = [] } = usePlatformTemplates();
  const { data: schoolTemplates = [], isLoading } = useSchoolTemplates();
  const { data: responseCounts = {} } = useResponseCounts(schoolTemplates.map((t) => t.id));

  // Auto-clone platform templates if none exist for this school+year
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
      const { data, error } = await supabase
        .from('survey_templates')
        .insert(rows)
        .select('id, template_id_source:id')
        .select('*');
      if (error) throw error;

      // Clone questions for each new template
      if (data) {
        for (const newTpl of data as SurveyTemplate[]) {
          const src = platformTemplates.find((p) => p.name_en === newTpl.name_en);
          if (!src) continue;
          const { data: questions } = await supabase
            .from('survey_questions')
            .select('*')
            .eq('template_id', src.id);
          if (questions && questions.length > 0) {
            const qRows = (questions as SurveyQuestion[]).map((q) => ({
              template_id: newTpl.id,
              question_en: q.question_en,
              question_type: q.question_type,
              domain_id: q.domain_id,
              standard_id: q.standard_id,
              sort_order: q.sort_order,
            }));
            await supabase.from('survey_questions').insert(qRows);
          }
        }
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['school-survey-templates'] });
    },
  });

  // Auto-clone once on first load when no templates exist
  const hasTriedClone = schoolTemplates.length > 0 || cloneMutation.isPending || cloneMutation.isSuccess;
  if (!isLoading && !hasTriedClone && platformTemplates.length > 0 && school) {
    cloneMutation.mutate();
  }

  // Toggle active
  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('survey_templates')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['school-survey-templates'] });
    },
  });

  function copyLink(token: string, id: string) {
    const url = `${window.location.origin}/survey/${token}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      showToast('Link copied!', 'success');
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2000);
    });
  }

  if (isLoading || cloneMutation.isPending) {
    return (
      <div className="text-center py-12 text-sm text-gray-400">
        Setting up your surveys…
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {schoolTemplates.map((tpl) => {
        const color = TARGET_GROUP_COLORS[tpl.target_group] ?? '#01696f';
        const count = responseCounts[tpl.id] ?? 0;
        return (
          <Card key={tpl.id}>
            <CardContent className="pt-5">
              <div className="flex items-start gap-4">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${color}18` }}
                >
                  <MessageSquare className="h-5 w-5" style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-gray-900">{tpl.name_en}</h3>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: `${color}15`,
                        color,
                        border: `1px solid ${color}40`,
                      }}
                    >
                      {TARGET_GROUP_LABELS[tpl.target_group]}
                    </span>
                    <span className="text-xs text-gray-400">{count} response{count !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {/* Toggle active */}
                    <button
                      onClick={() => toggleMutation.mutate({ id: tpl.id, is_active: !tpl.is_active })}
                      className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 transition-colors"
                    >
                      {tpl.is_active
                        ? <ToggleRight className="h-4 w-4 text-[#01696f]" />
                        : <ToggleLeft className="h-4 w-4 text-gray-400" />}
                      {tpl.is_active ? 'Active' : 'Inactive'}
                    </button>

                    {/* Copy link */}
                    {tpl.share_token && (
                      <button
                        onClick={() => copyLink(tpl.share_token!, tpl.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-xs font-medium text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        {copiedId === tpl.id
                          ? <Check className="h-3.5 w-3.5 text-green-600" />
                          : <Copy className="h-3.5 w-3.5" />}
                        {copiedId === tpl.id ? 'Link copied!' : 'Copy Survey Link'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {schoolTemplates.length === 0 && !cloneMutation.isPending && (
        <div className="text-center py-12 text-sm text-gray-400">
          No surveys found. Platform templates may not be seeded yet.
        </div>
      )}
    </div>
  );
}

// ─── Results Tab ──────────────────────────────────────────────

function ResultsTab() {
  const { data: schoolTemplates = [] } = useSchoolTemplates();
  const [selectedId, setSelectedId] = useState<string>('');

  const effectiveId = selectedId || schoolTemplates[0]?.id || '';

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

  return (
    <div className="space-y-6">
      {/* Template selector */}
      <div className="relative w-64">
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
        {question.question_type === 'scale5' && <Scale5Chart answers={answers as number[]} />}
        {question.question_type === 'yesno' && <YesNoChart answers={answers as string[]} />}
        {question.question_type === 'text' && <TextAnswers answers={answers as string[]} />}
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
          {data.map((_, i) => (
            <Cell key={i} fill={SCALE5_COLORS[i]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function YesNoChart({ answers }: { answers: string[] }) {
  const yes = answers.filter((a) => String(a).toLowerCase() === 'yes').length;
  const no  = answers.filter((a) => String(a).toLowerCase() === 'no').length;
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
  if (nonEmpty.length === 0) return <p className="text-xs text-gray-400">No text responses yet.</p>;
  return (
    <ul className="space-y-2">
      {nonEmpty.map((a, i) => (
        <li key={i} className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
          {String(a).slice(0, 100)}{String(a).length > 100 ? '…' : ''}
        </li>
      ))}
    </ul>
  );
}
