import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT = 20; // requests per 24 h per user

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

    // Service-role client for rate-limit check + DB writes
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 2. Rate limit — max RATE_LIMIT requests per rolling 24 h (FR-AI-04)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countErr } = await serviceClient
      .from('ai_feedback')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', user.id)
      .gte('generated_at', since);

    if (countErr) console.error('[ai-feedback] rate-limit count error:', countErr.message);

    if ((count ?? 0) >= RATE_LIMIT) {
      return new Response(
        JSON.stringify({ error: `Daily AI feedback limit reached (${RATE_LIMIT}/day). Try again tomorrow.` }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Build the prompt
    const body = await req.json();
    const { scope, action } = body;
    let prompt = '';

    // ── Language check action (lightweight, returns plain suggestion) ──
    if (action === 'check_evaluative_language') {
      const { indicatorId, indicatorDescription, rating, narrative } = body;
      const ratingLabels: Record<number, string> = {
        1: 'Outstanding', 2: 'Good', 3: 'Satisfactory', 4: 'Unsatisfactory', 5: 'Needs Urgent Intervention',
      };
      const langPrompt = `You are an OAAAQA school quality evaluator reviewing a school's self-evaluation narrative.

Indicator: ${indicatorId} — ${indicatorDescription}
School's self-rating: ${rating}/5 (${ratingLabels[rating] ?? rating})
Current narrative: "${narrative}"

Your task:
1. Identify whether this narrative is DESCRIPTIVE ("we do X") or EVALUATIVE ("X is effective because Y impact"). Descriptive narratives only state what exists; evaluative narratives explain the impact and quality of evidence.
2. Rewrite the narrative in evaluative language using OAAAQA terms where appropriate: effective, distinguished, highly efficient, model to emulate, notable, acceptable, appropriate, limited, non-existent.
3. Keep the rewrite under 150 words.
4. Respond in the same language as the input narrative (Arabic if Arabic, English if English).
5. Return ONLY valid JSON: { "suggestion": "your rewritten narrative here" }`;

      const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
      const langResponse = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 400,
        messages: [{ role: 'user', content: langPrompt }],
      });
      const langContent = langResponse.content[0].type === 'text' ? langResponse.content[0].text : '{}';
      const langJson = langContent.match(/\{[\s\S]*\}/);
      const langResult = langJson ? JSON.parse(langJson[0]) : { suggestion: langContent.trim() };
      return new Response(JSON.stringify(langResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Call Anthropic
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const feedback = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'Parse failed', raw: content };

    // 5. Persist to ai_feedback (non-blocking — don't fail the request if this errors)
    const schoolId = body.schoolId ?? null;
    const academicYear = body.academicYear ?? null;
    const indicatorId = scope === 'indicator' ? (body.indicatorId ?? null) : null;

    const { data: inserted } = await serviceClient
      .from('ai_feedback')
      .insert({
        school_id: schoolId,
        feedback_scope: scope,
        scope_id: indicatorId,
        academic_year: academicYear,
        prompt_text: prompt,
        response_text: content,
        accepted: false,
        created_by: user.id,
      })
      .select('id')
      .single();

    return new Response(JSON.stringify({ ...feedback, feedbackId: inserted?.id ?? null }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[ai-feedback] Unhandled error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
