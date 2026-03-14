import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let from = '', to = '', body = '', messageSid = '';

    const contentType = req.headers.get('content-type') || '';
    const rawBody = await req.text();

    if (contentType.includes('json') && rawBody.startsWith('{')) {
      const json = JSON.parse(rawBody);
      from = json.From || json.from || '';
      to = json.To || json.to || '';
      body = json.Body || json.body || '';
      messageSid = json.MessageSid || json.messageSid || '';
    } else {
      const params = new URLSearchParams(rawBody);
      from = params.get('From') || '';
      to = params.get('To') || '';
      body = params.get('Body') || '';
      messageSid = params.get('MessageSid') || '';
    }

    if (!from || !body) {
      return new Response(JSON.stringify({ error: 'Missing From or Body' }), { status: 400, headers: corsHeaders });
    }

    // Check opt-out keywords
    const OPT_OUT_KEYWORDS = ['stop', 'avsluta', 'sluta', 'unsubscribe'];
    const isOptOut = OPT_OUT_KEYWORDS.some(k => body.toLowerCase().trim() === k);

    // Find lead by phone
    const normalizedFrom = from.replace(/\s/g, '');
    const { data: lead } = await supabase
      .from('leads')
      .select('id, name')
      .or(`phone_e164.eq.${normalizedFrom},phone.eq.${normalizedFrom},phone.eq.${from}`)
      .limit(1)
      .maybeSingle();

    if (!lead) {
      console.log('No lead found for number:', from);
      return new Response(JSON.stringify({ warning: 'No matching lead' }), { headers: corsHeaders });
    }

    // Create inbound message log
    await supabase.from('message_logs').insert({
      lead_id: lead.id,
      direction: 'inbound',
      channel: 'sms',
      from_number: from,
      to_number: to,
      body,
      provider: 'twilio',
      provider_message_sid: messageSid || null,
      status: 'received',
    });

    // Update lead — ONLY set reply metadata, do NOT auto-change status
    const updates: Record<string, any> = {
      has_replied: true,
      last_inbound_at: new Date().toISOString(),
      outreach_stage: 'replied',
      needs_call: false,
      last_message_preview: body.slice(0, 80),
      last_message_direction: 'inbound',
    };

    if (isOptOut) {
      updates.outreach_opt_out = true;
    }

    // DO NOT auto-set status to 'interested' — user decides manually
    console.log('Inbound from:', lead.name, '- status NOT auto-changed');

    await supabase.from('leads').update(updates).eq('id', lead.id);

    return new Response('<Response></Response>', {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
    });

  } catch (err) {
    console.error('Inbound webhook error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
