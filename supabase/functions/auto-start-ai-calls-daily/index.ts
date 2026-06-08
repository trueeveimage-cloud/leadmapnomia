import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_DAILY_CAP = 15;
const DEFAULT_PER_RUN = 1;
const DEFAULT_START_HOUR = 10;
const DEFAULT_END_HOUR = 16;
const DEFAULT_ACTIVE_GUARD_MINUTES = 8;
const EXCLUDED_STATUSES = ['interested', 'not_interested', 'callback', 'closed_won', 'closed_lost'];

type Settings = Record<string, string>;
type ReasonSummary = Record<string, number>;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function intSetting(settings: Settings, key: string, fallback: number, min: number, max: number) {
  const value = Number.parseInt(settings[key] || '', 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function csvSetting(value: string | undefined, fallback: string[]) {
  const parts = String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : fallback;
}

function localParts(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const weekday = parts.find((part) => part.type === 'weekday')?.value || 'Mon';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
  const dayIndex: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: dayIndex[weekday] ?? new Date().getUTCDay(), hour };
}

function normalizeE164(value?: string | null) {
  const compact = String(value || '').trim().replace(/[^\d+]/g, '');
  if (!compact) return null;
  if (compact.startsWith('+')) return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
  if (compact.startsWith('00')) {
    const next = `+${compact.slice(2)}`;
    return /^\+[1-9]\d{7,14}$/.test(next) ? next : null;
  }
  if (compact.startsWith('0')) {
    const next = `+46${compact.slice(1)}`;
    return /^\+[1-9]\d{7,14}$/.test(next) ? next : null;
  }
  if (compact.startsWith('46')) {
    const next = `+${compact}`;
    return /^\+[1-9]\d{7,14}$/.test(next) ? next : null;
  }
  return null;
}

function detectCountry(lead: any) {
  const explicit = String(lead.country || '').trim().toUpperCase();
  if (explicit) return explicit;
  const phone = String(lead.phone_e164 || lead.phone || '');
  const address = String(lead.address || '').toLowerCase();
  if (phone.startsWith('+47') || address.includes('norway') || address.includes('norge')) return 'NO';
  if (phone.startsWith('+45') || address.includes('denmark') || address.includes('danmark')) return 'DK';
  if (phone.startsWith('+44') || address.includes('united kingdom') || address.includes(' uk')) return 'UK';
  if (phone.startsWith('+34') || address.includes('spain') || address.includes('espana') || address.includes('espa')) return 'ES';
  return 'SE';
}

function addReason(summary: ReasonSummary, reason: string) {
  summary[reason] = (summary[reason] || 0) + 1;
}

function labelReason(reason: string) {
  const labels: Record<string, string> = {
    no_phone_leads: 'no saved leads with phone numbers',
    wrong_product: 'wrong product',
    low_score: 'below minimum score',
    wrong_country: 'outside selected countries',
    opt_out: 'opted out',
    do_not_contact: 'do not contact',
    do_not_contact_state: 'do not contact state',
    currently_calling: 'already in a call',
    already_contacted: 'already contacted',
    excluded_status: 'final status',
    bad_phone: 'invalid phone',
    attempt_limit: 'call attempt limit',
  };
  return labels[reason] || reason.replace(/_/g, ' ');
}

function summarizeReasons(summary: ReasonSummary) {
  return Object.entries(summary)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([reason, count]) => `${labelReason(reason)} (${count})`);
}

function callRejectionReasons(lead: any, input: { product: string; minScore: number; countries: string[] }) {
  const reasons: string[] = [];
  if (input.product !== 'all' && lead.product !== input.product) reasons.push('wrong_product');
  if (input.minScore > 0 && (lead.potential_score || 0) < input.minScore) reasons.push('low_score');
  if (!input.countries.includes(detectCountry(lead))) reasons.push('wrong_country');
  if (lead.outreach_opt_out) reasons.push('opt_out');
  if (lead.do_not_contact === true) reasons.push('do_not_contact');
  if (lead.outreach_state === 'do_not_contact') reasons.push('do_not_contact_state');
  if (lead.call_status === 'Calling') reasons.push('currently_calling');
  if (lead.last_contacted_at || lead.outreach_state === 'called') reasons.push('already_contacted');
  if (EXCLUDED_STATUSES.includes(String(lead.status || ''))) reasons.push('excluded_status');
  if (!normalizeE164(lead.phone_e164 || lead.phone)) reasons.push('bad_phone');
  if (Number(lead.call_attempts || 0) >= 2) reasons.push('attempt_limit');
  return reasons;
}

async function getCallEligibilityDiagnostics(
  supabase: any,
  input: { product: string; minScore: number; countries: string[] },
) {
  const { data: leads } = await supabase
    .from('leads')
    .select('id, name, phone, phone_e164, country, address, product, status, call_attempts, call_status, outreach_opt_out, do_not_contact, potential_score, last_contacted_at, outreach_state')
    .or('phone.not.is.null,phone_e164.not.is.null')
    .limit(2000);

  const summary: ReasonSummary = {};
  let eligible = 0;
  for (const lead of leads || []) {
    const reasons = callRejectionReasons(lead, input);
    if (reasons.length === 0) eligible += 1;
    reasons.forEach((reason) => addReason(summary, reason));
  }

  if (!leads?.length) addReason(summary, 'no_phone_leads');
  const topReasons = summarizeReasons(summary);
  return {
    checked: leads?.length || 0,
    eligible,
    rejectionSummary: summary,
    topReasons,
    message: topReasons.length
      ? `No eligible AI-call leads. Top blockers: ${topReasons.join(', ')}.`
      : 'No eligible AI-call leads found.',
  };
}

async function recordNotification(supabase: any, input: {
  type?: string;
  title: string;
  message: string;
  payload?: Record<string, unknown>;
}) {
  await supabase.from('app_notifications').insert({
    type: input.type || 'ai_call_batch_done',
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

  const body = await req.json().catch(() => ({}));
  const force = body?.force === true;
  const preview = body?.preview === true;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const keys = [
      'ai_calls_enabled',
      'ai_calls_daily',
      'ai_calls_per_run',
      'ai_calls_start_hour',
      'ai_calls_end_hour',
      'ai_calls_days',
      'ai_calls_countries',
      'ai_calls_min_score',
      'ai_calls_product',
      'ai_calls_timezone',
      'ai_calls_active_guard_minutes',
    ];
    const { data: rows, error: settingsError } = await supabase.from('settings').select('key, value').in('key', keys);
    if (settingsError) throw settingsError;
    const settings: Settings = {};
    for (const row of rows || []) settings[row.key] = row.value;

    const enabled = settings.ai_calls_enabled === 'true';
    const dailyCap = intSetting(settings, 'ai_calls_daily', DEFAULT_DAILY_CAP, 1, 100);
    const perRun = intSetting(settings, 'ai_calls_per_run', DEFAULT_PER_RUN, 1, 50);
    const startHour = intSetting(settings, 'ai_calls_start_hour', DEFAULT_START_HOUR, 0, 23);
    const endHour = intSetting(settings, 'ai_calls_end_hour', DEFAULT_END_HOUR, 1, 24);
    const minScore = intSetting(settings, 'ai_calls_min_score', 0, 0, 100);
    const activeGuardMinutes = intSetting(settings, 'ai_calls_active_guard_minutes', DEFAULT_ACTIVE_GUARD_MINUTES, 5, 45);
    const countries = csvSetting(settings.ai_calls_countries, ['SE']);
    const days = csvSetting(settings.ai_calls_days, ['1', '2', '3', '4', '5']).map(Number);
    const product = settings.ai_calls_product || 'leadmap';
    const timeZone = settings.ai_calls_timezone || 'Europe/Stockholm';
    const nowLocal = localParts(timeZone);

    if (!enabled && !force && !preview) return json({ skipped: true, reason: 'disabled' });
    if (!force && !preview && !days.includes(nowLocal.day)) return json({ skipped: true, reason: 'day_blocked', day: nowLocal.day });
    if (!force && !preview && (nowLocal.hour < startHour || nowLocal.hour >= endHour)) {
      return json({ skipped: true, reason: 'outside_call_window', hour: nowLocal.hour, startHour, endHour });
    }

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { count: callsToday } = await supabase
      .from('activities')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'ai_call_started')
      .gte('created_at', startOfDay.toISOString());

    const remainingToday = Math.max(0, dailyCap - (callsToday || 0));
    if (!preview && remainingToday <= 0) {
      await recordNotification(supabase, {
        type: 'ai_call_batch_done',
        title: 'AI call automation skipped',
        message: `Daily AI call cap reached (${callsToday || 0}/${dailyCap}).`,
        payload: { automation: 'ai_calls', reason: 'daily_cap_reached', callsToday: callsToday || 0, dailyCap },
      });
      return json({ skipped: true, reason: 'daily_cap_reached', callsToday: callsToday || 0, dailyCap });
    }

    if (!preview && !force) {
      const activeSince = new Date(Date.now() - activeGuardMinutes * 60 * 1000).toISOString();
      const { data: activeCall } = await supabase
        .from('leads')
        .select('id, name, retell_call_id')
        .eq('call_status', 'Calling')
        .gte('last_called_at', activeSince)
        .order('last_called_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (activeCall) {
        await recordNotification(supabase, {
          type: 'ai_call_batch_done',
          title: 'AI call automation waiting',
          message: `One-by-one guard: ${activeCall.name || 'a lead'} is still marked Calling.`,
          payload: {
            automation: 'ai_calls',
            reason: 'active_call_in_progress',
            activeLeadId: activeCall.id,
            retell_call_id: activeCall.retell_call_id,
            dailyCap,
            callsToday: callsToday || 0,
            remainingToday,
            activeGuardMinutes,
          },
        });
        return json({
          skipped: true,
          reason: 'active_call_in_progress',
          activeLeadId: activeCall.id,
          dailyCap,
          callsToday: callsToday || 0,
          remainingToday,
          activeGuardMinutes,
        });
      }
    }

    let query = supabase
      .from('leads')
      .select('id, name, phone, phone_e164, country, address, product, status, call_attempts, call_status, outreach_opt_out, do_not_contact, potential_score, lead_tier, last_contacted_at, outreach_state')
      .or('phone.not.is.null,phone_e164.not.is.null')
      .or('outreach_opt_out.is.null,outreach_opt_out.eq.false')
      .or('call_attempts.is.null,call_attempts.lt.2')
      .order('potential_score', { ascending: false, nullsFirst: false })
      .limit(Math.max(50, perRun * 20));
    if (product !== 'all') query = query.eq('product', product);
    if (minScore > 0) query = query.gte('potential_score', minScore);

    const { data: rawCandidates, error: leadsError } = await query;
    if (leadsError) throw leadsError;

    const candidates = (rawCandidates || []).filter((lead: any) => callRejectionReasons(lead, { product, minScore, countries }).length === 0);
    const diagnostics = candidates.length === 0
      ? await getCallEligibilityDiagnostics(supabase, { product, minScore, countries })
      : null;

    if (preview) {
      return json({
        success: true,
        preview: true,
        callsToday: callsToday || 0,
        dailyCap,
        remainingToday,
        eligible: candidates.length,
        diagnostics,
        leads: candidates.slice(0, 15).map((lead: any) => ({
          id: lead.id,
          name: lead.name,
          phone: normalizeE164(lead.phone_e164 || lead.phone),
          score: lead.potential_score,
          tier: lead.lead_tier,
          country: detectCountry(lead),
        })),
      });
    }

    const limit = Math.min(perRun, remainingToday, candidates.length);
    let started = 0;
    let skipped = 0;
    let failed = 0;
    const details: any[] = [];

    for (const lead of candidates.slice(0, limit)) {
      const e164 = normalizeE164(lead.phone_e164 || lead.phone);
      if (!e164) {
        skipped++;
        details.push({ id: lead.id, status: 'skipped', reason: 'phone_not_e164' });
        continue;
      }

      if (lead.phone_e164 !== e164) {
        await supabase.from('leads').update({ phone_e164: e164 }).eq('id', lead.id);
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/retell-start-call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.success) {
        started++;
        details.push({ id: lead.id, name: lead.name, status: 'started', retell_call_id: payload.retell_call_id });
      } else if (payload?.error === 'outreach_locked' || payload?.error === 'call_attempt_limit' || payload?.error === 'duplicate_phone_contacted') {
        skipped++;
        details.push({ id: lead.id, name: lead.name, status: 'skipped', reason: payload.error });
      } else {
        failed++;
        details.push({ id: lead.id, name: lead.name, status: 'failed', error: payload?.error || response.statusText });
      }
    }

    await recordNotification(supabase, {
      type: 'ai_call_batch_done',
      title: force ? 'Manual AI call batch finished' : 'Scheduled AI call batch finished',
      message: diagnostics?.message || `${started} started, ${skipped} skipped, ${failed} failed.`,
      payload: {
        automation: 'ai_calls',
        reason: candidates.length === 0 ? 'no_candidates' : undefined,
        started,
        skipped,
        failed,
        eligible: candidates.length,
        checked: diagnostics?.checked,
        rejectionSummary: diagnostics?.rejectionSummary,
        topReasons: diagnostics?.topReasons,
        dailyCap,
        callsTodayBeforeRun: callsToday || 0,
        remainingToday: Math.max(0, remainingToday - started),
        activeGuardMinutes,
        forced: force,
        scheduled: !force,
      },
    });

    return json({
      success: true,
      started,
      skipped,
      failed,
      callsTodayBeforeRun: callsToday || 0,
      dailyCap,
      remainingToday: Math.max(0, remainingToday - started),
      eligible: candidates.length,
      diagnostics,
      activeGuardMinutes,
      details: details.slice(0, 20),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('auto-start-ai-calls-daily error:', error);
    return json({ error: error instanceof Error ? error.message : 'unknown' }, 500);
  }
});
