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
      const { user_id, full_name, email, role, school_id, is_super_admin } = body as Record<string, unknown>;
      if (!user_id) return json({ error: 'user_id is required' }, 400);

      const profileFields: Record<string, unknown> = {};
      if (full_name      !== undefined) profileFields.full_name      = full_name;
      if (role           !== undefined) profileFields.role           = role;
      if (is_super_admin !== undefined) profileFields.is_super_admin = Boolean(is_super_admin);
      if (email          !== undefined) profileFields.email          = email;

      if (Object.keys(profileFields).length) {
        const { error } = await supabaseAdmin.from('profiles')
          .update(profileFields)
          .eq('id', user_id);
        if (error) return json({ error: error.message }, 400);
      }

      // Update auth email if changed
      if (email) {
        const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(
          user_id as string, { email: email as string }
        );
        if (authErr) return json({ error: authErr.message }, 400);
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

    // ── toggle_user_active ────────────────────────────────────────────────────
    if (action === 'toggle_user_active') {
      const { user_id, set_active } = body as { user_id: string; set_active: boolean };
      if (!user_id) return json({ error: 'user_id is required' }, 400);

      const newStatus = set_active ? 'active' : 'suspended';
      const { error: profileErr } = await supabaseAdmin.from('profiles')
        .update({ is_active: set_active })
        .eq('id', user_id);
      if (profileErr) return json({ error: profileErr.message }, 400);

      await supabaseAdmin.from('school_members')
        .update({ status: newStatus })
        .eq('user_id', user_id);

      console.log(`[admin-actions] Set user ${user_id} active=${set_active}`);
      return json({ success: true });
    }

    // ── reset_user_password ───────────────────────────────────────────────────
    if (action === 'reset_user_password') {
      const { user_id, new_password } = body as { user_id: string; new_password: string };
      if (!user_id || !new_password) return json({ error: 'user_id and new_password are required' }, 400);
      if (new_password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);

      const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { password: new_password });
      if (error) return json({ error: error.message }, 400);

      console.log(`[admin-actions] Reset password for user ${user_id}`);
      return json({ success: true });
    }

    // ── delete_user ───────────────────────────────────────────────────────────
    if (action === 'delete_user') {
      const { user_id } = body as { user_id: string };
      if (!user_id) return json({ error: 'user_id is required' }, 400);

      await supabaseAdmin.from('school_members').delete().eq('user_id', user_id);
      await supabaseAdmin.from('profiles').delete().eq('id', user_id);
      const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (deleteErr) return json({ error: deleteErr.message }, 400);

      console.log(`[admin-actions] Deleted user ${user_id}`);
      return json({ success: true });
    }

    // ── reset_password (legacy — generates recovery link) ─────────────────────
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

    // ── deactivate_user (legacy) ──────────────────────────────────────────────
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

    // ── update_subscription ───────────────────────────────────────────────────
    if (action === 'update_subscription') {
      const { school_id, tier, expiry_date } = body as { school_id: string; tier: string; expiry_date?: string | null };
      if (!school_id || !tier) return json({ error: 'school_id and tier are required' }, 400);

      const { error } = await supabaseAdmin.from('schools').update({
        subscription_tier:       tier,
        subscription_expires_at: expiry_date || null,
      }).eq('id', school_id);
      if (error) return json({ error: error.message }, 400);

      console.log(`[admin-actions] Updated subscription for school ${school_id} → ${tier}`);
      return json({ success: true });
    }

    // ── create_school_full ────────────────────────────────────────────────────
    if (action === 'create_school_full') {
      const {
        name_en, name_ar, school_type, oaaaqa_code, governorate,
        full_name, email, password,
        tier, expiry_date,
      } = body as Record<string, string>;

      if (!name_en || !email || !password) {
        return json({ error: 'name_en, email and password are required' }, 400);
      }

      // 1. Create school
      const { data: schoolData, error: schoolErr } = await supabaseAdmin
        .from('schools')
        .insert({
          name_en,
          name_ar:                 name_ar         || null,
          school_type:             school_type     || 'government',
          oaaaqa_code:             oaaaqa_code     || null,
          governorate:             governorate     || null,
          subscription_tier:       tier            || 'trial',
          subscription_expires_at: expiry_date     || null,
          is_active:               true,
        })
        .select('id')
        .single();
      if (schoolErr) return json({ error: schoolErr.message }, 400);
      const schoolId = (schoolData as { id: string }).id;

      // 2. Create auth user with known password
      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (authErr) {
        await supabaseAdmin.from('schools').delete().eq('id', schoolId);
        return json({ error: authErr.message }, 400);
      }
      const newUserId = authData.user.id;

      // 3. Insert profile
      const { error: profileErr } = await supabaseAdmin.from('profiles').insert({
        id:        newUserId,
        full_name: full_name || null,
        email,
        role:      'school_admin',
      });
      if (profileErr) {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
        await supabaseAdmin.from('schools').delete().eq('id', schoolId);
        return json({ error: profileErr.message }, 400);
      }

      // 4. Insert school_member
      await supabaseAdmin.from('school_members').insert({
        school_id: schoolId,
        user_id:   newUserId,
        role:      'school_admin',
        status:    'active',
      });

      // 5. Get framework version
      const { data: fwVer } = await supabaseAdmin
        .from('framework_versions')
        .select('id')
        .eq('version_code', 'OAAAQA-2024')
        .maybeSingle();

      // 6. Insert default academic year
      await supabaseAdmin.from('academic_years').insert({
        school_id:            schoolId,
        label:                '2024-2025',
        is_current:           true,
        framework_version_id: (fwVer as { id: string } | null)?.id ?? null,
      });

      console.log(`[admin-actions] Created school ${name_en} with admin ${email}`);
      return json({ success: true, school_id: schoolId, user_id: newUserId });
    }

    // ── get_analytics ─────────────────────────────────────────────────────────
    if (action === 'get_analytics') {
      const now      = new Date();
      const ago30d   = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const ago6mo   = new Date(now);
      ago6mo.setMonth(ago6mo.getMonth() - 6);

      const [schoolsRes, usersRes, sedsRes, aiRes, tierRes, sedsMonthRes, membersRes, judgementsRes] =
        await Promise.all([
          supabaseAdmin.from('schools')
            .select('id, name_en, governorate, subscription_tier, subscription_expires_at', { count: 'exact' })
            .eq('is_active', true),
          supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
          supabaseAdmin.from('sed_documents').select('*', { count: 'exact', head: true }),
          supabaseAdmin.from('ai_feedback').select('*', { count: 'exact', head: true }).gte('created_at', ago30d),
          supabaseAdmin.from('schools').select('subscription_tier').eq('is_active', true),
          supabaseAdmin.from('sed_documents').select('created_at').gte('created_at', ago6mo.toISOString()),
          supabaseAdmin.from('school_members').select('school_id').eq('status', 'active'),
          supabaseAdmin.from('overall_judgements')
            .select('school_id, calculated_at')
            .order('calculated_at', { ascending: false }),
        ]);

      // schools_by_tier
      const tierCounts: Record<string, number> = {};
      for (const s of (tierRes.data ?? []) as Array<{ subscription_tier: string }>) {
        const t = s.subscription_tier || 'trial';
        tierCounts[t] = (tierCounts[t] || 0) + 1;
      }
      const schools_by_tier = Object.entries(tierCounts).map(([tier, count]) => ({ tier, count }));

      // seds_by_month (last 6 months)
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthKeys: string[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - i);
        monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
      const monthCounts: Record<string, number> = Object.fromEntries(monthKeys.map(k => [k, 0]));
      for (const doc of (sedsMonthRes.data ?? []) as Array<{ created_at: string }>) {
        const d   = new Date(doc.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (key in monthCounts) monthCounts[key]++;
      }
      const seds_by_month = monthKeys.map(k => ({
        month: monthNames[parseInt(k.split('-')[1], 10) - 1],
        count: monthCounts[k],
      }));

      // user count per school
      const membersBySchool: Record<string, number> = {};
      for (const m of (membersRes.data ?? []) as Array<{ school_id: string }>) {
        membersBySchool[m.school_id] = (membersBySchool[m.school_id] || 0) + 1;
      }

      // last activity per school
      const lastActivity: Record<string, string> = {};
      for (const j of (judgementsRes.data ?? []) as Array<{ school_id: string; calculated_at: string }>) {
        if (!lastActivity[j.school_id]) lastActivity[j.school_id] = j.calculated_at;
      }

      type SchoolRow = { id: string; name_en: string; governorate: string | null; subscription_tier: string; subscription_expires_at: string | null };
      const schools_detail = ((schoolsRes.data ?? []) as SchoolRow[]).map(s => ({
        id:                      s.id,
        name_en:                 s.name_en,
        governorate:             s.governorate,
        subscription_tier:       s.subscription_tier || 'trial',
        subscription_expires_at: s.subscription_expires_at,
        user_count:              membersBySchool[s.id] ?? 0,
        last_activity:           lastActivity[s.id]  ?? null,
      }));

      return json({
        total_schools:    schoolsRes.count ?? 0,
        total_users:      usersRes.count   ?? 0,
        total_seds:       sedsRes.count    ?? 0,
        ai_requests_30d:  aiRes.count      ?? 0,
        schools_by_tier,
        seds_by_month,
        schools_detail,
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
