import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retell-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function textValue(value: unknown) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = textValue(value).trim();
    if (text) return text;
  }
  return '';
}

function transcriptToText(value: unknown) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((turn) => {
      const item = record(turn);
      return firstString(item.content, item.text, item.words, item.role);
    }).filter(Boolean).join('\n');
  }
  return textValue(value);
}

function hasAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value));
}

function statusFromEvent(event: string, call: JsonRecord, payload: JsonRecord) {
  const analysis = record(call.call_analysis || payload.call_analysis);
  const custom = record(analysis.custom_analysis_data);
  const transcript = transcriptToText(call.transcript || payload.transcript || call.transcript_with_tool_calls || payload.transcript_with_tool_calls);
  const primary = firstString(
    custom.outcome,
    custom.call_outcome,
    custom.lead_outcome,
    custom.status,
    custom.interest_level,
    analysis.call_successful,
  ).toLowerCase();
  const fallback = `${firstString(call.call_status, payload.call_status)} ${firstString(call.disconnection_reason, payload.disconnection_reason)} ${transcript}`.toLowerCase();
  const text = `${primary} ${fallback}`;

  if (event === 'call_started' || hasAny(text, ['ongoing', 'registered'])) {
    return { call_status: 'Calling', outreach_state: 'called' };
  }
  if (hasAny(text, ['do not contact', 'do-not-contact', 'opt out', 'opt-out', 'stop calling'])) {
    return {
      call_status: 'Do not contact',
      status: 'not_interested',
      outreach_state: 'do_not_contact',
      do_not_contact: true,
      outreach_opt_out: true,
      next_step: 'Do not contact again',
    };
  }
  if (hasAny(text, ['meeting requested', 'book meeting', 'schedule meeting', 'meeting'])) {
    return { call_status: 'Meeting requested', status: 'interested', outreach_state: 'called', next_step: 'Schedule meeting and follow up manually' };
  }
  if (hasAny(text, ['demo requested', 'wants demo', 'send demo', 'demo'])) {
    return { call_status: 'Demo requested', status: 'interested', outreach_state: 'called', next_step: 'Send demo and follow up manually' };
  }
  if (hasAny(text, ['not interested', 'declined', 'no interest'])) {
    return { call_status: 'Not interested', status: 'not_interested', outreach_state: 'called', next_step: 'No follow-up needed' };
  }
  if (hasAny(text, ['interested', 'positive', 'successful'])) {
    return { call_status: 'Interested', status: 'interested', outreach_state: 'called', next_step: 'Follow up manually' };
  }
  if (hasAny(text, ['no answer', 'voicemail', 'did not connect', 'not_connected', 'dial_no_answer', 'dial_busy', 'dial_failed', 'busy'])) {
    return { call_status: 'No answer', outreach_state: 'follow_up_needed', next_step: 'Try one more time later' };
  }
  if (event === 'call_failed' || hasAny(text, ['error', 'failed'])) {
    return { call_status: 'Error', outreach_state: 'follow_up_needed', next_step: 'Check Retell error and retry manually if appropriate' };
  }
  if (event === 'call_ended' || event === 'call_analyzed') {
    return { call_status: 'Interested', outreach_state: 'called', next_step: 'Review transcript and decide next action' };
  }
  return {};
}

async function verifyRetellSignature(rawBody: string, secret: string, signature: string | null) {
  const match = signature?.match(/v=(\d+),d=([a-fA-F0-9]+)/);
  if (!match) return false;

  const timestamp = Number(match[1]);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody + match[1]));
  const expected = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (expected.length !== match[2].length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ match[2].toLowerCase().charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const rawBody = await req.text();
  const webhookSecret = Deno.env.get('RETELL_WEBHOOK_SECRET') || Deno.env.get('RETELL_API_KEY');
  if (!webhookSecret) {
    return json({ error: 'webhook_secret_not_configured' }, 500);
  }
  const valid = await verifyRetellSignature(rawBody, webhookSecret, req.headers.get('x-retell-signature'));
  if (!valid) return json({ error: 'invalid_signature' }, 401);

  let payload: JsonRecord | null = null;
  try {
    payload = record(JSON.parse(rawBody || 'null'));
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!payload) return json({ error: 'invalid_json' }, 400);

  const event = firstString(payload.event, payload.type, 'retell_event');
  const payloadCall = record(payload.call);
  const call = Object.keys(payloadCall).length ? payloadCall : payload;
  const callMetadata = record(call.metadata);
  const payloadMetadata = record(payload.metadata);
  const callId = firstString(call.call_id, payload.call_id);
  const leadId = firstString(callMetadata.lead_id, payloadMetadata.lead_id);
  if (!callId && !leadId) return json({ success: true, skipped: true, reason: 'missing_call_or_lead_id' });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let query = supabase.from('leads').select('*').limit(1);
  query = leadId ? query.eq('id', leadId) : query.eq('retell_call_id', callId);
  const { data: leads, error } = await query;
  if (error) return json({ error: error.message }, 500);
  const lead = leads?.[0] as JsonRecord | undefined;
  if (!lead) return json({ skipped: true, reason: 'lead_not_found' });

  const eventId = firstString(payload.event_id, payload.id, `${event}:${callId || leadId}`);
  const history = Array.isArray(lead.outreach_history) ? lead.outreach_history : [];
  if (history.some((h) => record(h).event_id === eventId)) return json({ success: true, idempotent: true });

  const statusUpdate = statusFromEvent(event, call, payload);
  const analysis = record(call.call_analysis || payload.call_analysis);
  const custom = record(analysis.custom_analysis_data);
  const dynamicVariables = record(call.retell_llm_dynamic_variables);
  const transcript = transcriptToText(call.transcript || payload.transcript || call.transcript_with_tool_calls || payload.transcript_with_tool_calls);
  const summary = firstString(analysis.call_summary, analysis.summary, custom.summary, payload.summary);
  const outcome = firstString(custom.outcome, custom.call_outcome, custom.lead_outcome, analysis.call_successful, call.call_status, payload.call_status, event);
  const demoDeliveryMethod = firstString(custom.demo_delivery_method, custom.delivery_method, dynamicVariables.demo_delivery_method);
  const demoContactValue = firstString(custom.demo_contact_value, custom.contact_value, custom.email, custom.phone);

  const outreach_history = [
    ...history,
    { event_id: eventId, event, method: 'AI Call', status: outcome, retell_call_id: callId, at: new Date().toISOString() },
  ];

  const updates: Record<string, unknown> = {
    ...statusUpdate,
    retell_call_id: callId || lead.retell_call_id,
    retell_agent_id: call.agent_id || lead.retell_agent_id,
    call_transcript: transcript || lead.call_transcript,
    call_summary: summary || lead.call_summary,
    call_outcome: outcome || lead.call_outcome,
    demo_delivery_method: demoDeliveryMethod || lead.demo_delivery_method,
    demo_contact_value: demoContactValue || lead.demo_contact_value,
    last_called_at: lead.last_called_at || new Date().toISOString(),
    last_contacted_at: lead.last_contacted_at || new Date().toISOString(),
    last_contact_method: 'AI Call',
    outreach_history,
  };

  const { error: updateError } = await supabase.from('leads').update(updates).eq('id', String(lead.id));
  if (updateError) return json({ error: 'lead_update_failed', details: updateError.message }, 500);

  await supabase.from('activities').insert({
    lead_id: String(lead.id),
    type: 'retell_webhook',
    payload: { event_id: eventId, event, retell_call_id: callId, outcome },
  });

  if (['call_ended', 'call_analyzed', 'call_failed'].includes(event)) {
    await supabase.from('app_notifications').insert({
      type: 'ai_call_done',
      title: event === 'call_failed' ? 'AI call failed' : 'AI call finished',
      message: `${firstString(lead.name, 'Lead')} result: ${firstString(statusUpdate.call_status, outcome, 'Unknown')}.`,
      payload: {
        leadId: String(lead.id),
        leadName: firstString(lead.name),
        retell_call_id: callId,
        event,
        outcome,
      },
    });
  }

  return json({ success: true });
});
