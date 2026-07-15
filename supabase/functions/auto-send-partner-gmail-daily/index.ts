/* eslint-disable @typescript-eslint/no-explicit-any */
// Daily partner Gmail auto-sender.
// Separate from normal customer outreach: reads partner_prospects and writes partner_outreach_logs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_DAILY = 100;
const DEFAULT_BATCH = 10;
const DEFAULT_SUPPLY_MIN = 140;
const CRON_INTERVAL_MINUTES = 20;
const PARTNER_GMAIL_AUTOMATION_DISABLED = true;
const DISABLED_MESSAGE = 'Partner Gmail automation is hard-disabled after live outreach spend leaked through. Manual review only.';

function intSetting(settings: Record<string, string>, key: string, fallback: number, min: number, max: number) {
  const value = Number.parseInt(settings[key] || '', 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function csvSetting(value: string | undefined, fallback: string[]) {
  const parts = String(value || '').split(',').map(part => part.trim()).filter(Boolean);
  return parts.length ? parts : fallback;
}

function localParts(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const weekday = parts.find(part => part.type === 'weekday')?.value || 'Mon';
  const hour = Number(parts.find(part => part.type === 'hour')?.value || '0');
  const minute = Number(parts.find(part => part.type === 'minute')?.value || '0');
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

function startOfUtcDay() {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

function triggerPartnerReplenish(supabaseUrl: string, serviceKey: string, body: Record<string, unknown>) {
  fetch(`${supabaseUrl}/functions/v1/auto-partner-finder-replenish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
    body: JSON.stringify(body),
  }).catch(() => {});
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

  if (PARTNER_GMAIL_AUTOMATION_DISABLED) {
    return new Response(JSON.stringify({
      skipped: true,
      reason: 'disabled',
      disabled: true,
      message: DISABLED_MESSAGE,
      sent: 0,
      failed: 0,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;
    const settingsKeys = [
      'partner_gmail_auto_enabled',
      'partner_gmail_daily_cap',
      'partner_gmail_batch_size',
      'partner_gmail_supply_min',
      'partner_gmail_start_hour',
      'partner_gmail_start_minute',
      'partner_gmail_end_hour',
      'partner_gmail_end_minute',
      'partner_gmail_days',
      'partner_gmail_timezone',
    ];
    const { data: rows } = await supabase.from('settings').select('key,value').in('key', settingsKeys);
    const cfg: Record<string, string> = {};
    for (const row of rows || []) cfg[row.key] = row.value;

    const enabled = cfg.partner_gmail_auto_enabled !== 'false';
    const dailyCap = intSetting(cfg, 'partner_gmail_daily_cap', DEFAULT_DAILY, 1, 100);
    const configuredBatch = intSetting(cfg, 'partner_gmail_batch_size', DEFAULT_BATCH, 1, 25);
    const supplyMin = intSetting(cfg, 'partner_gmail_supply_min', DEFAULT_SUPPLY_MIN, 20, 1000);
    const startHour = intSetting(cfg, 'partner_gmail_start_hour', 8, 0, 23);
    const startMinute = intSetting(cfg, 'partner_gmail_start_minute', 0, 0, 59);
    const endHour = intSetting(cfg, 'partner_gmail_end_hour', 18, 1, 24);
    const endMinute = intSetting(cfg, 'partner_gmail_end_minute', 0, 0, 59);
    const timeZone = cfg.partner_gmail_timezone || 'Europe/Stockholm';
    const days = csvSetting(cfg.partner_gmail_days, ['1', '2', '3', '4', '5']).map(Number);
    const nowLocal = localParts(timeZone);

    if (!enabled && !force) {
      return new Response(JSON.stringify({ skipped: true, reason: 'disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!force && !days.includes(nowLocal.day)) {
      return new Response(JSON.stringify({ skipped: true, reason: 'day_blocked', day: nowLocal.day }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!force && !insideWindow(nowLocal, startHour, startMinute, endHour, endMinute)) {
      return new Response(JSON.stringify({ skipped: true, reason: 'outside_send_window', nowLocal, startHour, startMinute, endHour, endMinute }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const dayStart = startOfUtcDay();
    const { count: sentTodayCount } = await supabase
      .from('partner_outreach_logs')
      .select('id', { count: 'exact', head: true })
      .eq('channel', 'email')
      .eq('direction', 'outbound')
      .eq('status', 'sent')
      .gte('created_at', dayStart.toISOString());
    const sentToday = sentTodayCount || 0;
    const remaining = Math.max(0, dailyCap - sentToday);

    const { data: allReadyRows } = await supabase
      .from('partner_prospects')
      .select('id, email, status, do_not_contact')
      .not('email', 'is', null)
      .neq('email', '')
      .eq('do_not_contact', false)
      .not('status', 'in', '(contacted,replied,partner_call_booked,qualified,not_fit,do_not_contact)')
      .limit(2000);
    const rawSupply = allReadyRows || [];

    if (!force && rawSupply.length < supplyMin) {
      triggerPartnerReplenish(supabaseUrl, serviceKey, {
        trigger: 'partner_supply_low',
        targetReady: Math.max(supplyMin, dailyCap + 40),
      });
    }

    if (remaining <= 0) {
      await recordNotification(supabase, {
        type: 'partner_gmail_batch_done',
        title: 'Partner Gmail skipped: daily target reached',
        message: `${sentToday}/${dailyCap} partner emails already sent today.`,
        payload: { reason: 'daily_cap_reached', sentToday, dailyCap, readySupply: rawSupply.length },
      });
      return new Response(JSON.stringify({ skipped: true, reason: 'daily_cap_reached', sentToday, dailyCap, readySupply: rawSupply.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const slotsLeft = checksLeftToday(nowLocal.hour, nowLocal.minute, endHour, endMinute);
    const catchUpBatch = Math.ceil(remaining / slotsLeft);
    const batchSize = Math.max(configuredBatch, Math.min(25, catchUpBatch));

    const { data: sentLogs } = await supabase
      .from('partner_outreach_logs')
      .select('partner_prospect_id,to_email')
      .eq('channel', 'email')
      .eq('direction', 'outbound')
      .eq('status', 'sent')
      .limit(10000);
    const sentIds = new Set((sentLogs || []).map((log: any) => log.partner_prospect_id).filter(Boolean));
    const sentEmails = new Set((sentLogs || []).map((log: any) => String(log.to_email || '').trim().toLowerCase()).filter(Boolean));

    const { data: prospects } = await supabase
      .from('partner_prospects')
      .select('*')
      .not('email', 'is', null)
      .neq('email', '')
      .eq('do_not_contact', false)
      .not('status', 'in', '(contacted,replied,partner_call_booked,qualified,not_fit,do_not_contact)')
      .order('fit_score', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(500);

    const seenThisBatch = new Set<string>();
    const batch = (prospects || [])
      .filter((prospect: any) => {
        const email = String(prospect.email || '').trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
        if (sentIds.has(prospect.id) || sentEmails.has(email) || seenThisBatch.has(email)) return false;
        seenThisBatch.add(email);
        prospect.email = email;
        return true;
      })
      .slice(0, Math.min(remaining, batchSize));

    if (batch.length === 0) {
      triggerPartnerReplenish(supabaseUrl, serviceKey, {
        trigger: 'partner_empty',
        force: true,
        targetReady: Math.max(supplyMin, dailyCap + 40),
      });
      await recordNotification(supabase, {
        type: 'partner_gmail_batch_done',
        title: 'Partner Gmail waiting for supply',
        message: `No contactable partner emails were ready. Replenish started automatically.`,
        payload: { reason: 'no_contactable_partners', sentToday, dailyCap, readySupply: rawSupply.length },
      });
      return new Response(JSON.stringify({ skipped: true, reason: 'no_contactable_partners', sentToday, dailyCap, readySupply: rawSupply.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const details: any[] = [];

    for (const prospect of batch) {
      const subject = `Partner idea for ${prospect.name}`;
      const message = `Hi ${prospect.name},

I am reaching out from Leadmap. We build an AI receptionist that helps service businesses answer missed calls, qualify the caller, and send a clean summary or booking request to the owner.

I thought this could fit your clients because many telecom, web, IT and local business providers already help companies get more calls, but missed calls still leak revenue.

Would it make sense to book a short partner call and see if this could become a useful add-on for your clients?

Best,
Leadmap.se`;

      const resp = await fetch(`${supabaseUrl}/functions/v1/send-gmail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          partnerProspectId: prospect.id,
          to: prospect.email,
          subject,
          body: message,
          skipCooldown: true,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (data?.success) {
        sent += 1;
        details.push({ id: prospect.id, status: 'sent', gmailId: data.id });
      } else if (data?.skipped) {
        skipped += 1;
        details.push({ id: prospect.id, status: 'skipped', reason: data.reason });
      } else {
        failed += 1;
        details.push({ id: prospect.id, status: 'failed', error: data?.error || resp.statusText, httpStatus: resp.status });
      }
      if (data?.reason === 'daily_cap') break;
    }

    await recordNotification(supabase, {
      type: 'partner_gmail_batch_done',
      title: force ? 'Manual partner Gmail batch finished' : 'Scheduled partner Gmail batch finished',
      message: `${sent} sent, ${skipped} skipped, ${failed} failed. ${sentToday + sent}/${dailyCap} today.`,
      payload: {
        sent,
        skipped,
        failed,
        sentToday: sentToday + sent,
        dailyCap,
        remaining: Math.max(0, dailyCap - sentToday - sent),
        readySupply: rawSupply.length,
        supplyMin,
        batchSize,
        slotsLeft,
        details: details.slice(0, 25),
      },
    });

    return new Response(JSON.stringify({
      success: true,
      sent,
      skipped,
      failed,
      sentToday: sentToday + sent,
      dailyCap,
      remaining: Math.max(0, dailyCap - sentToday - sent),
      readySupply: rawSupply.length,
      batchSize,
      supplyMin,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('auto-send-partner-gmail-daily error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
