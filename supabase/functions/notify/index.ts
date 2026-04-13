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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify JWT is valid by using it with the anon client
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json() as {
      school_id: string;
      user_ids: string[];
      type: string;
      title: string;
      body?: string;
      link?: string;
    };

    const { school_id, user_ids, type, title } = body;
    if (!school_id || !user_ids?.length || !type || !title) {
      return json({ error: 'Missing required fields: school_id, user_ids, type, title' }, 400);
    }

    const rows = user_ids.map((uid) => ({
      school_id,
      user_id: uid,
      type,
      title,
      body: body.body ?? null,
      link: body.link ?? null,
    }));

    const { error } = await supabaseAdmin.from('notifications').insert(rows);
    if (error) throw error;

    // ─── Email via Resend (optional) ─────────────────────────────
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey) {
      try {
        // Fetch email addresses for recipients
        const { data: profiles } = await supabaseAdmin
          .from('profiles')
          .select('id, full_name, email')
          .in('id', user_ids);

        const recipients = (profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>;
        const emailTargets = recipients.filter(p => p.email);

        if (emailTargets.length > 0) {
          const linkHtml = body.link
            ? `<p style="margin-top:16px"><a href="${body.link}" style="color:#01696f;text-decoration:underline">View in Madrasa Comply →</a></p>`
            : '';

          const emailBody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;background:#f7f6f2;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
    <div style="background:#0c4e54;padding:20px 24px">
      <span style="color:#fff;font-size:16px;font-weight:700">Madrasa Comply</span>
    </div>
    <div style="padding:24px">
      <h2 style="margin:0 0 8px;font-size:18px;color:#111">${title}</h2>
      ${body.body ? `<p style="color:#555;font-size:14px;margin:0 0 8px">${body.body}</p>` : ''}
      ${linkHtml}
    </div>
    <div style="background:#f7f6f2;padding:12px 24px;font-size:11px;color:#999">
      You received this because you are a registered user of Madrasa Comply.
    </div>
  </div>
</body>
</html>`;

          await Promise.all(
            emailTargets.map(async (p) => {
              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${resendKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  from: 'Madrasa Comply <notifications@madrasacomply.com>',
                  to: [p.email!],
                  subject: title,
                  html: emailBody,
                }),
              });
            })
          );
        }
      } catch (emailErr) {
        // Email errors are non-fatal — log and continue
        console.error('notify email error:', emailErr);
      }
    }

    return json({ inserted: rows.length });
  } catch (e) {
    console.error('notify error:', e);
    return json({ error: String(e) }, 500);
  }
});
