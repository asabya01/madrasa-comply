import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1. Extract JWT from Authorization header
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing authorization token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Create Supabase client using the user's token (validates JWT via Supabase Auth)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    // 3. Confirm the token is valid — getUser() will fail if JWT is expired/invalid
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error('[ai-feedback] Auth error:', authError?.message);
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[ai-feedback] Authenticated user:', user.id);

    // 4. Build the prompt
    const body = await req.json();
    const { scope } = body;

    let prompt = '';

    if (scope === 'indicator') {
      const {
        indicatorId, indicatorDescription, rating, ratingLabel, strengths,
        improvementAreas, evidenceCount, outstandingDescriptor, satisfactoryDescriptor,
        keyEvidence, domainName, standardName,
      } = body;

      prompt = `You are an expert school quality assurance consultant for OAAAQA (Oman Authority for Academic Accreditation and Quality Assurance of Education).

A school in Oman is self-evaluating against the School Evaluation Framework (SEF). Help them improve their compliance.

**Indicator:** ${indicatorId} — ${indicatorDescription}
**Domain:** ${domainName} | **Standard:** ${standardName}
**School's self-rating:** ${rating}/5 (${ratingLabel})
**Stated strengths:** ${strengths || 'None provided'}
**Stated improvement areas:** ${improvementAreas || 'None provided'}
**Evidence files uploaded:** ${evidenceCount}

**What OUTSTANDING looks like for this indicator:**
${outstandingDescriptor || 'Not specified'}

**What SATISFACTORY looks like:**
${satisfactoryDescriptor || 'Not specified'}

**Recommended evidence types for this indicator:**
${keyEvidence?.join(', ') || 'Not specified'}

Provide your response as JSON with these exact keys:
{
  "assessment": "Brief honest assessment of whether self-rating seems accurate (2-3 sentences)",
  "gap_analysis": "What specifically separates this school from Outstanding (2-3 sentences)",
  "recommendations": [
    {"action": "Specific action", "priority": "critical|high|medium|low", "timeframe": "immediate|1-month|1-term|1-year"}
  ],
  "evidence_needed": ["specific evidence type 1", "specific evidence type 2", "specific evidence type 3"],
  "reviewer_focus": "What an OAAAQA reviewer will specifically look for during the visit for this indicator",
  "priority": "critical|high|medium|low"
}

Be specific to the Omani educational context. Use the framework's own language. Do not be vague.`;
    }

    if (scope === 'overall') {
      const { domainScores, overallJudgement, schoolName, academicYear, indicators_rated, indicators_total } = body;
      prompt = `You are an expert OAAAQA school quality consultant.

School: ${schoolName}
Academic Year: ${academicYear}
Overall Projected Judgement: ${overallJudgement}
Indicators Rated: ${indicators_rated}/${indicators_total}

Domain Scores (1=Outstanding, 5=NUI):
${JSON.stringify(domainScores, null, 2)}

Provide a JSON response:
{
  "executive_summary": "3-4 sentence overall picture of the school's compliance position",
  "highest_risk_areas": ["indicator or standard ID with brief reason"],
  "strengths_to_build_on": ["2-3 genuine strengths"],
  "priority_90_day_actions": [
    {"action": "specific action", "domain": "domain name", "impact": "why this matters for judgement"}
  ],
  "audit_readiness_score": 0,
  "key_message": "One sentence the principal should share with all staff"
}`;
    }

    if (!prompt) {
      return new Response(JSON.stringify({ error: `Unknown scope: ${scope}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Call Anthropic Claude
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const feedback = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'Parse failed', raw: content };

    return new Response(JSON.stringify(feedback), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[ai-feedback] Unhandled error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
