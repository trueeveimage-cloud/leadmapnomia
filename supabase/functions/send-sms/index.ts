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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { leadId, body } = await req.json();
    if (!leadId || !body) {
      return new Response(JSON.stringify({ error: 'leadId and body required' }), { status: 400, headers: corsHeaders });
    }

    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioFrom = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!twilioSid || !twilioToken || !twilioFrom) {
      return new Response(JSON.stringify({ error: 'Twilio not configured' }), { status: 500, headers: corsHeaders });
    }

    const dbClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Fetch lead
    const { data: lead, error: leadErr } = await dbClient
      .from('leads').select('*').eq('id', leadId).single();
    if (leadErr || !lead) {
      return new Response(JSON.stringify({ error: 'Lead not found' }), { status: 404, headers: corsHeaders });
    }

    let toNumber = lead.phone_e164 || lead.phone;
    if (!toNumber) {
      return new Response(JSON.stringify({ error: 'Lead has no phone number' }), { status: 400, headers: corsHeaders });
    }

    // Normalize to E164
    let e164 = toNumber.replace(/\s|-/g, '');
    if (e164.startsWith('07')) {
      e164 = '+46' + e164.slice(1);
    } else if (e164.startsWith('467')) {
      e164 = '+' + e164;
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const statusCallbackUrl = `${supabaseUrl}/functions/v1/twilio-status`;

    // Send via Twilio
    const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
    const params = new URLSearchParams({ From: twilioFrom, To: e164, Body: body, StatusCallback: statusCallbackUrl });
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const json = await resp.json();

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: json.message || 'Twilio error' }), { status: 500, headers: corsHeaders });
    }

    // Log message
    await dbClient.from('message_logs').insert({
      lead_id: leadId,
      direction: 'outbound',
      channel: 'sms',
      from_number: twilioFrom,
      to_number: e164,
      body,
      provider: 'twilio',
      provider_message_sid: json.sid,
      status: json.status || 'queued',
    });

    // Update lead
    await dbClient.from('leads').update({
      last_outbound_at: new Date().toISOString(),
      last_message_preview: body.slice(0, 80),
      last_message_direction: 'outbound',
      last_message_status: json.status || 'queued',
      last_contact_method: 'sms',
      last_contacted_at: new Date().toISOString(),
    }).eq('id', leadId);

    return new Response(JSON.stringify({ success: true, sid: json.sid }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
