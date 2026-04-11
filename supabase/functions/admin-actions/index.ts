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
    // ── Auth: verify caller and confirm admin role ──────────────────────────
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Missing authorization token' }, 401);

    // Decode the JWT directly instead of calling auth.getUser()
    const payload = JSON.parse(atob(token.split('.')[1]));
    const userId = payload.sub;
    if (!userId) return json({ error: 'Invalid token' }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json();
    const { action } = body;

    // ── invite_school_user — school admins only, no super_admin required ───
    if (action === 'invite_school_user') {
      const { email, full_name, role, subject_area, school_id } = body;
      if (!email || !role || !school_id) {
        return json({ error: 'email, role and school_id are required' }, 400);
      }

      // Verify caller is school_admin (or principal) for this school
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

      // Map UI role keys to DB values
      const roleMap: Record<string, string> = {
        school_admin: 'school_admin',
        hod:          'head_of_department',
        teacher:      'teacher',
        viewer:       'auditor',
      };
      const dbRole    = roleMap[role] ?? 'teacher';
      const memberRole = dbRole; // school_members uses same values

      // Invite via Supabase Auth (sends email with magic link)
      const { data: inviteData, error: inviteErr } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          data: { full_name, school_id, role: dbRole },
        });
      if (inviteErr) return json({ error: inviteErr.message }, 400);

      const newUserId = inviteData.user.id;

      // Create profile immediately (user may not accept invite right away)
      await supabaseAdmin.from('profiles').upsert({
        id:         newUserId,
        email,
        full_name:  full_name ?? null,
        role:       dbRole,
        department: subject_area ?? null,
      }, { onConflict: 'id' });

      // Create school_members entry
      await supabaseAdmin.from('school_members').upsert({
        school_id,
        user_id:    newUserId,
        role:       memberRole,
        status:     'pending',
        invited_by: userId,
      }, { onConflict: 'school_id,user_id' });

      return json({ success: true, user_id: newUserId });
    }

    // ── All other actions require super_admin ──────────────────────────────
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('is_super_admin')
      .eq('id', userId)
      .single();

    if (!callerProfile?.is_super_admin) {
      return json({ error: 'Forbidden — super admin access required' }, 403);
    }

    const { action: _action } = body; // already read, just for clarity

    // ── create_user ─────────────────────────────────────────────────────────
    if (action === 'create_user') {
      const { email, full_name, role, school_id } = body;
      if (!email || !role) return json({ error: 'email and role are required' }, 400);

      // Create confirmed auth user (no password — they'll set one via reset link)
      const { data: authData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (createErr) return json({ error: createErr.message }, 400);

      // Insert profile row
      const { error: profileErr } = await supabaseAdmin.from('profiles').insert({
        id: authData.user.id,
        email,
        full_name,
        role,
        school_id: school_id || null,
      });
      if (profileErr) {
        // Roll back the auth user on profile failure
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        return json({ error: profileErr.message }, 400);
      }

      console.log(`[admin-actions] Created user ${email} with role ${role}`);
      return json({ success: true, user_id: authData.user.id });
    }

    // ── delete_user ─────────────────────────────────────────────────────────
    if (action === 'delete_user') {
      const { user_id } = body;
      if (!user_id) return json({ error: 'user_id is required' }, 400);

      // Delete profile first (FK constraint)
      await supabaseAdmin.from('profiles').delete().eq('id', user_id);

      const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (deleteErr) return json({ error: deleteErr.message }, 400);

      console.log(`[admin-actions] Deleted user ${user_id}`);
      return json({ success: true });
    }

    // ── get_stats ─────────────────────────────────────────────────────────
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
        schools: schools.count ?? 0,
        users: users.count ?? 0,
        evidence: evidence.count ?? 0,
        actions: actions.count ?? 0,
        recentEvidence: recentEvidence.data ?? [],
        recentActions: recentActions.data ?? [],
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);

  } catch (err) {
    console.error('[admin-actions] Error:', err);
    return json({ error: String(err) }, 500);
  }
});
