import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DOMAIN_NAMES: Record<string, string> = {
  '1': 'Academic Achievement',
  '2': 'Personal Development',
  '3': 'Teaching & Assessment',
  '4': 'School Climate',
  '5': 'Leadership & Governance',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1. Verify JWT
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing authorization token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Parse request body
    const { school_id, academic_year } = await req.json() as { school_id: string; academic_year: string };
    if (!school_id || !academic_year) {
      return new Response(JSON.stringify({ error: 'school_id and academic_year are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admin client for cross-school peer queries
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 3. Fetch this school's latest snapshot for the year
    const { data: snapshotRows, error: snapErr } = await adminClient
      .from('benchmark_snapshots')
      .select('*')
      .eq('school_id', school_id)
      .eq('academic_year', academic_year)
      .order('snapshot_date', { ascending: false })
      .limit(1);

    if (snapErr) throw new Error(`Snapshot fetch error: ${snapErr.message}`);

    const snapshot = snapshotRows?.[0];
    if (!snapshot) {
      return new Response(
        JSON.stringify({ error: 'No snapshot found. Take a snapshot first before generating insights.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Fetch anonymised peer averages (all other schools, same year)
    const { data: peerRows, error: peerErr } = await adminClient
      .from('benchmark_snapshots')
      .select('overall_score, obs_avg_rating, cpd_hours_total, appraisal_avg')
      .eq('academic_year', academic_year)
      .neq('school_id', school_id);

    if (peerErr) throw new Error(`Peer fetch error: ${peerErr.message}`);

    const peers = (peerRows ?? []) as Array<{
      overall_score: number | null;
      obs_avg_rating: number | null;
      cpd_hours_total: number | null;
      appraisal_avg: number | null;
    }>;

    const avg = (vals: (number | null)[]): string => {
      const nums = vals.filter((v): v is number => v != null);
      if (!nums.length) return 'N/A';
      return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2);
    };

    const peerAvg        = avg(peers.map(p => p.overall_score));
    const peerObs        = avg(peers.map(p => p.obs_avg_rating));
    const peerCpd        = avg(peers.map(p => p.cpd_hours_total));
    const peerAppraisal  = avg(peers.map(p => p.appraisal_avg));

    // 5. Build domain scores description
    const domainScores = snapshot.domain_scores as Record<string, number>;
    const domainDesc = Object.entries(domainScores)
      .map(([k, v]) => `${DOMAIN_NAMES[k] ?? `Domain ${k}`}: ${Number(v).toFixed(2)}/4`)
      .join(', ');

    // 6. Build prompt
    const prompt = `You are an educational quality advisor for Omani schools using the OAAAQA framework (1=Outstanding, 4=Needs Improvement — lower is better).

This school's data for ${academic_year}:
- Overall score: ${snapshot.overall_score ?? 'N/A'}/4
- Domain scores: ${domainDesc || 'No domain data'}
- Observation average rating: ${snapshot.obs_avg_rating ?? 'N/A'}/4
- CPD hours total: ${snapshot.cpd_hours_total ?? 'N/A'}
- Appraisal average rating: ${snapshot.appraisal_avg ?? 'N/A'}/4

Anonymised peer averages across ${peers.length} other school(s):
- Overall: ${peerAvg}, Observations: ${peerObs}, CPD hours: ${peerCpd}, Appraisals: ${peerAppraisal}

Note: scores are on a 1–4 scale where 1 = Outstanding and 4 = Needs Improvement. Lower scores indicate better performance.

Return ONLY valid JSON with these exact keys:
{
  "strengths": ["string", "string", "string"],
  "improvement_areas": ["string", "string", "string"],
  "peer_comparison": "string — one paragraph comparing this school to peers",
  "recommended_actions": ["string", "string", "string", "string"]
}

Make recommended_actions specific and actionable for an Omani school context. Do not include any explanation outside the JSON object.`;

    // 7. Call Gemini
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${Deno.env.get('GEMINI_API_KEY')}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    );
    const geminiData = await geminiResponse.json();
    const rawContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawContent) throw new Error('No response from Gemini');
    const parsed = JSON.parse(rawContent) as {
      strengths: string[];
      improvement_areas: string[];
      peer_comparison: string;
      recommended_actions: string[];
    };

    // 8. Upsert insights — delete existing first, then insert all 4 rows
    await adminClient
      .from('ai_insights')
      .delete()
      .eq('school_id', school_id)
      .eq('academic_year', academic_year);

    const insightRows = [
      { insight_type: 'strengths',           content: JSON.stringify(parsed.strengths) },
      { insight_type: 'improvement_areas',   content: JSON.stringify(parsed.improvement_areas) },
      { insight_type: 'peer_comparison',     content: parsed.peer_comparison },
      { insight_type: 'recommended_actions', content: JSON.stringify(parsed.recommended_actions) },
    ].map(row => ({
      ...row,
      school_id,
      academic_year,
      model_version: 'gemini-2.0-flash',
    }));

    const { error: insertErr } = await adminClient.from('ai_insights').insert(insightRows);
    if (insertErr) throw new Error(`Insert insights error: ${insertErr.message}`);

    return new Response(
      JSON.stringify({ success: true, insights: parsed }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
