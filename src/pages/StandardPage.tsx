import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { ChevronRight, Upload, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/card';
import { Textarea } from '../components/ui/textarea';
import { Progress } from '../components/ui/progress';
import { FeedbackPanel } from '../components/ai/FeedbackPanel';
import { useIndicatorRatings, useSaveRating } from '../hooks/useIndicatorRatings';
import { useEvidence, useUploadEvidence } from '../hooks/useEvidence';
import { JUDGEMENT_COLORS, type JudgementLevel } from '../lib/judgement';
import type { Indicator, Standard, Domain } from '../types';

const RATING_OPTIONS = [
  { value: 1, label: 'Outstanding' },
  { value: 2, label: 'Good' },
  { value: 3, label: 'Satisfactory' },
  { value: 4, label: 'Unsatisfactory' },
  { value: 5, label: 'Needs Urgent Intervention' },
];

function IndicatorRatingCard({
  indicator, domainName, standardName,
}: { indicator: Indicator; domainName: string; standardName: string }) {
  const { data: ratings } = useIndicatorRatings(indicator.standard_id);
  const saveRating = useSaveRating();
  const { data: evidenceFiles } = useEvidence(indicator.id);
  const uploadEvidence = useUploadEvidence();

  const existing = ratings?.find((r) => r.indicator_id === indicator.id);
  const [rating, setRating] = useState<number>(existing?.rating || 0);
  const [strengths, setStrengths] = useState(existing?.strengths || '');
  const [improvements, setImprovements] = useState(existing?.improvement_areas || '');
  const [saving, setSaving] = useState(false);

  const handleRatingChange = useCallback(async (newRating: number) => {
    setRating(newRating);
    setSaving(true);
    try {
      await saveRating.mutateAsync({
        indicator_id: indicator.id,
        rating: newRating,
        strengths,
        improvement_areas: improvements,
      });
    } finally {
      setSaving(false);
    }
  }, [indicator.id, strengths, improvements, saveRating]);

  const handleBlur = useCallback(async () => {
    if (!rating) return;
    setSaving(true);
    try {
      await saveRating.mutateAsync({
        indicator_id: indicator.id,
        rating,
        strengths,
        improvement_areas: improvements,
      });
    } finally {
      setSaving(false);
    }
  }, [indicator.id, rating, strengths, improvements, saveRating]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadEvidence.mutateAsync({
      file,
      indicatorId: indicator.id,
      standardId: indicator.standard_id,
      domainId: indicator.domain_id,
    });
  };

  return (
    <Card className="mb-4">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-2 flex-1">
            <span className="text-xs font-mono bg-gray-100 text-[#6b7280] px-1.5 py-0.5 rounded shrink-0 mt-0.5">
              {indicator.id}
            </span>
            <p className="text-sm text-[#1a1a1a] leading-relaxed">{indicator.description_en}</p>
          </div>
          {saving && <span className="text-xs text-[#6b7280] ml-3 shrink-0">Saving...</span>}
        </div>

        {/* Rating buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          {RATING_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleRatingChange(opt.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
              style={{
                borderColor: rating === opt.value ? JUDGEMENT_COLORS[opt.value as JudgementLevel] : '#e2e0db',
                backgroundColor: rating === opt.value ? `${JUDGEMENT_COLORS[opt.value as JudgementLevel]}15` : 'white',
                color: rating === opt.value ? JUDGEMENT_COLORS[opt.value as JudgementLevel] : '#6b7280',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Strengths & Improvements */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs font-medium text-[#6b7280] block mb-1">Strengths</label>
            <Textarea
              value={strengths}
              onChange={(e) => setStrengths(e.target.value)}
              onBlur={handleBlur}
              placeholder="What does the school do well in this area?"
              className="text-xs min-h-[72px]"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#6b7280] block mb-1">Areas for Improvement</label>
            <Textarea
              value={improvements}
              onChange={(e) => setImprovements(e.target.value)}
              onBlur={handleBlur}
              placeholder="What needs to improve?"
              className="text-xs min-h-[72px]"
            />
          </div>
        </div>

        {/* Key evidence hints */}
        {indicator.key_evidence?.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-medium text-[#6b7280] mb-1">Recommended evidence:</p>
            <div className="flex flex-wrap gap-1">
              {indicator.key_evidence.map((ev) => (
                <span key={ev} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{ev}</span>
              ))}
            </div>
          </div>
        )}

        {/* Evidence */}
        <div className="flex items-center justify-between border-t border-[#e2e0db] pt-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#6b7280]" />
            <span className="text-xs text-[#6b7280]">{evidenceFiles?.length || 0} evidence files</span>
          </div>
          <label className="cursor-pointer">
            <input type="file" className="hidden" onChange={handleFileUpload} />
            <span className="flex items-center gap-1.5 text-xs text-[#01696f] hover:underline font-medium">
              <Upload className="h-3.5 w-3.5" />
              Upload evidence
            </span>
          </label>
        </div>

        {/* AI Feedback */}
        {rating > 0 && (
          <FeedbackPanel
            indicator={indicator}
            rating={rating}
            strengths={strengths}
            improvementAreas={improvements}
            evidenceCount={evidenceFiles?.length || 0}
            domainName={domainName}
            standardName={standardName}
          />
        )}
      </CardContent>
    </Card>
  );
}

export function StandardPage() {
  const { domainId, standardId } = useParams<{ domainId: string; standardId: string }>();

  const { data: domain } = useQuery({
    queryKey: ['domain', domainId],
    queryFn: async () => {
      const { data } = await supabase.from('domains').select('*').eq('id', domainId).single();
      return data as Domain;
    },
  });

  const { data: standard } = useQuery({
    queryKey: ['standard', standardId],
    queryFn: async () => {
      const { data } = await supabase.from('standards').select('*').eq('id', standardId).single();
      return data as Standard;
    },
  });

  const { data: indicators } = useQuery({
    queryKey: ['indicators-standard', standardId],
    queryFn: async () => {
      const { data } = await supabase.from('indicators').select('*').eq('standard_id', standardId).order('order_num');
      return (data || []) as Indicator[];
    },
  });

  const { data: ratings } = useIndicatorRatings(standardId);

  const ratedCount = (indicators || []).filter((i) => ratings?.some((r) => r.indicator_id === i.id)).length;

  if (!standard || !domain) {
    return <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-40 bg-white rounded-lg border animate-pulse" />)}</div>;
  }

  return (
    <div className="max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[#6b7280] mb-4">
        <Link to="/domains" className="hover:text-[#01696f]">Domains</Link>
        <ChevronRight className="h-4 w-4" />
        <Link to={`/domains/${domainId}`} className="hover:text-[#01696f]">{domain.name_en}</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-[#1a1a1a]">{standard.name_en}</span>
      </div>

      {/* Standard header */}
      <div className="mb-5 p-4 bg-white rounded-lg border border-[#e2e0db]">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-mono text-[#6b7280]">Standard {standardId}</span>
            <h2 className="text-lg font-semibold text-[#1a1a1a] mt-0.5 font-sans">{standard.name_en}</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6b7280]">{ratedCount}/{indicators?.length || 0} rated</span>
            <Progress value={indicators?.length ? (ratedCount / indicators.length) * 100 : 0} className="w-20 h-1.5" />
          </div>
        </div>
      </div>

      {/* Indicators */}
      {(indicators || []).map((indicator) => (
        <IndicatorRatingCard
          key={indicator.id}
          indicator={indicator}
          domainName={domain.name_en}
          standardName={standard.name_en}
        />
      ))}
    </div>
  );
}
