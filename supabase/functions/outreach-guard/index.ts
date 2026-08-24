import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireUserJwt } from '../_shared/auth.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const unauthorized = await requireUserJwt(req, corsHeaders);
  if (unauthorized) return unauthorized;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const leadId = typeof body?.lead_id === 'string' ? body.lead_id : '';
  const method = typeof body?.method === 'string' ? body.method : '';
  if (!leadId || !['email', 'sms', 'call', 'ai_call'].includes(method)) {
    return json({ error: 'lead_id and a valid method are required' }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await admin.rpc('acquire_outreach_lock', {
    p_lead_id: leadId,
    p_method: method,
    p_manual_unlock: false,
  });
  if (error) return json({ error: error.message }, 500);

  return json(data);
});
