import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BodySchema = z.object({
  leadId: z.string().uuid(),
  manualUnlock: z.boolean().optional(),
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function appendHistory(lead: any, item: Record<string, unknown>) {
  const history = Array.isArray(lead.outreach_history) ? lead.outreach_history : [];
  return [...history, { ...item, at: new Date().toISOString() }];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'invalid_body', details: parsed.error.flatten().fieldErrors }, 400);

  const RETELL_API_KEY = Deno.env.get('RETELL_API_KEY');
  const RETELL_AGENT_ID = Deno.env.get('RETELL_AGENT_ID');
  const RETELL_FROM_NUMBER = Deno.env.get('RETELL_FROM_NUMBER');
  const LEADMAP_DEMO_LINK = Deno.env.get('LEADMAP_DEMO_LINK') || '';
  if (!RETELL_API_KEY || !RETELL_AGENT_ID || !RETELL_FROM_NUMBER) {
    return json({ error: 'retell_env_missing' }, 500);
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: lead, error } = await supabase.from('leads').select('*').eq('id', parsed.data.leadId).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!lead) return json({ error: 'lead_not_found' }, 404);

  const { data: lockResult, error: lockError } = await supabase.rpc('acquire_outreach_lock', {
    p_lead_id: parsed.data.leadId,
    p_method: 'ai_call',
    p_manual_unlock: !!parsed.data.manualUnlock,
  });
  if (lockError) return json({ error: 'outreach_lock_failed', details: lockError.message }, 500);
  if (!lockResult?.allowed) return json({ error: lockResult?.reason || 'outreach_locked', lock: lockResult }, 409);

  const retellBody = {
    from_number: RETELL_FROM_NUMBER,
    to_number: lead.phone_e164 || lead.phone,
    agent_id: RETELL_AGENT_ID,
    metadata: { lead_id: lead.id },
    retell_llm_dynamic_variables: {
      business_name: lead.business_name || lead.name,
      owner_name: lead.owner_name || '',
      niche: lead.niche_label || lead.category || '',
      city: lead.city || '',
      country: lead.country || '',
      demo_link: LEADMAP_DEMO_LINK,
      my_name: 'Maged',
      company_name: 'Leadmap AI',
    },
  };

  const retellResp = await fetch('https://api.retellai.com/v2/create-phone-call', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RETELL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(retellBody),
  });
  const retellData = await retellResp.json().catch(() => ({}));
  if (!retellResp.ok) return json({ error: 'retell_call_failed', details: retellData }, 502);

  const callId = retellData.call_id || retellData.call?.call_id || retellData.id;
  const now = new Date().toISOString();
  const updates = {
    retell_call_id: callId,
    retell_agent_id: RETELL_AGENT_ID,
    call_status: 'Calling',
    outreach_state: 'called',
    call_attempts: (lead.call_attempts || 0) + 1,
    outreach_count: (lead.outreach_count || 0) + 1,
    last_called_at: now,
    last_contacted_at: now,
    last_contact_method: 'AI Call',
    outreach_history: appendHistory(lead, { method: 'AI Call', status: 'started', retell_call_id: callId }),
  };

  await supabase.from('leads').update(updates as any).eq('id', lead.id);
  await supabase.from('activities').insert({ lead_id: lead.id, type: 'ai_call_started', payload: { retell_call_id: callId } } as any);

  return json({ success: true, retell_call_id: callId });
});
