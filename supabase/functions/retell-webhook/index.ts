import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retell-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function statusFromEvent(payload: any) {
  const text = `${payload.call_status || ''} ${payload.call_analysis?.call_successful || ''} ${payload.call_analysis?.custom_analysis_data?.outcome || ''} ${payload.disconnection_reason || ''}`.toLowerCase();
  if (text.includes('do not contact')) return { call_status: 'Do not contact', outreach_state: 'do_not_contact', do_not_contact: true, outreach_opt_out: true };
  if (text.includes('meeting')) return { call_status: 'Meeting requested' };
  if (text.includes('demo')) return { call_status: 'Demo requested' };
  if (text.includes('not interested')) return { call_status: 'Not interested' };
  if (text.includes('interested')) return { call_status: 'Interested' };
  if (text.includes('no answer') || text.includes('voicemail')) return { call_status: 'No answer' };
  if (text.includes('error') || text.includes('failed')) return { call_status: 'Error' };
  return {};
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const RETELL_WEBHOOK_SECRET = Deno.env.get('RETELL_WEBHOOK_SECRET');
  if (RETELL_WEBHOOK_SECRET) {
    const provided = req.headers.get('x-retell-signature') || req.headers.get('authorization') || '';
    if (!provided.includes(RETELL_WEBHOOK_SECRET)) return json({ error: 'invalid_signature' }, 401);
  }

  const payload = await req.json().catch(() => null);
  if (!payload) return json({ error: 'invalid_json' }, 400);

  const callId = payload.call_id || payload.call?.call_id;
  const leadId = payload.metadata?.lead_id || payload.call?.metadata?.lead_id;
  if (!callId && !leadId) return json({ error: 'missing_call_or_lead_id' }, 400);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let query = supabase.from('leads').select('*').limit(1);
  query = leadId ? query.eq('id', leadId) : query.eq('retell_call_id', callId);
  const { data: leads, error } = await query;
  if (error) return json({ error: error.message }, 500);
  const lead = leads?.[0];
  if (!lead) return json({ skipped: true, reason: 'lead_not_found' });

  const eventId = payload.event_id || `${payload.event || 'retell'}:${callId}:${payload.call_status || payload.call?.call_status || ''}`;
  const history = Array.isArray(lead.outreach_history) ? lead.outreach_history : [];
  if (history.some((h: any) => h.event_id === eventId)) return json({ success: true, idempotent: true });

  const statusUpdate = statusFromEvent(payload);
  const transcript = payload.transcript || payload.call?.transcript || payload.transcript_with_tool_calls;
  const summary = payload.call_analysis?.call_summary || payload.summary;
  const outcome = payload.call_analysis?.custom_analysis_data?.outcome || payload.call_status || payload.event;

  const outreach_history = [
    ...history,
    { event_id: eventId, method: 'AI Call', status: outcome, retell_call_id: callId, at: new Date().toISOString() },
  ];

  await supabase.from('leads').update({
    ...statusUpdate,
    retell_call_id: callId || lead.retell_call_id,
    call_transcript: transcript || lead.call_transcript,
    call_summary: summary || lead.call_summary,
    call_outcome: outcome || lead.call_outcome,
    outreach_history,
  } as any).eq('id', lead.id);

  await supabase.from('activities').insert({
    lead_id: lead.id,
    type: 'retell_webhook',
    payload: { event_id: eventId, retell_call_id: callId, outcome },
  } as any);

  return json({ success: true });
});
