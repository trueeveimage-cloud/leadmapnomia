import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_mail/gmail/v1';

const BodySchema = z.object({
  leadId: z.string().uuid().optional(),
  to: z.string().email(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(20000),
});

function b64url(s: string): string {
  // UTF-8 safe base64url
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildRaw(to: string, subject: string, body: string): string {
  // RFC 2822, plain text. Encode subject as UTF-8 (RFC 2047) for safety.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const GMAIL_KEY = Deno.env.get('GOOGLE_MAIL_API_KEY');
  if (!LOVABLE_API_KEY) return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY missing' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (!GMAIL_KEY) return new Response(JSON.stringify({ error: 'Gmail is not connected' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  let parsed;
  try {
    parsed = BodySchema.safeParse(await req.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const { leadId, to, subject, body } = parsed.data;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Dedupe: if a successful outbound email exists for this lead, skip.
  if (leadId) {
    const { data: existing } = await supabase
      .from('message_logs')
      .select('id')
      .eq('lead_id', leadId)
      .eq('channel', 'email')
      .eq('direction', 'outbound')
      .in('status', ['sent', 'queued'])
      .limit(1);
    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ skipped: true, reason: 'already_emailed' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
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
      return new Response(JSON.stringify({ error: 'gmail_send_failed', status: resp.status, details: data }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

    return new Response(JSON.stringify({ success: true, id: data.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'unknown' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
