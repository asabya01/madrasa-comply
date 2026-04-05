import { useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useAIFeedback() {
  return useMutation({
    mutationFn: async (params: Record<string, unknown>) => {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/ai-feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error('AI feedback request failed');
      return res.json();
    },
  });
}
