import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SurveyTemplate {
  id: string;
  name_en: string;
  name_ar: string | null;
  target_group: string;
  is_active: boolean;
  school_id: string | null;
  schools?: { name_en: string } | null;
}

interface SurveyQuestion {
  id: string;
  question_en: string;
  question_ar: string | null;
  question_type: 'scale5' | 'yesno' | 'text';
  sort_order: number;
}

export default function PublicSurveyPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch template
  const { data: template, isLoading: tLoading, error: tError } = useQuery({
    queryKey: ['public-survey-template', shareToken],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('survey_templates')
        .select('id, name_en, name_ar, target_group, is_active, school_id, schools(name_en)')
        .eq('share_token', shareToken!)
        .single();
      if (error) throw error;
      return data as SurveyTemplate;
    },
    enabled: !!shareToken,
    retry: false,
  });

  // Fetch questions
  const { data: questions = [], isLoading: qLoading } = useQuery({
    queryKey: ['public-survey-questions', template?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('survey_questions')
        .select('id, question_en, question_ar, question_type, sort_order')
        .eq('template_id', template!.id)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as SurveyQuestion[];
    },
    enabled: !!template?.id && template.is_active,
  });

  function setAnswer(qId: string, value: string | number) {
    setAnswers((prev) => ({ ...prev, [qId]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!shareToken) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { data, error } = await supabase.functions.invoke('submit-survey', {
        body: { shareToken, responsesJson: answers },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error as string);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const schoolName = (template?.schools as { name_en: string } | null)?.name_en ?? 'Your School';

  // ── States ────────────────────────────────────────────────
  if (tLoading || qLoading) {
    return (
      <PublicShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 text-[#01696f] animate-spin" />
        </div>
      </PublicShell>
    );
  }

  if (tError || !template) {
    return (
      <PublicShell>
        <div className="text-center py-20">
          <p className="text-lg font-semibold text-gray-700">Survey not found</p>
          <p className="text-sm text-gray-400 mt-2">This survey link may be invalid or expired.</p>
        </div>
      </PublicShell>
    );
  }

  if (!template.is_active) {
    return (
      <PublicShell>
        <div className="text-center py-20">
          <p className="text-lg font-semibold text-gray-700">Survey closed</p>
          <p className="text-sm text-gray-400 mt-2">This survey is no longer accepting responses.</p>
        </div>
      </PublicShell>
    );
  }

  if (submitted) {
    return (
      <PublicShell>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-[#01696f]/10 flex items-center justify-center mb-5">
            <CheckCircle2 className="h-9 w-9 text-[#01696f]" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Thank you for your response</h2>
          <p className="text-sm text-gray-500 mt-2">{schoolName}</p>
          <p className="text-xs text-gray-400 mt-4">Your feedback helps improve the quality of education.</p>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs font-medium text-[#01696f] uppercase tracking-wider mb-1">{schoolName}</p>
        <h1 className="text-2xl font-semibold text-gray-900">{template.name_en}</h1>
        {template.name_ar && (
          <p className="text-base text-gray-500 mt-0.5 text-right" dir="rtl">{template.name_ar}</p>
        )}
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-8">
        {questions.map((q, idx) => (
          <div key={q.id}>
            <p className="text-sm font-medium text-gray-900 mb-1">
              <span className="text-gray-400 mr-2">{idx + 1}.</span>
              {q.question_en}
            </p>
            {q.question_ar && (
              <p className="text-sm text-gray-400 mb-3 text-right" dir="rtl">{q.question_ar}</p>
            )}
            {q.question_type === 'scale5' && (
              <Scale5Input
                value={answers[q.id] as number | undefined}
                onChange={(v) => setAnswer(q.id, v)}
              />
            )}
            {q.question_type === 'yesno' && (
              <YesNoInput
                value={answers[q.id] as string | undefined}
                onChange={(v) => setAnswer(q.id, v)}
              />
            )}
            {q.question_type === 'text' && (
              <textarea
                value={(answers[q.id] as string) ?? ''}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Your answer…"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#01696f] resize-none"
              />
            )}
          </div>
        ))}

        {submitError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {submitError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#01696f] text-white font-semibold text-sm rounded-xl hover:bg-[#0c4e54] disabled:opacity-60 transition-colors"
        >
          {submitting ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
          ) : (
            'Submit Response'
          )}
        </button>
      </form>
    </PublicShell>
  );
}

// ─── Shell (no auth, no sidebar) ────────────────────────────

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f6f2]">
      {/* Branded top bar */}
      <div className="bg-[#0c4e54] px-5 py-3 flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-white/20 flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">M</span>
        </div>
        <span className="text-white text-sm font-semibold">Madrasa Comply</span>
      </div>
      <div className="max-w-xl mx-auto px-5 py-10">{children}</div>
    </div>
  );
}

// ─── Scale-5 input ────────────────────────────────────────────

function Scale5Input({ value, onChange }: { value?: number; onChange: (v: number) => void }) {
  const opts = [
    { v: 1, label: 'Strongly Disagree' },
    { v: 2, label: 'Disagree' },
    { v: 3, label: 'Neutral' },
    { v: 4, label: 'Agree' },
    { v: 5, label: 'Strongly Agree' },
  ];
  return (
    <div className="flex gap-2 flex-wrap">
      {opts.map(({ v, label }) => (
        <label
          key={v}
          className={`flex flex-col items-center gap-1 cursor-pointer select-none p-2 rounded-xl border-2 transition-colors min-w-[72px] text-center ${
            value === v
              ? 'border-[#01696f] bg-[#01696f]/5'
              : 'border-gray-200 hover:border-gray-300 bg-white'
          }`}
        >
          <input
            type="radio"
            name={`scale-${label}`}
            value={v}
            checked={value === v}
            onChange={() => onChange(v)}
            className="sr-only"
          />
          <span className={`text-lg font-bold ${value === v ? 'text-[#01696f]' : 'text-gray-400'}`}>{v}</span>
          <span className="text-[10px] leading-tight text-gray-500">{label}</span>
        </label>
      ))}
    </div>
  );
}

// ─── Yes/No input ─────────────────────────────────────────────

function YesNoInput({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-3">
      {['Yes', 'No'].map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`px-6 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors ${
            value === opt
              ? opt === 'Yes'
                ? 'border-[#437a22] bg-[#437a22]/5 text-[#437a22]'
                : 'border-red-500 bg-red-50 text-red-600'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
