import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

// ─── Email helper ─────────────────────────────────────────────

interface EmailPayload {
  to: string;
  subject: string;
  text: string;
}

async function sendEmail(payload: EmailPayload): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    // Graceful degradation — log and continue
    console.log(`[send-reminders] (Resend not configured) WOULD SEND EMAIL:
  To: ${payload.to}
  Subject: ${payload.subject}
  Body: ${payload.text}`);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    'Madrasa Comply <noreply@madrasacomply.om>',
      to:      [payload.to],
      subject: payload.subject,
      text:    payload.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[send-reminders] Resend error ${res.status}: ${body}`);
  }
}

// ─── Main handler ─────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Verify cron secret
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || cronSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const svc = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const results = {
    followup_reminders_sent: 0,
    action_items_marked_overdue: 0,
    overdue_emails_sent: 0,
    seven_day_warnings_sent: 0,
    errors: [] as string[],
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── 1. Follow-up visit reminders ─────────────────────────────

  try {
    const { data: visits, error: vErr } = await svc
      .from('review_visits')
      .select('id, school_id, followup_deadline, schools(name_en)')
      .not('followup_deadline', 'is', null)
      .gt('followup_deadline', today.toISOString().split('T')[0]);

    if (vErr) throw vErr;

    const REMINDER_DAYS = [90, 60, 30, 14];

    for (const visit of visits ?? []) {
      const deadline = new Date(visit.followup_deadline as string);
      deadline.setHours(0, 0, 0, 0);
      const daysLeft = Math.round((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (!REMINDER_DAYS.includes(daysLeft)) continue;

      const schoolName = (Array.isArray(visit.schools) ? visit.schools[0] : visit.schools as { name_en: string } | null)?.name_en ?? 'your school';
      const deadlineStr = deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

      // Fetch all school_admin emails for this school
      const { data: admins } = await svc
        .from('school_members')
        .select('profiles(email)')
        .eq('school_id', visit.school_id as string)
        .eq('role', 'school_admin')
        .eq('status', 'active');

      for (const admin of admins ?? []) {
        const profile = Array.isArray(admin.profiles) ? admin.profiles[0] : admin.profiles as { email: string } | null;
        const email = profile?.email;
        if (!email) continue;

        await sendEmail({
          to:      email,
          subject: `[Madrasa Comply] Follow-up visit reminder — ${daysLeft} days remaining`,
          text: `Your school ${schoolName} has a follow-up visit deadline in ${daysLeft} days (${deadlineStr}).

Please ensure your Progress Report (Annex 4) is submitted at least 3 weeks before this date.

Log in at ${Deno.env.get('PUBLIC_SITE_URL') ?? 'https://madrasacomply.om'} to prepare your report.

Madrasa Comply`,
        });
        results.followup_reminders_sent++;
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[send-reminders] follow-up block error:', msg);
    results.errors.push(`followup: ${msg}`);
  }

  // ── 2. Mark overdue action items + send emails ────────────────

  try {
    const todayStr = today.toISOString().split('T')[0];

    // Find items that should be marked overdue
    const { data: overdueItems, error: oErr } = await svc
      .from('action_items')
      .select('id, title, school_id, assigned_to, due_date, schools(name_en)')
      .neq('status', 'completed')
      .neq('status', 'overdue')
      .lt('due_date', todayStr);

    if (oErr) throw oErr;

    if ((overdueItems?.length ?? 0) > 0) {
      const ids = (overdueItems ?? []).map((i: { id: string }) => i.id);

      const { error: updateErr } = await svc
        .from('action_items')
        .update({ status: 'overdue' })
        .in('id', ids);

      if (updateErr) throw updateErr;
      results.action_items_marked_overdue = ids.length;
    }

    // Send emails for newly-overdue items
    for (const item of overdueItems ?? []) {
      const ai = item as {
        id: string; title: string; school_id: string; assigned_to: string | null;
        due_date: string; schools: { name_en: string } | Array<{ name_en: string }> | null;
      };
      if (!ai.assigned_to) continue;

      const { data: profile } = await svc
        .from('profiles')
        .select('email, full_name')
        .eq('id', ai.assigned_to)
        .maybeSingle();

      if (!profile?.email) continue;

      const schoolName = (Array.isArray(ai.schools) ? ai.schools[0] : ai.schools as { name_en: string } | null)?.name_en ?? 'your school';
      const dueDateStr = new Date(ai.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

      await sendEmail({
        to:      profile.email,
        subject: `[Madrasa Comply] Action item overdue — ${ai.title}`,
        text: `Hello${profile.full_name ? ` ${profile.full_name}` : ''},

Action item "${ai.title}" assigned to you in ${schoolName} is now overdue (due ${dueDateStr}).

Please update its status in the platform.

Log in at ${Deno.env.get('PUBLIC_SITE_URL') ?? 'https://madrasacomply.om'}

Madrasa Comply`,
      });
      results.overdue_emails_sent++;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[send-reminders] overdue block error:', msg);
    results.errors.push(`overdue: ${msg}`);
  }

  // ── 3. 7-day warnings for upcoming action items ───────────────

  try {
    const todayStr   = today.toISOString().split('T')[0];
    const in7days    = new Date(today); in7days.setDate(in7days.getDate() + 7);
    const in7daysStr = in7days.toISOString().split('T')[0];
    const in8days    = new Date(today); in8days.setDate(in8days.getDate() + 8);
    const in8daysStr = in8days.toISOString().split('T')[0];

    const { data: upcoming, error: uErr } = await svc
      .from('action_items')
      .select('id, title, school_id, assigned_to, due_date, schools(name_en)')
      .neq('status', 'completed')
      .neq('status', 'overdue')
      .gte('due_date', todayStr)
      .lt('due_date', in8daysStr);

    if (uErr) throw uErr;

    for (const item of upcoming ?? []) {
      const ai = item as {
        id: string; title: string; school_id: string; assigned_to: string | null;
        due_date: string; schools: { name_en: string } | Array<{ name_en: string }> | null;
      };
      if (!ai.assigned_to) continue;

      const { data: profile } = await svc
        .from('profiles')
        .select('email, full_name')
        .eq('id', ai.assigned_to)
        .maybeSingle();

      if (!profile?.email) continue;

      const dueDateStr = new Date(ai.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const daysLeft   = Math.round((new Date(ai.due_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      await sendEmail({
        to:      profile.email,
        subject: `[Madrasa Comply] Action item due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} — ${ai.title}`,
        text: `Hello${profile.full_name ? ` ${profile.full_name}` : ''},

Action item "${ai.title}" is due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} (${dueDateStr}).

Please complete it or update its status in the platform.

Log in at ${Deno.env.get('PUBLIC_SITE_URL') ?? 'https://madrasacomply.om'}

Madrasa Comply`,
      });
      results.seven_day_warnings_sent++;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[send-reminders] 7-day block error:', msg);
    results.errors.push(`7day: ${msg}`);
  }

  console.log('[send-reminders] complete:', results);

  return new Response(JSON.stringify(results), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
