import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

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
});

function b64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildRaw(to: string, subject: string, body: string): string {
  const encSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
  const msg = [
    `To: ${to}`,
    `Subject: ${encSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
  ].join('\r\n');
  return b64url(msg);
}

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const GMAIL_KEY = Deno.env.get('GOOGLE_MAIL_API_KEY');
  if (!LOVABLE_API_KEY) return jsonResp({ error: 'LOVABLE_API_KEY missing' }, 500);
  if (!GMAIL_KEY) return jsonResp({ error: 'Gmail is not connected' }, 500);

  let parsed;
  try { parsed = BodySchema.safeParse(await req.json()); }
  catch { return jsonResp({ error: 'Invalid JSON' }, 400); }
  if (!parsed.success) return jsonResp({ error: parsed.error.flatten().fieldErrors }, 400);
  const { leadId, to, subject, body } = parsed.data;

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // 1) Opt-out check
  if (leadId) {
    const { data: lead } = await supabase.from('leads').select('outreach_opt_out, email').eq('id', leadId).maybeSingle();
    if (lead?.outreach_opt_out) {
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
      return jsonResp({ skipped: true, reason: 'already_emailed' });
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
    return jsonResp({ skipped: true, reason: 'daily_cap', sentToday, dailyCap });
  }

  try {
    const raw = buildRaw(to, subject, body);
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
