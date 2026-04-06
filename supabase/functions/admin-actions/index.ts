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

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) return json({ error: 'Invalid token' }, 401);

    const { data: callerProfile } = await supabaseUser
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (callerProfile?.role !== 'admin') {
      return json({ error: 'Forbidden — admin access required' }, 403);
    }

    // ── Service-role client for admin operations ────────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json();
    const { action } = body;

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
