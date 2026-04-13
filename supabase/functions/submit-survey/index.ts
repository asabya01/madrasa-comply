import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const {
      shareToken,
      responsesJson,
      respondent_name,
      respondent_type,
      respondent_email,
    } = await req.json();

    if (!shareToken || !responsesJson) {
      return new Response(JSON.stringify({ error: 'Missing shareToken or responsesJson' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Look up the template by share_token
    const { data: template, error: tErr } = await serviceClient
      .from('survey_templates')
      .select('id, school_id, academic_year, is_active')
      .eq('share_token', shareToken)
      .single();

    if (tErr || !template) {
      return new Response(JSON.stringify({ error: 'Survey not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!template.is_active) {
      return new Response(JSON.stringify({ error: 'This survey is no longer active' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const VALID_RESPONDENT_TYPES = ['parent', 'student', 'staff', 'other'];
    const safeRespondentType = VALID_RESPONDENT_TYPES.includes(respondent_type)
      ? respondent_type
      : 'other';

    await serviceClient.from('survey_responses').insert({
      template_id:      template.id,
      school_id:        template.school_id,
      academic_year:    template.academic_year ?? '',
      responses_json:   responsesJson,
      respondent_name:  respondent_name ?? null,
      respondent_type:  safeRespondentType,
      respondent_email: respondent_email ?? null,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[submit-survey] Error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
