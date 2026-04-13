import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify JWT is valid by using it with the anon client
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json() as {
      school_id: string;
      user_ids: string[];
      type: string;
      title: string;
      body?: string;
      link?: string;
    };

    const { school_id, user_ids, type, title } = body;
    if (!school_id || !user_ids?.length || !type || !title) {
      return json({ error: 'Missing required fields: school_id, user_ids, type, title' }, 400);
    }

    const rows = user_ids.map((uid) => ({
      school_id,
      user_id: uid,
      type,
      title,
      body: body.body ?? null,
      link: body.link ?? null,
    }));

    const { error } = await supabaseAdmin.from('notifications').insert(rows);
    if (error) throw error;

    return json({ inserted: rows.length });
  } catch (e) {
    console.error('notify error:', e);
    return json({ error: String(e) }, 500);
  }
});
