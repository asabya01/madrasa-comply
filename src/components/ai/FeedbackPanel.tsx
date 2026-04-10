import { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { useAIFeedback, isIndicatorFeedback, type FeedbackResult } from '../../hooks/useAIFeedback';
import { JUDGEMENT_LABELS, type JudgementLevel } from '../../lib/judgement';
import type { Indicator } from '../../types';

interface FeedbackPanelProps {
  indicator: Indicator;
  rating: number;
  strengths?: string;
  improvementAreas?: string;
  evidenceCount: number;
  domainName: string;
  standardName: string;
}

export function FeedbackPanel({
  indicator, rating, strengths, improvementAreas, evidenceCount, domainName, standardName,
}: FeedbackPanelProps) {
  const [feedback, setFeedback] = useState<FeedbackResult | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync, isPending } = useAIFeedback();

  const handleGetFeedback = async () => {
    setError(null);
    try {
    const result = await mutateAsync({
      scope: 'indicator',
      indicatorId: indicator.id,
      indicatorDescription: indicator.description_en,
      rating,
      ratingLabel: JUDGEMENT_LABELS[rating as JudgementLevel],
      strengths,
      improvementAreas,
      evidenceCount,
      outstandingDescriptor: indicator.outstanding_descriptor,
      satisfactoryDescriptor: indicator.satisfactory_descriptor,
      keyEvidence: indicator.key_evidence,
      domainName,
      standardName,
    });
    setFeedback(result);
    setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get AI feedback');
    }
  };

  const priorityColor: Record<string, string> = {
    critical: 'text-[#a12c7b]',
    high: 'text-[#da7101]',
    medium: 'text-[#d19900]',
    low: 'text-[#437a22]',
  };

  return (
    <div className="mt-3 border-t border-[#e2e0db] pt-3">
      {error && (
        <p className="text-xs text-red-600 mb-2 flex items-center gap-1">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </p>
      )}
      {!feedback ? (
        <Button
          variant="outline"
          size="sm"
          onClick={handleGetFeedback}
          disabled={isPending || !rating}
          className="gap-2"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {isPending ? 'Analysing with AI...' : 'Get AI Feedback'}
        </Button>
      ) : (
        <div>
          <button
            className="flex items-center gap-2 text-sm text-[#01696f] font-medium"
            onClick={() => setExpanded(!expanded)}
          >
            <Sparkles className="h-4 w-4" />
            AI Feedback
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {expanded && isIndicatorFeedback(feedback) && (
            <div className="mt-2 space-y-3 p-3 bg-[#f0f7eb] rounded-lg border border-[#437a22]/20">
              {!!feedback.assessment && (
                <div>
                  <p className="text-xs font-semibold text-[#437a22] uppercase mb-1">Assessment</p>
                  <p className="text-xs text-[#1a1a1a]">{feedback.assessment}</p>
                </div>
              )}
              {!!feedback.gap_analysis && (
                <div>
                  <p className="text-xs font-semibold text-[#006494] uppercase mb-1">Gap Analysis</p>
                  <p className="text-xs text-[#1a1a1a]">{feedback.gap_analysis}</p>
                </div>
              )}
              {feedback.recommendations.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#da7101] uppercase mb-1">Recommendations</p>
                  <div className="space-y-1">
                    {feedback.recommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <AlertCircle className={`h-3 w-3 mt-0.5 shrink-0 ${priorityColor[rec.priority] || 'text-gray-500'}`} />
                        <p className="text-xs text-[#1a1a1a]">{rec.action}
                          <span className="text-[#6b7280] ml-1">({rec.timeframe})</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!!feedback.reviewer_focus && (
                <div>
                  <p className="text-xs font-semibold text-[#a12c7b] uppercase mb-1">Reviewer Focus</p>
                  <p className="text-xs text-[#1a1a1a]">{feedback.reviewer_focus}</p>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleGetFeedback}
                disabled={isPending}
                className="gap-1.5 text-xs"
              >
                <Sparkles className="h-3 w-3" />
                Regenerate
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
