// Daily Gmail auto-sender for cold outreach.
// Sends small batches only. send-gmail enforces daily caps, suppression, dedupe and opt-out checks.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_DAILY = 100;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_START_HOUR = 10;
const DEFAULT_END_HOUR = 16;
const CRON_INTERVAL_MINUTES = 5;
const DEFAULT_SUBJECT = 'Quick question about missed calls at {{business_name}}';
const DEFAULT_BODY = `Hi {{owner_name}},

I noticed {{business_name}} serves customers in {{city}}. Leadmap helps service businesses answer and summarize calls when the team is busy or closed.

Would it make sense to show you a 5 minute example?

Best,
Maged

If this is not relevant, reply unsubscribe and I will not contact you again.`;

type ReasonSummary = Record<string, number>;

function personalize(template: string, lead: any) {
  const city = (lead.city || (lead.address || '').split(',').slice(-2)[0]?.trim() || '').trim();
  return template
    .replace(/\{\{business_name\}\}/g, lead.name || 'the business')
    .replace(/\{\{name\}\}/g, lead.name || 'the business')
    .replace(/\{\{owner_name\}\}/g, lead.owner_name || 'there')
    .replace(/\{\{city\}\}/g, city)
    .replace(/\{\{niche\}\}/g, lead.niche_label || lead.category || 'service')
    .replace(/\{name\}/g, lead.name || 'there')
    .replace(/\{city\}/g, city);
}

function validEmail(email: string | null | undefined) {
  return !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

function hasCallContact(lead: any) {
  return !!lead?.last_called_at
    || lead?.last_contact_method === 'AI Call'
    || lead?.outreach_state === 'called'
    || (Number(lead?.call_attempts || 0) > 0);
}

function addReason(summary: ReasonSummary, reason: string) {
  summary[reason] = (summary[reason] || 0) + 1;
}

function labelReason(reason: string) {
  const labels: Record<string, string> = {
    no_saved_email_leads: 'no saved leads with emails',
    invalid_email: 'invalid email',
    duplicate_email: 'duplicate email',
    opt_out: 'opted out',
    do_not_contact: 'do not contact',
    already_emailed: 'already emailed',
    already_called: 'already called',
    do_not_contact_state: 'do not contact state',
    lower_tier: 'not S/A+/A tier',
  };
  return labels[reason] || reason.replace(/_/g, ' ');
}

function summarizeReasons(summary: ReasonSummary) {
  return Object.entries(summary)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([reason, count]) => `${labelReason(reason)} (${count})`);
}

function emailRejectionReasons(lead: any, seenEmails: Set<string>) {
  const reasons: string[] = [];
  const email = String(lead.email || '').trim().toLowerCase();
  if (!validEmail(email)) reasons.push('invalid_email');
  if (seenEmails.has(email)) reasons.push('duplicate_email');
  seenEmails.add(email);
  if (lead.outreach_opt_out) reasons.push('opt_out');
  if (lead.do_not_contact === true) reasons.push('do_not_contact');
  if (lead.outreach_stage === 'email_sent' || lead.outreach_state === 'email_sent') reasons.push('already_emailed');
  if (lead.outreach_state === 'called' || hasCallContact(lead)) reasons.push('already_called');
  if (lead.outreach_state === 'do_not_contact') reasons.push('do_not_contact_state');
  if (!['S', 'A+', 'A'].includes(String(lead.lead_tier || ''))) reasons.push('lower_tier');
  return reasons;
}

async function getEmailEligibilityDiagnostics(supabase: any) {
  const { data: leads } = await supabase
    .from('leads')
    .select('id, name, email, lead_tier, outreach_stage, outreach_state, outreach_opt_out, do_not_contact, last_called_at, last_contact_method, call_attempts')
    .not('email', 'is', null)
    .neq('email', '')
    .limit(5000);

  const summary: ReasonSummary = {};
  const seenEmails = new Set<string>();
  let eligible = 0;
  for (const lead of leads || []) {
    const reasons = emailRejectionReasons(lead, seenEmails);
    if (reasons.length === 0) eligible += 1;
    reasons.forEach((reason) => addReason(summary, reason));
  }

  if (!leads?.length) addReason(summary, 'no_saved_email_leads');
  const topReasons = summarizeReasons(summary);
  return {
    checked: leads?.length || 0,
    eligible,
    rejectionSummary: summary,
    topReasons,
    message: topReasons.length
      ? `No eligible Gmail leads. Top blockers: ${topReasons.join(', ')}.`
      : 'No eligible Gmail leads found.',
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function csvSetting(value: string | undefined, fallback: string[]) {
  const parts = String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : fallback;
}

function intSetting(settings: Record<string, string>, key: string, fallback: number, min: number, max: number) {
  const value = Number.parseInt(settings[key] || '', 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function localParts(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const weekday = parts.find((part) => part.type === 'weekday')?.value || 'Mon';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0');
  const dayIndex: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: dayIndex[weekday] ?? new Date().getUTCDay(), hour, minute };
}

function minutesOfDay(hour: number, minute: number) {
  return (hour * 60) + minute;
}

function insideWindow(now: { hour: number; minute: number }, startHour: number, startMinute: number, endHour: number, endMinute: number) {
  const current = minutesOfDay(now.hour, now.minute);
  return current >= minutesOfDay(startHour, startMinute) && current < minutesOfDay(endHour, endMinute);
}

function checksLeftToday(hour: number, minute: number, endHour: number, endMinute: number) {
  const minutesLeft = Math.max(0, minutesOfDay(endHour, endMinute) - minutesOfDay(hour, minute));
  return Math.max(1, Math.ceil(minutesLeft / CRON_INTERVAL_MINUTES));
}

function windowLabel(startHour: number, startMinute: number, endHour: number, endMinute: number) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(startHour)}:${pad(startMinute)}-${pad(endHour)}:${pad(endMinute)}`;
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
    const keys = [
      'gmail_autosend_enabled',
      'gmail_autosend_daily',
      'gmail_autosend_subject',
      'gmail_autosend_body',
      'gmail_autosend_force',
      'gmail_autosend_delay_seconds',
      'gmail_autosend_batch_size',
      'ai_calls_start_hour',
      'ai_calls_start_minute',
      'ai_calls_end_hour',
      'ai_calls_end_minute',
      'ai_calls_days',
      'ai_calls_timezone',
    ];
    const { data: rows } = await supabase.from('settings').select('key, value').in('key', keys);
    const cfg: Record<string, string> = {};
    (rows || []).forEach((row: any) => { cfg[row.key] = row.value; });

    const enabled = cfg.gmail_autosend_enabled === 'true';
    const force = cfg.gmail_autosend_force === 'true';
    const daily = Math.max(1, Math.min(100, parseInt(cfg.gmail_autosend_daily || '') || DEFAULT_DAILY));
    const configuredBatchSize = Math.max(1, Math.min(20, parseInt(cfg.gmail_autosend_batch_size || '') || DEFAULT_BATCH_SIZE));
    const delaySeconds = Math.max(0, Math.min(900, parseInt(cfg.gmail_autosend_delay_seconds || '') || 0));
    const startHour = intSetting(cfg, 'ai_calls_start_hour', DEFAULT_START_HOUR, 0, 23);
    const startMinute = intSetting(cfg, 'ai_calls_start_minute', 0, 0, 59);
    const endHour = intSetting(cfg, 'ai_calls_end_hour', DEFAULT_END_HOUR, 1, 24);
    const endMinute = intSetting(cfg, 'ai_calls_end_minute', 0, 0, 59);
    const days = csvSetting(cfg.ai_calls_days, ['1', '2', '3', '4', '5']).map(Number);
    const timeZone = cfg.ai_calls_timezone || 'Europe/Stockholm';
    const nowLocal = localParts(timeZone);
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

    if (!force && !days.includes(nowLocal.day)) {
      await recordNotification(supabase, {
        type: 'gmail_batch_done',
        title: 'Gmail auto-send skipped',
        message: 'Auto-send is outside the selected days.',
        payload: { reason: 'day_blocked', day: nowLocal.day },
      });
      return new Response(JSON.stringify({ skipped: true, reason: 'day_blocked', day: nowLocal.day }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!force && !insideWindow(nowLocal, startHour, startMinute, endHour, endMinute)) {
      await recordNotification(supabase, {
        type: 'gmail_batch_done',
        title: 'Gmail auto-send skipped',
        message: `Auto-send is outside the ${windowLabel(startHour, startMinute, endHour, endMinute)} ${timeZone} window.`,
        payload: { reason: 'outside_send_window', hour: nowLocal.hour, minute: nowLocal.minute, startHour, startMinute, endHour, endMinute, timeZone },
      });
      return new Response(JSON.stringify({ skipped: true, reason: 'outside_send_window', hour: nowLocal.hour, minute: nowLocal.minute, startHour, startMinute, endHour, endMinute }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { count: sentToday } = await supabase
      .from('message_logs')
      .select('id', { count: 'exact', head: true })
      .eq('channel', 'email')
      .eq('direction', 'outbound')
      .eq('status', 'sent')
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

    const slotsLeft = checksLeftToday(nowLocal.hour, nowLocal.minute, endHour, endMinute);
    const catchUpBatchSize = Math.ceil(remaining / slotsLeft);
    const batchSize = Math.max(configuredBatchSize, Math.min(20, catchUpBatchSize));

    const { data: candidates, error: candErr } = await supabase
      .from('leads')
      .select('id, name, email, address, city, category, niche_label, potential_score, lead_tier, outreach_stage, outreach_state, outreach_opt_out, do_not_contact, last_called_at, last_contact_method, call_attempts')
      .not('email', 'is', null)
      .neq('email', '')
      .in('lead_tier', ['S', 'A+', 'A'])
      .or('outreach_stage.is.null,outreach_stage.neq.email_sent')
      .is('last_called_at', null)
      .order('potential_score', { ascending: false, nullsFirst: false })
      .limit(1000);
    console.log('[gmail-auto] candidates', { count: candidates?.length, error: candErr?.message });

    const seenEmails = new Set<string>();
    const rejectionTrace: ReasonSummary = {};
    const batch = (candidates || [])
      .filter((lead: any) => {
        const email = String(lead.email || '').trim().toLowerCase();
        const reasons = emailRejectionReasons(lead, seenEmails);
        if (reasons.length > 0) { reasons.forEach(r => addReason(rejectionTrace, r)); return false; }
        lead.email = email;
        return true;
      })
      .slice(0, Math.min(remaining, batchSize));
    console.log('[gmail-auto] batch', { len: batch.length, rejectionTrace });
    const diagnostics = batch.length === 0 ? await getEmailEligibilityDiagnostics(supabase) : null;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const details: any[] = [];

    for (const lead of batch) {
      if (sent >= remaining || sent >= batchSize) break;
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
            skipCooldown: true,
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (data?.success) {
          sent++;
          details.push({ id: lead.id, status: 'sent' });
        } else if (data?.skipped) {
          skipped++;
          details.push({ id: lead.id, status: 'skipped', reason: data.reason });
        } else {
          failed++;
          details.push({ id: lead.id, status: 'failed', error: data?.error });
        }
        if (data?.reason === 'daily_cap' || data?.reason === 'send_cooldown') break;
        if (sent > 0 && delaySeconds > 0 && sent < batch.length) {
          await sleep(Math.min(delaySeconds, 15) * 1000);
        }
      } catch (e: any) {
        failed++;
        details.push({ id: lead.id, status: 'failed', error: e?.message });
      }
    }

    if (force) {
      await supabase.from('settings').update({ value: 'false', updated_at: new Date().toISOString() } as any).eq('key', 'gmail_autosend_force');
    }

    await recordNotification(supabase, {
      type: 'gmail_batch_done',
      title: force ? 'Manual Gmail auto-send finished' : 'Scheduled Gmail auto-send finished',
      message: diagnostics?.message || `${sent} sent, ${skipped} skipped, ${failed} failed.`,
      payload: {
        reason: batch.length === 0 ? 'no_candidates' : undefined,
        sent,
        skipped,
        failed,
        eligible: batch.length,
        checked: diagnostics?.checked,
        rejectionSummary: diagnostics?.rejectionSummary,
        topReasons: diagnostics?.topReasons,
        batchSize,
        configuredBatchSize,
        catchUpBatchSize,
        slotsLeft,
        delaySeconds,
        remaining: remaining - sent,
        forced: force,
        scheduled: !force,
        startHour,
        startMinute,
        endHour,
        endMinute,
        timeZone,
      },
    });

    return new Response(JSON.stringify({
      success: true,
      sent,
      skipped,
      failed,
      sentToday: (sentToday ?? 0) + sent,
      remaining: remaining - sent,
      eligible: batch.length,
      diagnostics,
      batchSize,
      configuredBatchSize,
      catchUpBatchSize,
      slotsLeft,
      delaySeconds,
      timestamp: new Date().toISOString(),
      details: details.slice(0, 20),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
