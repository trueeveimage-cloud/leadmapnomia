/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { requireCronServiceOrUserJwt } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_mail/gmail/v1';
const DEFAULT_DAILY_CAP = 100;
const UNSUBSCRIBE_MAILBOX = 'leadmapai.se@gmail.com';
const DEFAULT_FROM_NAME = 'Leadmap';

const BodySchema = z.object({
  leadId: z.string().uuid().optional(),
  partnerProspectId: z.string().uuid().optional(),
  to: z.string().email(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(20000),
  manualUnlock: z.boolean().optional(),
  skipCooldown: z.boolean().optional(),
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
    `List-Unsubscribe: <mailto:${UNSUBSCRIBE_MAILBOX}?subject=unsubscribe>`,
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

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function withComplianceFooter(body: string) {
  return body;
}

function mailProvider() {
  if (Deno.env.get('RESEND_API_KEY')) return 'resend';
  if (Deno.env.get('LOVABLE_API_KEY') && Deno.env.get('GOOGLE_MAIL_API_KEY')) return 'gmail';
  return 'missing';
}

function senderAddress() {
  return Deno.env.get('EMAIL_FROM') || Deno.env.get('RESEND_FROM_EMAIL') || Deno.env.get('GMAIL_FROM_ADDRESS') || '';
}

async function sendViaResend(input: { to: string; subject: string; body: string }) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = senderAddress();
  if (!apiKey) return { ok: false, status: 500, data: { error: 'RESEND_API_KEY missing' } };
  if (!from) return { ok: false, status: 500, data: { error: 'EMAIL_FROM missing' } };

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${DEFAULT_FROM_NAME} <${from}>`,
      to: [input.to],
      subject: input.subject,
      text: input.body,
      headers: {
        'List-Unsubscribe': `<mailto:${UNSUBSCRIBE_MAILBOX}?subject=unsubscribe>`,
      },
    }),
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data, id: data?.id };
}

async function sendViaLovableGmail(input: { to: string; subject: string; body: string }) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const GMAIL_KEY = Deno.env.get('GOOGLE_MAIL_API_KEY');
  if (!LOVABLE_API_KEY) return { ok: false, status: 500, data: { error: 'LOVABLE_API_KEY missing' } };
  if (!GMAIL_KEY) return { ok: false, status: 500, data: { error: 'Gmail is not connected' } };

  let fromAddress: string | undefined;
  try {
    const profResp = await fetch(`${GATEWAY_URL}/users/me/profile`, {
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'X-Connection-Api-Key': GMAIL_KEY },
    });
    const prof = await profResp.json().catch(() => ({}));
    if (profResp.ok && prof?.emailAddress) fromAddress = String(prof.emailAddress);
  } catch { /* Gmail will use connected account by default */ }

  const raw = buildRaw(input.to, input.subject, input.body, fromAddress);
  const resp = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': GMAIL_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data, id: data?.id };
}

function parseSuppressionList(value: string | null | undefined) {
  return String(value || '')
    .split(/[\n,;]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isSuppressed(to: string, entries: string[]) {
  const email = normalizeEmail(to);
  const domain = email.split('@')[1] || '';
  return entries.some((entry) => {
    const clean = entry.replace(/^@/, '');
    return clean === email || clean === domain || email.endsWith(`@${clean}`);
  });
}

function hasCallContact(lead: any) {
  return !!lead?.last_called_at
    || lead?.last_contact_method === 'AI Call'
    || lead?.outreach_state === 'called'
    || (Number(lead?.call_attempts || 0) > 0);
}

function settingNumber(value: string | null | undefined, fallback: number) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
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

  const authFail = await requireCronServiceOrUserJwt(req, corsHeaders);
  if (authFail) return authFail;



  let parsed;
  try { parsed = BodySchema.safeParse(await req.json()); }
  catch { return jsonResp({ error: 'Invalid JSON' }, 400); }
  if (!parsed.success) return jsonResp({ error: parsed.error.flatten().fieldErrors }, 400);
  const { leadId, partnerProspectId, subject, manualUnlock, skipCooldown } = parsed.data;
  const to = normalizeEmail(parsed.data.to);
  const body = withComplianceFooter(parsed.data.body);
  const emailProvider = mailProvider();
  if (emailProvider === 'missing') {
    return jsonResp({
      error: 'email_provider_missing',
      details: 'Set RESEND_API_KEY + EMAIL_FROM for owned Supabase sending, or LOVABLE_API_KEY + GOOGLE_MAIL_API_KEY for Lovable Gmail fallback.',
    }, 500);
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let leadRecord: any = null;
  let partnerRecord: any = null;

  const { data: suppressionSetting } = await supabase.from('settings').select('value').eq('key', 'email_suppression_list').maybeSingle();
  if (isSuppressed(to, parseSuppressionList(suppressionSetting?.value))) {
    await notify(supabase, {
      type: 'outreach_skipped',
      title: 'Gmail skipped: suppression list',
      message: `${to} is on the suppression list.`,
      payload: { leadId: leadId || '', partnerProspectId: partnerProspectId || '', to, reason: 'suppressed' },
    });
    return jsonResp({ skipped: true, reason: 'suppressed' });
  }

  // Partner outreach is intentionally separate from the normal customer lead automation.
  if (partnerProspectId) {
    const { data: partner } = await supabase.from('partner_prospects').select('*').eq('id', partnerProspectId).maybeSingle();
    partnerRecord = partner;
    if (!partner) return jsonResp({ error: 'partner_not_found' }, 404);
    if (partner.do_not_contact || partner.status === 'do_not_contact') {
      await notify(supabase, {
        type: 'outreach_skipped',
        title: 'Partner Gmail skipped: do not contact',
        message: `${partner.name || to} is blocked from partner outreach.`,
        payload: { partnerProspectId, to, reason: 'partner_opt_out' },
      });
      return jsonResp({ skipped: true, reason: 'partner_opt_out' });
    }

    const [{ data: existingByProspect }, { data: existingByEmail }] = await Promise.all([
      supabase
        .from('partner_outreach_logs')
        .select('id')
        .eq('partner_prospect_id', partnerProspectId)
        .eq('channel', 'email')
        .eq('direction', 'outbound')
        .in('status', ['sent', 'queued'])
        .limit(1),
      supabase
        .from('partner_outreach_logs')
        .select('id, partner_prospect_id')
        .eq('to_email', to)
        .eq('channel', 'email')
        .eq('direction', 'outbound')
        .in('status', ['sent', 'queued'])
        .limit(1),
    ]);
    if ((existingByProspect && existingByProspect.length > 0) || (existingByEmail && existingByEmail.length > 0)) {
      await notify(supabase, {
        type: 'outreach_skipped',
        title: 'Partner Gmail skipped: already contacted',
        message: `${partner.name || to} was already contacted in the partner pipeline.`,
        payload: { partnerProspectId, to, reason: 'partner_already_emailed' },
      });
      return jsonResp({ skipped: true, reason: 'partner_already_emailed' });
    }
  }

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
    if (hasCallContact(lead)) {
      await notify(supabase, {
        type: 'outreach_skipped',
        title: 'Gmail skipped: lead already called',
        message: `${lead?.name || to} is already in the AI-call lane.`,
        payload: { leadId, to, reason: 'already_called' },
      });
      return jsonResp({ skipped: true, reason: 'already_called' });
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
  const normalizedTo = to;
  const { data: matchingLeads } = await supabase
    .from('leads')
    .select('id, name, last_called_at, last_contact_method, outreach_state, call_attempts')
    .ilike('email', normalizedTo);
  const matchingLeadIds = (matchingLeads || []).map((l: any) => l.id);
  if (matchingLeadIds.length > 0) {
    const calledMatch = (matchingLeads || []).find((lead: any) => hasCallContact(lead));
    if (calledMatch) {
      await notify(supabase, {
        type: 'outreach_skipped',
        title: 'Gmail skipped: matching lead already called',
        message: `${to} matches a business already contacted by AI call.`,
        payload: { leadId: leadId || '', to, reason: 'matching_lead_already_called', matchedLeadId: calledMatch.id },
      });
      return jsonResp({ skipped: true, reason: 'matching_lead_already_called' });
    }

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

  // 3) Daily cap check (UTC day). Partner outreach has its own quieter cap and logs.
  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
  let dailyCap = DEFAULT_DAILY_CAP;
  let delaySeconds = 0;
  let sentToday = 0;
  if (partnerProspectId) {
    const [{ data: capSetting }, { data: delaySetting }] = await Promise.all([
      supabase.from('settings').select('value').eq('key', 'partner_gmail_daily_cap').maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'partner_gmail_delay_seconds').maybeSingle(),
    ]);
    dailyCap = Math.max(0, Math.min(100, parseInt(capSetting?.value || '') || 100));
    delaySeconds = Math.max(0, Math.min(3600, parseInt(delaySetting?.value || '') || 0));
    const { count } = await supabase
      .from('partner_outreach_logs').select('id', { count: 'exact', head: true })
      .eq('channel', 'email').eq('direction', 'outbound').eq('status', 'sent')
      .gte('created_at', startOfDay.toISOString());
    sentToday = count ?? 0;
  } else {
    const [{ data: capSetting }, { data: autoCapSetting }, { data: seCapSetting }, { data: ukCapSetting }, { data: esCapSetting }, { data: delaySetting }] = await Promise.all([
      supabase.from('settings').select('value').eq('key', 'gmail_daily_cap').maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'gmail_autosend_daily').maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'gmail_autosend_daily_se').maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'gmail_autosend_daily_uk').maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'gmail_autosend_daily_es').maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'gmail_autosend_delay_seconds').maybeSingle(),
    ]);
    const baseCap = settingNumber(capSetting?.value, DEFAULT_DAILY_CAP);
    const autoCap = settingNumber(autoCapSetting?.value, baseCap);
    const splitCap = [seCapSetting, ukCapSetting, esCapSetting]
      .reduce((sum, row) => sum + Math.max(0, settingNumber(row?.value, 0)), 0);
    dailyCap = Math.max(baseCap, autoCap, splitCap || 0);
    dailyCap = Math.max(0, Math.min(500, dailyCap));
    delaySeconds = Math.max(0, Math.min(900, parseInt(delaySetting?.value || '') || 0));
    const { count } = await supabase
      .from('message_logs').select('id', { count: 'exact', head: true })
      .eq('channel', 'email').eq('direction', 'outbound').eq('status', 'sent')
      .gte('created_at', startOfDay.toISOString());
    sentToday = count ?? 0;
  }
  if ((sentToday ?? 0) >= dailyCap) {
    if (partnerProspectId) {
      await supabase.from('partner_outreach_logs').insert({
        partner_prospect_id: partnerProspectId,
        channel: 'email',
        direction: 'outbound',
        provider: emailProvider,
        to_email: to,
        subject,
        body,
        status: 'skipped',
        error_message: `daily_cap reached (${sentToday}/${dailyCap})`,
      } as any);
    } else if (leadId) {
      await supabase.from('message_logs').insert({
        lead_id: leadId, channel: 'email', direction: 'outbound', provider: emailProvider,
        to_number: to, body: `${subject}\n\n${body}`, status: 'skipped',
        error_message: `daily_cap reached (${sentToday}/${dailyCap})`,
      } as any);
    }
    await notify(supabase, {
      type: 'outreach_skipped',
      title: 'Gmail skipped: daily cap reached',
      message: `Daily cap reached (${sentToday}/${dailyCap}).`,
      payload: { leadId: leadId || '', partnerProspectId: partnerProspectId || '', to, reason: 'daily_cap', sentToday: sentToday ?? 0, dailyCap },
    });
    return jsonResp({ skipped: true, reason: 'daily_cap', sentToday, dailyCap });
  }

  if (delaySeconds > 0 && !skipCooldown) {
    const lastSentQuery = partnerProspectId
      ? supabase.from('partner_outreach_logs').select('created_at').eq('channel', 'email').eq('direction', 'outbound').eq('status', 'sent')
      : supabase.from('message_logs').select('created_at').eq('channel', 'email').eq('direction', 'outbound').eq('status', 'sent');
    const { data: lastSent } = await lastSentQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();
    const lastAt = lastSent?.created_at ? new Date(lastSent.created_at).getTime() : 0;
    const elapsedSeconds = lastAt ? Math.floor((Date.now() - lastAt) / 1000) : delaySeconds;
    if (elapsedSeconds < delaySeconds) {
      return jsonResp({ skipped: true, reason: 'send_cooldown', waitSeconds: delaySeconds - elapsedSeconds });
    }
  }

  try {
    const result = emailProvider === 'resend'
      ? await sendViaResend({ to, subject, body })
      : await sendViaLovableGmail({ to, subject, body });
    const data = result.data || {};
    const messageId = result.id || data.id || data.message_id || null;
    if (!result.ok) {
      const errorText = JSON.stringify(data).slice(0, 500);
      if (partnerProspectId) {
        await supabase.from('partner_outreach_logs').insert({
          partner_prospect_id: partnerProspectId,
          channel: 'email',
          direction: 'outbound',
          provider: emailProvider,
          to_email: to,
          subject,
          body,
          status: 'failed',
          error_message: errorText,
        } as any);
      } else if (leadId) {
        await supabase.from('message_logs').insert({
          lead_id: leadId, channel: 'email', direction: 'outbound', provider: emailProvider,
          to_number: to, body: `${subject}\n\n${body}`, status: 'failed',
          error_message: errorText,
        } as any);
        if (/bounce|invalid|rejected|does not exist|550/i.test(errorText)) {
          await supabase.from('leads').update({
            do_not_contact: true,
            outreach_opt_out: true,
            outreach_state: 'do_not_contact',
          } as any).eq('id', leadId);
        }
      }
      await notify(supabase, {
        type: 'system_error',
        title: 'Email send failed',
        message: `${to}: ${emailProvider} returned ${result.status}.`,
        payload: { leadId: leadId || '', partnerProspectId: partnerProspectId || '', to, provider: emailProvider, status: result.status, error: JSON.stringify(data).slice(0, 300) },
      });
      return jsonResp({ error: 'email_send_failed', provider: emailProvider, status: result.status, details: data }, 502);
    }

    if (partnerProspectId) {
      await supabase.from('partner_outreach_logs').insert({
        partner_prospect_id: partnerProspectId,
        channel: 'email',
        direction: 'outbound',
        provider: emailProvider,
        to_email: to,
        subject,
        body,
        status: 'sent',
        provider_message_id: messageId,
      } as any);
      await supabase.from('partner_prospects').update({
        status: partnerRecord?.status === 'qualified' ? 'qualified' : 'contacted',
        last_contacted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any).eq('id', partnerProspectId);
    } else if (leadId) {
      await supabase.from('message_logs').insert({
        lead_id: leadId, channel: 'email', direction: 'outbound', provider: emailProvider,
        to_number: to, body: `${subject}\n\n${body}`, status: 'sent',
        provider_message_sid: messageId,
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
        lead_id: leadId, type: 'email_sent', payload: { to, subject, provider: emailProvider, message_id: messageId },
      } as any);
    }

    return jsonResp({ success: true, provider: emailProvider, id: messageId, sentToday: (sentToday ?? 0) + 1, dailyCap, partner: !!partnerProspectId });
  } catch (e: any) {
    return jsonResp({ error: e?.message || 'unknown' }, 500);
  }
});
