// Daily Gmail auto-sender for cold outreach.
// - Runs only on weekdays (Mon-Fri UTC)
// - Picks top-scoring leads with email, not opted out, not already emailed
// - Sends up to N emails (default 100) using send-gmail (which has its own caps + dedupe)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_DAILY = 100;
const DEFAULT_SUBJECT = 'En snabb fråga om era inkommande samtal';
const DEFAULT_BODY = `Hej {name}!

Vi bygger en AI-receptionist som svarar i telefon dygnet runt så ni inte missar några samtal från nya kunder.

Vill du höra hur det fungerar? Tar 5 minuter.`;

function personalize(t: string, lead: any) {
  return t
    .replace(/\{name\}/g, lead.name || 'där')
    .replace(/\{city\}/g, (lead.address || '').split(',').slice(-2)[0]?.trim() || '');
}

async function recordNotification(supabase: any, input: {
  type: string;
  title: string;
  message: string;
  payload?: Record<string, unknown>;
}) {
  await supabase.from('app_notifications').insert({
    type: input.type,
    title: input.title,
    message: input.message,
    payload: input.payload || {},
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const { requireCronServiceOrUserJwt } = await import('../_shared/auth.ts');
  const authFail = await requireCronServiceOrUserJwt(req, corsHeaders);
  if (authFail) return authFail;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Read settings
    const keys = ['gmail_autosend_enabled', 'gmail_autosend_daily', 'gmail_autosend_subject', 'gmail_autosend_body', 'gmail_autosend_force'];
    const { data: rows } = await supabase.from('settings').select('key, value').in('key', keys);
    const cfg: Record<string, string> = {};
    (rows || []).forEach((r: any) => { cfg[r.key] = r.value; });

    const enabled = cfg.gmail_autosend_enabled === 'true';
    const force = cfg.gmail_autosend_force === 'true'; // manual "Run now" override
    const daily = Math.max(1, Math.min(500, parseInt(cfg.gmail_autosend_daily || '') || DEFAULT_DAILY));
    const subjectTpl = cfg.gmail_autosend_subject || DEFAULT_SUBJECT;
    const bodyTpl = cfg.gmail_autosend_body || DEFAULT_BODY;

    if (!enabled && !force) {
      await recordNotification(supabase, {
        type: 'gmail_batch_done',
        title: 'Gmail auto-send skipped',
        message: 'Auto-send is disabled.',
        payload: { reason: 'disabled' },
      });
      return new Response(JSON.stringify({ skipped: true, reason: 'disabled' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Business day check (Mon=1..Fri=5, UTC) — bypass if force flag set
    const dow = new Date().getUTCDay();
    if (!force && (dow === 0 || dow === 6)) {
      await recordNotification(supabase, {
        type: 'gmail_batch_done',
        title: 'Gmail auto-send skipped',
        message: 'Auto-send does not run on weekends.',
        payload: { reason: 'weekend' },
      });
      return new Response(JSON.stringify({ skipped: true, reason: 'weekend' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Count already sent today (UTC day)
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
    const { count: sentToday } = await supabase
      .from('message_logs').select('id', { count: 'exact', head: true })
      .eq('channel', 'email').eq('direction', 'outbound').eq('status', 'sent')
      .gte('created_at', startOfDay.toISOString());
    const remaining = Math.max(0, daily - (sentToday ?? 0));
    if (remaining === 0) {
      await recordNotification(supabase, {
        type: 'gmail_batch_done',
        title: 'Gmail auto-send skipped',
        message: 'Daily email cap was already reached.',
        payload: { reason: 'daily_cap_reached', sentToday: sentToday ?? 0, daily },
      });
      return new Response(JSON.stringify({ skipped: true, reason: 'daily_cap_reached', sentToday }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Pick top-scoring eligible leads. Pull a bigger window then filter out already-emailed via message_logs.
    const { data: candidates } = await supabase
      .from('leads')
      .select('id, name, email, address, potential_score, lead_tier, outreach_stage, outreach_state, outreach_opt_out, do_not_contact')
      .not('email', 'is', null)
      .neq('email', '')
      .eq('outreach_opt_out', false)
      .eq('do_not_contact', false)
      .neq('outreach_stage', 'email_sent')
      .neq('outreach_state', 'email_sent')
      .neq('outreach_state', 'do_not_contact')
      .in('lead_tier', ['S', 'A+', 'A'])
      .order('potential_score', { ascending: false, nullsFirst: false })
      .limit(remaining * 3);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    let sent = 0, skipped = 0, failed = 0;
    const details: any[] = [];

    for (const lead of (candidates || [])) {
      if (sent >= remaining) break;
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/send-gmail`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            leadId: lead.id,
            to: lead.email,
            subject: personalize(subjectTpl, lead),
            body: personalize(bodyTpl, lead),
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (data?.success) { sent++; details.push({ id: lead.id, status: 'sent' }); }
        else if (data?.skipped) { skipped++; details.push({ id: lead.id, status: 'skipped', reason: data.reason }); }
        else { failed++; details.push({ id: lead.id, status: 'failed', error: data?.error }); }
        // Stop early if send-gmail tells us the daily cap is hit
        if (data?.reason === 'daily_cap') break;
      } catch (e: any) {
        failed++; details.push({ id: lead.id, status: 'failed', error: e?.message });
      }
    }

    // Clear force flag once manual run completes
    if (force) {
      await supabase.from('settings').update({ value: 'false', updated_at: new Date().toISOString() } as any).eq('key', 'gmail_autosend_force');
    }

    await recordNotification(supabase, {
      type: 'gmail_batch_done',
      title: force ? 'Manual Gmail auto-send finished' : 'Scheduled Gmail auto-send finished',
      message: `${sent} sent, ${skipped} skipped, ${failed} failed.`,
      payload: { sent, skipped, failed, remaining: remaining - sent, forced: force },
    });

    return new Response(JSON.stringify({
      success: true,
      sent, skipped, failed,
      remaining: remaining - sent,
      timestamp: new Date().toISOString(),
      details: details.slice(0, 20),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
