import { useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ─── Types ───────────────────────────────────────────────────

export interface IndicatorFeedbackPayload {
  scope: 'indicator';
  indicatorId: string;
  indicatorDescription: string;
  rating: number;
  ratingLabel: string;
  strengths?: string;
  improvementAreas?: string;
  evidenceCount: number;
  outstandingDescriptor?: string;
  satisfactoryDescriptor?: string;
  keyEvidence?: string[];
  domainName: string;
  standardName: string;
}

export interface OverallFeedbackPayload {
  scope: 'overall';
  schoolName: string;
  academicYear: string;
  overallJudgement: string;
  domainScores: Record<string, number>;
  indicators_rated: number;
  indicators_total: number;
}

export type FeedbackPayload = IndicatorFeedbackPayload | OverallFeedbackPayload;

export interface IndicatorFeedbackResult {
  assessment: string;
  gap_analysis: string;
  recommendations: Array<{
    action: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    timeframe: 'immediate' | '1-month' | '1-term' | '1-year';
  }>;
  evidence_needed: string[];
  reviewer_focus: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface OverallFeedbackResult {
  executive_summary: string;
  highest_risk_areas: string[];
  strengths_to_build_on: string[];
  priority_90_day_actions: Array<{
    action: string;
    domain: string;
    impact: string;
  }>;
  audit_readiness_score: number;
  key_message: string;
}

export type FeedbackResult = IndicatorFeedbackResult | OverallFeedbackResult;

// ─── Hook ────────────────────────────────────────────────────

/**
 * useAIFeedback
 *
 * Calls the `ai-feedback` Supabase Edge Function via
 * `supabase.functions.invoke()`. This method automatically
 * attaches the current user's JWT in the Authorization header,
 * fixing the 401 Unauthorized error that occurs when using
 * raw fetch() without manual token injection.
 */
export function useAIFeedback() {
  return useMutation<FeedbackResult, Error, FeedbackPayload>({
    mutationFn: async (payload: FeedbackPayload) => {
      const { data, error } = await supabase.functions.invoke<FeedbackResult>(
        'ai-feedback',
        { body: payload }
      );

      if (error) {
        // Surface the edge function error message if available
        throw new Error(
          (error as any).message ||
          (error as any).context?.message ||
          'AI feedback request failed'
        );
      }

      if (!data) {
        throw new Error('No response received from AI feedback function');
      }

      return data;
    },
  });
}

// ─── Typed helper to narrow result ───────────────────────────

export function isIndicatorFeedback(
  result: FeedbackResult
): result is IndicatorFeedbackResult {
  return 'assessment' in result;
}

export function isOverallFeedback(
  result: FeedbackResult
): result is OverallFeedbackResult {
  return 'executive_summary' in result;
}
