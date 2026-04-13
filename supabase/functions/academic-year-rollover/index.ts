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

/** Oman school year starts September 1.
 *  Returns e.g. '2025-2026' for any date from Sept 1 2025 to Aug 31 2026.
 */
function currentOmanYearLabel(): string {
  const today = new Date();
  const month = today.getMonth() + 1; // 1-indexed
  const year  = today.getFullYear();
  const start = month >= 9 ? year : year - 1;
  return `${start}-${start + 1}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Allow both super admin callers (with JWT) and internal scheduled triggers
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const expectedLabel = currentOmanYearLabel();

    // 1. Get all active schools
    const { data: schools, error: schoolsErr } = await supabaseAdmin
      .from('schools')
      .select('id')
      .eq('is_active', true);

    if (schoolsErr) throw schoolsErr;

    // 2. Get the active framework version
    const { data: fwRow } = await supabaseAdmin
      .from('framework_versions')
      .select('id')
      .eq('is_active', true)
      .maybeSingle();

    const frameworkVersionId: string | null = fwRow?.id ?? null;

    const rolledOver: string[] = [];
    const alreadyCurrent: string[] = [];

    for (const school of (schools ?? [])) {
      const schoolId: string = school.id;

      // Check if current academic year label matches expected
      const { data: currentYear } = await supabaseAdmin
        .from('academic_years')
        .select('id, label')
        .eq('school_id', schoolId)
        .eq('is_current', true)
        .maybeSingle();

      if (currentYear?.label === expectedLabel) {
        alreadyCurrent.push(schoolId);
        continue;
      }

      // Need to roll over: create new year, set old one to not current
      if (currentYear) {
        await supabaseAdmin
          .from('academic_years')
          .update({ is_current: false })
          .eq('id', currentYear.id);
      }

      const { error: insertErr } = await supabaseAdmin
        .from('academic_years')
        .upsert(
          {
            school_id: schoolId,
            label: expectedLabel,
            is_current: true,
            ...(frameworkVersionId ? { framework_version_id: frameworkVersionId } : {}),
          },
          { onConflict: 'school_id,label' },
        );

      if (insertErr) {
        console.error(`Rollover failed for school ${schoolId}:`, insertErr);
        continue;
      }

      // Ensure is_current = true on the upserted row
      await supabaseAdmin
        .from('academic_years')
        .update({ is_current: true })
        .eq('school_id', schoolId)
        .eq('label', expectedLabel);

      rolledOver.push(schoolId);
    }

    return json({
      expected_label: expectedLabel,
      rolled_over: rolledOver,
      already_current: alreadyCurrent,
      rolled_over_count: rolledOver.length,
    });
  } catch (e) {
    console.error('academic-year-rollover error:', e);
    return json({ error: String(e) }, 500);
  }
});
