import { useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useAIFeedback() {
  return useMutation({
    mutationFn: async (params: Record<string, unknown>) => {
      console.log('[AI Feedback] Calling edge function with params:', params);

      const { data, error } = await supabase.functions.invoke('ai-feedback', {
        body: params,
      });

      if (error) {
        console.error('[AI Feedback] Error:', error);
        throw new Error(`AI feedback failed: ${error.message}`);
      }

      console.log('[AI Feedback] Response:', data);
      return data;
    },
  });
}
