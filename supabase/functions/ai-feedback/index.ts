import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT = 20; // requests per 24 h per user

const DOMAIN_NAMES: Record<string, string> = {
  '1': 'Academic Achievement',
  '2': 'Personal Development',
  '3': 'Teaching & Assessment',
  '4': 'School Climate',
  '5': 'Leadership & Governance',
};

const RATING_LABELS: Record<number, string> = {
  1: 'Outstanding',
  2: 'Good',
  3: 'Satisfactory',
  4: 'Unsatisfactory',
  5: 'Needs Urgent Intervention',
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

    // Service-role client for rate-limit check + DB writes
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();
    const { scope, action } = body;

    // ── Language check action (lightweight, bypasses rate limit) ──
    if (action === 'check_evaluative_language') {
      const { indicatorId, indicatorDescription, rating, narrative } = body;
      const langPrompt = `You are an OAAAQA school quality evaluator reviewing a school's self-evaluation narrative.

Indicator: ${indicatorId} — ${indicatorDescription}
School's self-rating: ${rating}/5 (${RATING_LABELS[rating] ?? rating})
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

    // ── Domain narrative drafter ──────────────────────────────
    if (action === 'draft_domain_narrative') {
      const { school_id, academic_year, domain_id } = body;

      if (!school_id || !domain_id) {
        return new Response(JSON.stringify({ error: 'school_id and domain_id are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const domainName = DOMAIN_NAMES[String(domain_id)] ?? `Domain ${domain_id}`;

      // Fetch all indicators for this domain
      const { data: indicators, error: indErr } = await serviceClient
        .from('indicators')
        .select('id, description_en')
        .eq('domain_id', String(domain_id))
        .order('id');

      if (indErr || !indicators?.length) {
        return new Response(JSON.stringify({ error: 'No indicators found for this domain' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const indicatorIds = indicators.map((i: { id: string }) => i.id);

      // Fetch ratings for those indicators
      const ratingsQuery = serviceClient
        .from('indicator_ratings')
        .select('indicator_id, rating, strengths, improvement_areas, self_eval_notes')
        .eq('school_id', school_id)
        .in('indicator_id', indicatorIds);

      if (academic_year) ratingsQuery.eq('academic_year', academic_year);

      const { data: ratings, error: ratErr } = await ratingsQuery;
      if (ratErr) console.error('[ai-feedback] ratings fetch error:', ratErr.message);

      const ratingsMap: Record<string, { rating: number; strengths: string; improvement_areas: string; self_eval_notes: string }> = {};
      for (const r of ratings ?? []) {
        ratingsMap[r.indicator_id] = r;
      }

      const ratedCount = Object.keys(ratingsMap).length;

      // Build indicator lines for the prompt
      const indicatorLines = indicators.map((ind: { id: string; description_en: string }) => {
        const r = ratingsMap[ind.id];
        if (!r) return `${ind.id}: Not yet rated — ${ind.description_en}`;
        const ratingLabel = RATING_LABELS[r.rating] ?? String(r.rating);
        const parts = [`${ind.id}: ${ratingLabel}`];
        if (r.strengths)         parts.push(`Strengths: ${r.strengths}`);
        if (r.improvement_areas) parts.push(`Areas for development: ${r.improvement_areas}`);
        if (r.self_eval_notes)   parts.push(`Notes: ${r.self_eval_notes}`);
        return parts.join(' | ');
      }).join('\n');

      const narrativePrompt = `You are an OAAAQA school quality advisor helping a school write its Self-Evaluation Document (SED).

Write a formal evaluative narrative paragraph for Domain ${domain_id} — ${domainName}.

The paragraph will appear directly in the SED, so it must:
- Use OAAAQA evaluative language: outstanding, effective, strong, good, satisfactory, areas for development, requires improvement, significant weaknesses
- Be evaluative (explain impact and quality), not merely descriptive
- Reference specific indicators by code where relevant
- Reflect the distribution of ratings honestly
- Be 150–200 words

Indicator ratings and evidence (${ratedCount}/${indicators.length} rated):
${indicatorLines}

Write the narrative paragraph only — no headings, no bullet points, no JSON.`;

      const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
      const narrativeResponse = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 600,
        messages: [{ role: 'user', content: narrativePrompt }],
      });

      const narrative = narrativeResponse.content[0].type === 'text'
        ? narrativeResponse.content[0].text.trim()
        : '';

      // Persist to ai_feedback
      const { data: inserted } = await serviceClient
        .from('ai_feedback')
        .insert({
          school_id,
          feedback_scope: 'domain_narrative',
          scope_id: String(domain_id),
          academic_year: academic_year ?? null,
          prompt_text: narrativePrompt,
          response_text: narrative,
          accepted: false,
          created_by: user.id,
        })
        .select('id')
        .single();

      return new Response(JSON.stringify({ narrative, feedbackId: inserted?.id ?? null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Build the prompt for scope-based actions
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
      return new Response(JSON.stringify({ error: `Unknown scope/action: ${scope ?? action}` }), {
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
