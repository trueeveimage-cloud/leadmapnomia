import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { requireUserJwt } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_mail/gmail/v1';
const DEFAULT_DAILY_CAP = 200;

const BodySchema = z.object({
  leadId: z.string().uuid().optional(),
  to: z.string().email(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(20000),
  manualUnlock: z.boolean().optional(),
});

function b64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildRaw(to: string, subject: string, body: string, from?: string): string {
  const encSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
  const headers = [
    ...(from ? [`From: ${from}`] : []),
    `To: ${to}`,
    `Subject: ${encSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ];
  const msg = [...headers, '', body].join('\r\n');
  return b64url(msg);
}

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function notify(supabase: any, input: { type: string; title: string; message: string; payload?: Record<string, unknown> }) {
  await supabase.from('app_notifications').insert({
    type: input.type,
    title: input.title,
    message: input.message,
    payload: input.payload || {},
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authFail = await requireUserJwt(req, corsHeaders);
  if (authFail) return authFail;



  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const GMAIL_KEY = Deno.env.get('GOOGLE_MAIL_API_KEY');
  if (!LOVABLE_API_KEY) return jsonResp({ error: 'LOVABLE_API_KEY missing' }, 500);
  if (!GMAIL_KEY) return jsonResp({ error: 'Gmail is not connected' }, 500);

  let parsed;
  try { parsed = BodySchema.safeParse(await req.json()); }
  catch { return jsonResp({ error: 'Invalid JSON' }, 400); }
  if (!parsed.success) return jsonResp({ error: parsed.error.flatten().fieldErrors }, 400);
  const { leadId, to, subject, body, manualUnlock } = parsed.data;

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let leadRecord: any = null;

  // 1) Opt-out check
  if (leadId) {
    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle();
    leadRecord = lead;
    if (lead?.outreach_opt_out || lead?.do_not_contact || lead?.outreach_state === 'do_not_contact') {
      await notify(supabase, {
        type: 'outreach_skipped',
        title: 'Gmail skipped: do not contact',
        message: `${lead?.name || to} is blocked from outreach.`,
        payload: { leadId, to, reason: 'opt_out' },
      });
      return jsonResp({ skipped: true, reason: 'opt_out' });
    }
  }

  // 2) Dedupe: already emailed this lead successfully
  if (leadId) {
    const { data: existing } = await supabase
      .from('message_logs')
      .select('id')
      .eq('lead_id', leadId).eq('channel', 'email').eq('direction', 'outbound')
      .in('status', ['sent', 'queued']).limit(1);
    if (existing && existing.length > 0) {
      await notify(supabase, {
        type: 'outreach_skipped',
        title: 'Gmail skipped: lead already emailed',
        message: `${leadRecord?.name || to} was already emailed.`,
        payload: { leadId, to, reason: 'already_emailed' },
      });
      return jsonResp({ skipped: true, reason: 'already_emailed' });
    }
  }

  // 2b) Dedupe across duplicate lead rows by recipient email.
  const normalizedTo = to.trim().toLowerCase();
  const { data: matchingLeads } = await supabase
    .from('leads')
    .select('id')
    .ilike('email', normalizedTo);
  const matchingLeadIds = (matchingLeads || []).map((l: any) => l.id);
  if (matchingLeadIds.length > 0) {
    const { data: existingByEmail } = await supabase
      .from('message_logs')
      .select('id, lead_id')
      .eq('channel', 'email')
      .eq('direction', 'outbound')
      .in('status', ['sent', 'queued'])
      .in('lead_id', matchingLeadIds)
      .limit(1);
    if (existingByEmail && existingByEmail.length > 0) {
      await notify(supabase, {
        type: 'outreach_skipped',
        title: 'Gmail skipped: email already contacted',
        message: `${to} was already contacted on another lead row.`,
        payload: { leadId: leadId || '', to, reason: 'email_already_contacted', matchedLeadId: existingByEmail[0].lead_id },
      });
      return jsonResp({ skipped: true, reason: 'email_already_contacted' });
    }
  }

  if (leadId) {
    const { data: lockResult, error: lockError } = await supabase.rpc('acquire_outreach_lock', {
      p_lead_id: leadId,
      p_method: 'email',
      p_manual_unlock: !!manualUnlock,
    });
    if (lockError) return jsonResp({ error: 'outreach_lock_failed', details: lockError.message }, 500);
    if (!lockResult?.allowed) {
      await notify(supabase, {
        type: 'outreach_skipped',
        title: 'Gmail skipped: outreach locked',
        message: `${leadRecord?.name || to} was blocked by the outreach lock.`,
        payload: { leadId, to, reason: lockResult?.reason || 'outreach_locked' },
      });
      return jsonResp({ skipped: true, reason: lockResult?.reason || 'outreach_locked', lock: lockResult }, 409);
    }
  }

  // 3) Daily cap check (UTC day)
  const { data: capSetting } = await supabase.from('settings').select('value').eq('key', 'gmail_daily_cap').maybeSingle();
  const dailyCap = Math.max(0, parseInt(capSetting?.value || '') || DEFAULT_DAILY_CAP);
  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
  const { count: sentToday } = await supabase
    .from('message_logs').select('id', { count: 'exact', head: true })
    .eq('channel', 'email').eq('direction', 'outbound').eq('status', 'sent')
    .gte('created_at', startOfDay.toISOString());
  if ((sentToday ?? 0) >= dailyCap) {
    if (leadId) {
      await supabase.from('message_logs').insert({
        lead_id: leadId, channel: 'email', direction: 'outbound', provider: 'gmail',
        to_number: to, body: `${subject}\n\n${body}`, status: 'skipped',
        error_message: `daily_cap reached (${sentToday}/${dailyCap})`,
      } as any);
    }
    await notify(supabase, {
      type: 'outreach_skipped',
      title: 'Gmail skipped: daily cap reached',
      message: `Daily cap reached (${sentToday}/${dailyCap}).`,
      payload: { leadId: leadId || '', to, reason: 'daily_cap', sentToday: sentToday ?? 0, dailyCap },
    });
    return jsonResp({ skipped: true, reason: 'daily_cap', sentToday, dailyCap });
  }

  try {
    // Always use the connected Gmail account as the From address.
    // We resolve it via the Gmail profile endpoint so we never fall back to a stale
    // "gmail_from_address" setting (which is what caused emails to go out as the wrong sender).
    let fromAddress: string | undefined;
    try {
      const profResp = await fetch(`${GATEWAY_URL}/users/me/profile`, {
        headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'X-Connection-Api-Key': GMAIL_KEY },
      });
      const prof = await profResp.json().catch(() => ({}));
      if (profResp.ok && prof?.emailAddress) fromAddress = String(prof.emailAddress);
    } catch { /* fall through — Gmail will use connected account by default */ }
    const raw = buildRaw(to, subject, body, fromAddress);
    const resp = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': GMAIL_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      if (leadId) {
        await supabase.from('message_logs').insert({
          lead_id: leadId, channel: 'email', direction: 'outbound', provider: 'gmail',
          to_number: to, body: `${subject}\n\n${body}`, status: 'failed',
          error_message: JSON.stringify(data).slice(0, 500),
        } as any);
      }
      await notify(supabase, {
        type: 'system_error',
        title: 'Gmail send failed',
        message: `${to}: Gmail API returned ${resp.status}.`,
        payload: { leadId: leadId || '', to, status: resp.status, error: JSON.stringify(data).slice(0, 300) },
      });
      return jsonResp({ error: 'gmail_send_failed', status: resp.status, details: data }, 502);
    }

    if (leadId) {
      await supabase.from('message_logs').insert({
        lead_id: leadId, channel: 'email', direction: 'outbound', provider: 'gmail',
        to_number: to, body: `${subject}\n\n${body}`, status: 'sent',
        provider_message_sid: data.id || null,
      } as any);
      await supabase.from('leads').update({
        last_outbound_at: new Date().toISOString(),
        last_contacted_at: new Date().toISOString(),
        last_contact_method: 'Email',
        outreach_state: 'email_sent',
        outreach_count: (leadRecord?.outreach_count || 0) + 1,
        outreach_history: [
          ...((Array.isArray(leadRecord?.outreach_history) ? leadRecord.outreach_history : [])),
          { method: 'Email', status: 'sent', to, subject, at: new Date().toISOString() },
        ],
        outreach_stage: 'email_sent',
        last_message_direction: 'outbound',
        last_message_status: 'sent',
        last_message_preview: subject.slice(0, 140),
      } as any).eq('id', leadId);
      await supabase.from('activities').insert({
        lead_id: leadId, type: 'email_sent', payload: { to, subject, gmail_id: data.id },
      } as any);
    }

    return jsonResp({ success: true, id: data.id, sentToday: (sentToday ?? 0) + 1, dailyCap });
  } catch (e: any) {
    return jsonResp({ error: e?.message || 'unknown' }, 500);
  }
});
