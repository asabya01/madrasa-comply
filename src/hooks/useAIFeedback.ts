import { useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useAIFeedback() {
  return useMutation({
    mutationFn: async (params: Record<string, unknown>) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      const url = `${supabaseUrl}/functions/v1/ai-feedback`;
      console.log('[AI Feedback] Calling edge function:', url, params);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': anonKey,
        },
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('[AI Feedback] Error response:', res.status, text);
        throw new Error(`AI feedback failed: ${res.status} ${text}`);
      }

      const data = await res.json();
      console.log('[AI Feedback] Response:', data);
      return data;
    },
  });
}
