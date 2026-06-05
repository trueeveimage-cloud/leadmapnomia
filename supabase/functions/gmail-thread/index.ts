// Fetches Gmail conversation (sent + received) with a given email address.
import { z } from 'npm:zod@3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_mail/gmail/v1';

const BodySchema = z.object({
  email: z.string().min(1),
  max: z.number().int().min(1).max(50).optional(),
  pageToken: z.string().optional(),
});

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function b64urlDecode(s: string): string {
  try {
    const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
    const normalized = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const bin = atob(normalized);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch { return ''; }
}

function extractBody(payload: any): string {
  if (!payload) return '';
  if (payload.body?.data) return b64urlDecode(payload.body.data);
  if (Array.isArray(payload.parts)) {
    // Prefer text/plain
    const plain = payload.parts.find((p: any) => p.mimeType === 'text/plain');
    if (plain?.body?.data) return b64urlDecode(plain.body.data);
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }
  return '';
}

function header(headers: any[], name: string): string {
  return headers?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const { requireUserJwt } = await import('../_shared/auth.ts');
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
  const { email, max = 10, pageToken } = parsed.data;

  const q = encodeURIComponent(email.includes('@') ? `(to:${email} OR from:${email})` : email);
  const headers = {
    'Authorization': `Bearer ${LOVABLE_API_KEY}`,
    'X-Connection-Api-Key': GMAIL_KEY,
  };

  try {
    const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const listResp = await fetch(`${GATEWAY_URL}/users/me/messages?maxResults=${max}&q=${q}${pageParam}`, { headers });
    const listData = await listResp.json();
    if (!listResp.ok) return jsonResp({ error: 'gmail_list_failed', details: listData }, 502);

    const ids: string[] = (listData.messages || []).map((m: any) => m.id);
    const messages = await Promise.all(
      ids.map(async (id) => {
        const r = await fetch(`${GATEWAY_URL}/users/me/messages/${id}?format=full`, { headers });
        if (!r.ok) return null;
        const m = await r.json();
        const h = m.payload?.headers || [];
        const body = extractBody(m.payload).trim().slice(0, 8000);
        return {
          id: m.id,
          threadId: m.threadId,
          from: header(h, 'From'),
          to: header(h, 'To'),
          subject: header(h, 'Subject'),
          date: header(h, 'Date'),
          internalDate: m.internalDate ? Number(m.internalDate) : 0,
          snippet: m.snippet || '',
          body,
          labels: m.labelIds || [],
        };
      })
    );

    const filtered = messages.filter(Boolean).sort((a: any, b: any) => b.internalDate - a.internalDate);
    return jsonResp({ messages: filtered, total: filtered.length, nextPageToken: listData.nextPageToken || null });
  } catch (e: any) {
    return jsonResp({ error: e?.message || 'unknown' }, 500);
  }
});
