import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    // Verify the caller's JWT via the anon client (which calls auth.getUser()
    // against Supabase Auth — proper server-side JWT validation, not manual decode).
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Missing authorization token' }, 401);

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) return json({ error: 'Invalid or expired token' }, 401);
    const userId = user.id;

    // Service role client — used ONLY for privileged DB operations below
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json() as Record<string, unknown>;
    const { action } = body as { action: string };

    // ─────────────────────────────────────────────────────────────────────────
    // invite_school_user — school admins only (no super_admin required)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'invite_school_user') {
      const { email, full_name, role, subject_area, school_id } = body as Record<string, string>;
      if (!email || !role || !school_id) {
        return json({ error: 'email, role and school_id are required' }, 400);
      }

      const { data: membership } = await supabaseAdmin
        .from('school_members')
        .select('role')
        .eq('user_id', userId)
        .eq('school_id', school_id)
        .maybeSingle();

      const adminRoles = ['school_admin', 'principal', 'vice_principal'];
      if (!membership || !adminRoles.includes(membership.role)) {
        return json({ error: 'Forbidden — school admin access required' }, 403);
      }

      const roleMap: Record<string, string> = {
        school_admin: 'school_admin',
        hod:          'head_of_department',
        teacher:      'teacher',
        viewer:       'auditor',
      };
      const dbRole = roleMap[role] ?? role;

      const { data: inviteData, error: inviteErr } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          data: { full_name, school_id, role: dbRole },
        });
      if (inviteErr) return json({ error: inviteErr.message }, 400);

      const newUserId = inviteData.user.id;

      await supabaseAdmin.from('profiles').upsert({
        id:         newUserId,
        email,
        full_name:  full_name ?? null,
        role:       dbRole,
        department: subject_area ?? null,
      }, { onConflict: 'id' });

      await supabaseAdmin.from('school_members').upsert({
        school_id,
        user_id:    newUserId,
        role:       dbRole,
        status:     'pending',
        invited_by: userId,
      }, { onConflict: 'school_id,user_id' });

      return json({ success: true, user_id: newUserId });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // All remaining actions require super_admin
    // ─────────────────────────────────────────────────────────────────────────
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('is_super_admin')
      .eq('id', userId)
      .single();

    if (!callerProfile?.is_super_admin) {
      return json({ error: 'Forbidden — super admin access required' }, 403);
    }

    // ── create_school ─────────────────────────────────────────────────────────
    if (action === 'create_school') {
      const { name_en, name_ar, oaaaqa_code, school_type, governorate, education_cycle } =
        body as Record<string, string>;
      if (!name_en) return json({ error: 'name_en is required' }, 400);

      const { data, error } = await supabaseAdmin
        .from('schools')
        .insert({
          name_en,
          name_ar:         name_ar         || null,
          oaaaqa_code:     oaaaqa_code     || null,
          school_type:     school_type     || 'government',
          governorate:     governorate     || null,
          education_cycle: education_cycle || null,
          subscription_tier: 'trial',
          is_active: true,
        })
        .select()
        .single();
      if (error) return json({ error: error.message }, 400);

      console.log(`[admin-actions] Created school: ${name_en}`);
      return json({ success: true, school: data });
    }

    // ── update_school ─────────────────────────────────────────────────────────
    if (action === 'update_school') {
      const { school_id } = body as { school_id: string };
      if (!school_id) return json({ error: 'school_id is required' }, 400);

      const allowed = ['name_en', 'name_ar', 'oaaaqa_code', 'school_type', 'governorate', 'education_cycle'];
      const fields: Record<string, unknown> = {};
      for (const key of allowed) {
        if (key in body) fields[key] = (body as Record<string, unknown>)[key];
      }
      if (!Object.keys(fields).length) return json({ error: 'No fields to update' }, 400);

      const { error } = await supabaseAdmin.from('schools').update(fields).eq('id', school_id);
      if (error) return json({ error: error.message }, 400);

      return json({ success: true });
    }

    // ── create_user ───────────────────────────────────────────────────────────
    if (action === 'create_user') {
      const { email, full_name, role, school_id } = body as Record<string, string>;
      if (!email || !role) return json({ error: 'email and role are required' }, 400);

      const { data: authData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (createErr) return json({ error: createErr.message }, 400);

      const { error: profileErr } = await supabaseAdmin.from('profiles').insert({
        id:        authData.user.id,
        email,
        full_name,
        role,
        school_id: school_id || null,
      });
      if (profileErr) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        return json({ error: profileErr.message }, 400);
      }

      console.log(`[admin-actions] Created user ${email} with role ${role}`);
      return json({ success: true, user_id: authData.user.id });
    }

    // ── update_user ───────────────────────────────────────────────────────────
    if (action === 'update_user') {
      const { user_id, role, school_id, is_super_admin } = body as Record<string, unknown>;
      if (!user_id) return json({ error: 'user_id is required' }, 400);

      const profileFields: Record<string, unknown> = {};
      if (role           !== undefined) profileFields.role           = role;
      if (is_super_admin !== undefined) profileFields.is_super_admin = Boolean(is_super_admin);
      if (Object.keys(profileFields).length) {
        const { error } = await supabaseAdmin.from('profiles')
          .update(profileFields)
          .eq('id', user_id);
        if (error) return json({ error: error.message }, 400);
      }

      if (school_id && role) {
        const { error } = await supabaseAdmin.from('school_members')
          .update({ role })
          .eq('user_id', user_id as string)
          .eq('school_id', school_id as string);
        if (error) return json({ error: error.message }, 400);
      }

      console.log(`[admin-actions] Updated user ${user_id as string}`);
      return json({ success: true });
    }

    // ── delete_user ───────────────────────────────────────────────────────────
    if (action === 'delete_user') {
      const { user_id } = body as { user_id: string };
      if (!user_id) return json({ error: 'user_id is required' }, 400);

      await supabaseAdmin.from('profiles').delete().eq('id', user_id);
      const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (deleteErr) return json({ error: deleteErr.message }, 400);

      console.log(`[admin-actions] Deleted user ${user_id}`);
      return json({ success: true });
    }

    // ── reset_password ────────────────────────────────────────────────────────
    if (action === 'reset_password') {
      const { email } = body as { email: string };
      if (!email) return json({ error: 'email is required' }, 400);

      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type:  'recovery',
        email,
      });
      if (error) return json({ error: error.message }, 400);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const link = (data as any)?.properties?.action_link ?? null;
      console.log(`[admin-actions] Generated recovery link for ${email}`);
      return json({ success: true, link });
    }

    // ── deactivate_user ───────────────────────────────────────────────────────
    if (action === 'deactivate_user') {
      const { user_id, school_id } = body as { user_id: string; school_id?: string };
      if (!user_id) return json({ error: 'user_id is required' }, 400);

      const q = school_id
        ? supabaseAdmin.from('school_members').update({ status: 'suspended' })
            .eq('user_id', user_id).eq('school_id', school_id)
        : supabaseAdmin.from('school_members').update({ status: 'suspended' })
            .eq('user_id', user_id);
      const { error } = await q;
      if (error) return json({ error: error.message }, 400);

      console.log(`[admin-actions] Deactivated user ${user_id}`);
      return json({ success: true });
    }

    // ── get_stats ─────────────────────────────────────────────────────────────
    if (action === 'get_stats') {
      const [schools, users, evidence, actions, recentEvidence, recentActions] = await Promise.all([
        supabaseAdmin.from('schools').select('*', { count: 'exact', head: true }),
        supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
        supabaseAdmin.from('evidence_files').select('*', { count: 'exact', head: true }),
        supabaseAdmin.from('action_items').select('*', { count: 'exact', head: true }),
        supabaseAdmin.from('evidence_files')
          .select('file_name, uploaded_at, schools(name_en)')
          .order('uploaded_at', { ascending: false })
          .limit(5),
        supabaseAdmin.from('action_items')
          .select('title, created_at, status, schools(name_en)')
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      return json({
        schools:       schools.count  ?? 0,
        users:         users.count    ?? 0,
        evidence:      evidence.count ?? 0,
        actions:       actions.count  ?? 0,
        recentEvidence: recentEvidence.data ?? [],
        recentActions:  recentActions.data  ?? [],
      });
    }

    // ── get_analytics ─────────────────────────────────────────────────────────
    if (action === 'get_analytics') {
      const [schoolsRes, usersRes, activeYearsRes, judgementsRes, domainJudgementsRes] =
        await Promise.all([
          supabaseAdmin.from('schools').select('id, name_en', { count: 'exact' }).eq('is_active', true),
          supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
          supabaseAdmin.from('academic_years').select('*', { count: 'exact', head: true }).eq('is_current', true),
          supabaseAdmin.from('overall_judgements')
            .select('school_id, judgement, calculated_at')
            .order('calculated_at', { ascending: false }),
          supabaseAdmin.from('domain_judgements')
            .select('school_id, domain_id, judgement'),
        ]);

      const latestJudgement = new Map<string, number>();
      const latestCalcAt    = new Map<string, string>();
      for (const j of (judgementsRes.data ?? []) as Array<{ school_id: string; judgement: number; calculated_at: string }>) {
        if (!latestJudgement.has(j.school_id)) {
          latestJudgement.set(j.school_id, j.judgement);
          latestCalcAt.set(j.school_id, j.calculated_at);
        }
      }

      const ratedDomains = new Map<string, Set<string>>();
      for (const dj of (domainJudgementsRes.data ?? []) as Array<{ school_id: string; domain_id: string; judgement: number | null }>) {
        if (dj.judgement != null) {
          if (!ratedDomains.has(dj.school_id)) ratedDomains.set(dj.school_id, new Set());
          ratedDomains.get(dj.school_id)!.add(dj.domain_id);
        }
      }

      const schoolsNeedingAttention = [...latestJudgement.entries()].filter(([, j]) => j >= 4).length;

      const breakdown = ((schoolsRes.data ?? []) as Array<{ id: string; name_en: string }>).map(s => ({
        school_id:            s.id,
        name_en:              s.name_en,
        overall_judgement:    latestJudgement.get(s.id) ?? null,
        domain_completion_pct: Math.round(((ratedDomains.get(s.id)?.size ?? 0) / 5) * 100),
        last_activity:        latestCalcAt.get(s.id) ?? null,
      }));

      return json({
        total_schools:              schoolsRes.count          ?? 0,
        total_users:                usersRes.count             ?? 0,
        active_academic_years:      activeYearsRes.count       ?? 0,
        schools_needing_attention:  schoolsNeedingAttention,
        school_breakdown:           breakdown,
      });
    }

    // ── get_indicators ────────────────────────────────────────────────────────
    if (action === 'get_indicators') {
      const { data, error } = await supabaseAdmin
        .from('indicators')
        .select('id, standard_id, domain_id, description_en, description_ar')
        .order('domain_id')
        .order('id');
      if (error) return json({ error: error.message }, 400);
      return json({ indicators: data ?? [] });
    }

    // ── reseed_indicators ─────────────────────────────────────────────────────
    if (action === 'reseed_indicators') {
      const { count, error } = await supabaseAdmin
        .from('indicators')
        .select('*', { count: 'exact', head: true });
      if (error) return json({ error: error.message }, 400);
      return json({
        success: true,
        count:   count ?? 0,
        message: `Indicator seeding is managed via database migrations. Current count: ${count ?? 0} indicators. Re-run migration 001 seed inserts to reseed.`,
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);

  } catch (err) {
    console.error('[admin-actions] Error:', err);
    return json({ error: String(err) }, 500);
  }
});
