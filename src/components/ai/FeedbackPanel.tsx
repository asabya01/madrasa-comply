import { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, X, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import {
  useAIFeedback, useAcceptFeedback, isIndicatorFeedback,
  type FeedbackResult,
} from '../../hooks/useAIFeedback';
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
  /** Called when user accepts a recommendation — append text to the improvements field */
  onAppendToNarrative?: (text: string) => void;
}

const priorityColor: Record<string, string> = {
  critical: 'text-[#a12c7b]',
  high: 'text-[#da7101]',
  medium: 'text-[#d19900]',
  low: 'text-[#437a22]',
};

const priorityBg: Record<string, string> = {
  critical: 'bg-[#a12c7b]/8 border-[#a12c7b]/20',
  high: 'bg-[#da7101]/8 border-[#da7101]/20',
  medium: 'bg-[#d19900]/8 border-[#d19900]/20',
  low: 'bg-[#437a22]/8 border-[#437a22]/20',
};

export function FeedbackPanel({
  indicator, rating, strengths, improvementAreas, evidenceCount, domainName, standardName,
  onAppendToNarrative,
}: FeedbackPanelProps) {
  const [feedback, setFeedback] = useState<FeedbackResult | null>(null);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [accepted, setAccepted] = useState<Set<number>>(new Set());

  const { mutateAsync, isPending } = useAIFeedback();
  const acceptFeedback = useAcceptFeedback();

  const handleGetFeedback = async () => {
    setError(null);
    setDismissed(new Set());
    setAccepted(new Set());
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
      setFeedbackId(result.feedbackId ?? null);
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get AI feedback');
    }
  };

  function handleDismiss(index: number) {
    setDismissed((prev) => new Set(prev).add(index));
  }

  function handleAccept(index: number, actionText: string) {
    setAccepted((prev) => new Set(prev).add(index));
    onAppendToNarrative?.(actionText);
    // Mark accepted in DB (best-effort)
    if (feedbackId) {
      acceptFeedback.mutate(feedbackId);
    }
  }

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

              {/* Recommendation cards — dismissible, with Accept button */}
              {feedback.recommendations.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#da7101] uppercase mb-2">Recommendations</p>
                  <div className="space-y-2">
                    {feedback.recommendations.map((rec, i) => {
                      if (dismissed.has(i)) return null;
                      const isAccepted = accepted.has(i);
                      return (
                        <div
                          key={i}
                          className={`relative rounded-lg border p-2.5 pr-8 ${priorityBg[rec.priority] || 'bg-gray-50 border-gray-200'} ${isAccepted ? 'opacity-60' : ''}`}
                        >
                          {/* Dismiss button */}
                          {!isAccepted && (
                            <button
                              onClick={() => handleDismiss(i)}
                              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
                              title="Dismiss"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}

                          <p className="text-xs text-[#1a1a1a] leading-relaxed">
                            <span className={`font-medium ${priorityColor[rec.priority] || 'text-gray-600'}`}>
                              [{rec.priority}]
                            </span>{' '}
                            {rec.action}
                            <span className="text-[#6b7280] ml-1">({rec.timeframe})</span>
                          </p>

                          {isAccepted ? (
                            <p className="flex items-center gap-1 text-xs text-[#437a22] mt-1.5 font-medium">
                              <CheckCircle2 className="h-3 w-3" /> Added to improvement areas
                            </p>
                          ) : (
                            <button
                              onClick={() => handleAccept(i, rec.action)}
                              className="flex items-center gap-1 mt-1.5 text-xs text-[#01696f] font-medium hover:underline"
                            >
                              <Plus className="h-3 w-3" /> Accept — add to areas for improvement
                            </button>
                          )}
                        </div>
                      );
                    })}
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
