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
    // ── 1. Decode JWT from Authorization header ───────────────────────────────
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Missing authorization token' }, 401);

    let userId: string;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      userId = payload.sub;
      if (!userId) throw new Error('Missing sub');
    } catch {
      return json({ error: 'Invalid token' }, 401);
    }

    // ── 2. Service-role Supabase client ───────────────────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ── 3. Authorise caller: profiles.role = 'school_admin' OR is_super_admin ─
    const { data: callerProfile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', userId)
      .single();

    if (profileErr || !callerProfile) {
      return json({ error: 'Caller profile not found' }, 403);
    }

    const callerIsAdmin =
      callerProfile.is_super_admin === true ||
      callerProfile.role === 'school_admin';

    if (!callerIsAdmin) {
      return json({ error: 'Forbidden — school_admin or super_admin required' }, 403);
    }

    // ── 4. Parse and validate request body ────────────────────────────────────
    const body = await req.json() as {
      email?: string;
      role?: string;
      school_id?: string;
      full_name?: string;
    };

    const { email, role, school_id, full_name } = body;

    if (!email)     return json({ error: 'email is required' }, 400);
    if (!role)      return json({ error: 'role is required' }, 400);
    if (!school_id) return json({ error: 'school_id is required' }, 400);

    // Validate role value against allowed set
    const allowedRoles = [
      'school_admin', 'head_of_department', 'teacher', 'auditor',
      'principal', 'vice_principal', 'senior_management', 'quality_coordinator',
    ];
    if (!allowedRoles.includes(role)) {
      return json({ error: `Invalid role: ${role}` }, 400);
    }

    // ── 5. Invite via Supabase Auth ───────────────────────────────────────────
    const { data: inviteData, error: inviteErr } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: full_name ?? null, school_id, role },
      });

    if (inviteErr) {
      console.error('[invite-user] inviteUserByEmail error:', inviteErr.message);
      return json({ error: inviteErr.message }, 400);
    }

    const newUserId = inviteData.user.id;

    // ── 6. Upsert profile row (user may not accept invite immediately) ─────────
    const { error: upsertProfileErr } = await supabaseAdmin
      .from('profiles')
      .upsert(
        { id: newUserId, email, full_name: full_name ?? null, role },
        { onConflict: 'id' }
      );

    if (upsertProfileErr) {
      console.error('[invite-user] profiles upsert error:', upsertProfileErr.message);
      // Non-fatal: log and continue — school_members row is the critical one
    }

    // ── 7. Insert school_members row ─────────────────────────────────────────
    const { error: memberErr } = await supabaseAdmin
      .from('school_members')
      .upsert(
        {
          school_id,
          user_id:    newUserId,
          role,
          status:     'pending',
          invited_by: userId,
        },
        { onConflict: 'school_id,user_id' }
      );

    if (memberErr) {
      console.error('[invite-user] school_members upsert error:', memberErr.message);
      return json({ error: memberErr.message }, 400);
    }

    console.log(`[invite-user] Invited ${email} (${role}) to school ${school_id} by ${userId}`);
    return json({ success: true, user_id: newUserId });

  } catch (err) {
    console.error('[invite-user] Unhandled error:', err);
    return json({ error: String(err) }, 500);
  }
});
