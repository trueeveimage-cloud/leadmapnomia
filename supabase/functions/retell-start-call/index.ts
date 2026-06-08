import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { requireCronServiceOrUserJwt } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BodySchema = z.object({
  leadId: z.string().uuid(),
  manualUnlock: z.boolean().optional(),
});

type JsonRecord = Record<string, unknown>;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function appendHistory(lead: JsonRecord, item: JsonRecord) {
  const history = Array.isArray(lead.outreach_history) ? lead.outreach_history : [];
  return [...history, { ...item, at: new Date().toISOString() }];
}

function normalizeE164(value?: string | null) {
  const cleaned = String(value || '').trim().replace(/[\s().-]/g, '');
  const withPlus = cleaned.startsWith('00') ? `+${cleaned.slice(2)}` : cleaned;
  return /^\+[1-9]\d{7,14}$/.test(withPlus) ? withPlus : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authFail = await requireCronServiceOrUserJwt(req, corsHeaders);
  if (authFail) return authFail;


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
  const { data: rawLead, error } = await supabase.from('leads').select('*').eq('id', parsed.data.leadId).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!rawLead) return json({ error: 'lead_not_found' }, 404);
  const lead = rawLead as JsonRecord;

  const toNumber = normalizeE164(String(lead.phone_e164 || '')) || normalizeE164(String(lead.phone || ''));
  if (!toNumber) return json({ error: 'phone_not_e164', message: 'Lead phone must be in E.164 format, for example +46701234567.' }, 400);
  if (lead.do_not_contact || lead.outreach_opt_out) return json({ error: 'do_not_contact' }, 409);
  if (lead.call_status === 'Calling') return json({ error: 'already_calling' }, 409);
  const callAttempts = typeof lead.call_attempts === 'number' ? lead.call_attempts : 0;
  if (callAttempts >= 2 && !parsed.data.manualUnlock) return json({ error: 'call_attempt_limit' }, 409);

  if (!parsed.data.manualUnlock) {
    const candidates = Array.from(new Set([toNumber, lead.phone_e164, lead.phone].filter(Boolean)));
    const duplicateFilter = candidates.flatMap((phone) => [`phone.eq.${phone}`, `phone_e164.eq.${phone}`]).join(',');
    if (duplicateFilter) {
      const { data: duplicate } = await supabase
        .from('leads')
        .select('id,name,last_contacted_at')
        .neq('id', String(lead.id))
        .not('last_contacted_at', 'is', null)
        .or(duplicateFilter)
        .limit(1)
        .maybeSingle();
      if (duplicate) {
        return json({ error: 'duplicate_phone_contacted', existing_lead_id: duplicate.id, existing_lead_name: duplicate.name }, 409);
      }
    }
  }

  const { data: lockResult, error: lockError } = await supabase.rpc('acquire_outreach_lock', {
    p_lead_id: parsed.data.leadId,
    p_method: 'ai_call',
    p_manual_unlock: !!parsed.data.manualUnlock,
  });
  if (lockError) return json({ error: 'outreach_lock_failed', details: lockError.message }, 500);
  if (!lockResult?.allowed) return json({ error: lockResult?.reason || 'outreach_locked', lock: lockResult }, 409);

  const retellBody = {
    from_number: RETELL_FROM_NUMBER,
    to_number: toNumber,
    override_agent_id: RETELL_AGENT_ID,
    metadata: {
      lead_id: String(lead.id),
      source: 'leadmap_crm',
      campaign: 'leadmap_ai_cold_call_mvp',
    },
    retell_llm_dynamic_variables: {
      business_name: String(lead.business_name || lead.name || ''),
      owner_name: String(lead.owner_name || ''),
      niche: String(lead.niche_label || lead.category || ''),
      city: String(lead.city || ''),
      country: String(lead.country || ''),
      demo_link: String(LEADMAP_DEMO_LINK || ''),
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
  if (!callId) return json({ error: 'retell_call_id_missing', details: retellData }, 502);
  const now = new Date().toISOString();
  const updates = {
    retell_call_id: callId,
    retell_agent_id: RETELL_AGENT_ID,
    call_status: 'Calling',
    outreach_state: 'called',
    call_attempts: callAttempts + 1,
    outreach_count: (typeof lead.outreach_count === 'number' ? lead.outreach_count : 0) + 1,
    last_called_at: now,
    last_contacted_at: now,
    last_contact_method: 'AI Call',
    outreach_history: appendHistory(lead, { method: 'AI Call', status: 'started', retell_call_id: callId }),
  };

  const { error: updateError } = await supabase.from('leads').update(updates).eq('id', String(lead.id));
  if (updateError) return json({ error: 'lead_update_failed', details: updateError.message }, 500);

  await supabase.from('activities').insert({ lead_id: String(lead.id), type: 'ai_call_started', payload: { retell_call_id: callId } });

  return json({ success: true, retell_call_id: callId });
});
