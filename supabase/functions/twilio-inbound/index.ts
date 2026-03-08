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

    // Parse Twilio-style inbound webhook (form-encoded or JSON)
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
      // Twilio always sends application/x-www-form-urlencoded
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

    // Find lead by phone (try phone_e164 first, then phone)
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

    // Update lead
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

    // Check for interest keywords and notify owner
    const INTEREST_KEYWORDS = ['intresserad', 'interested', 'ja', 'yes', 'berätta mer', 'tell me more', 'absolut', 'gärna', 'sure', 'ok', 'visst', 'hemsida'];
    const bodyLower = body.toLowerCase().trim();
    const isInterested = INTEREST_KEYWORDS.some(k => bodyLower.includes(k));

    if (isInterested && !isOptOut) {
      updates.status = 'interested';
      
      // Send notification SMS to owner
      const ownerPhone = '+46763224478';
      const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      const twilioNumber = Deno.env.get('TWILIO_PHONE_NUMBER');
      
      if (twilioSid && twilioToken && twilioNumber) {
        // Fetch full lead details
        const { data: fullLead } = await supabase.from('leads').select('*').eq('id', lead.id).single();
        const l = fullLead || lead;
        const notifBody = `🔥 INTERESTED LEAD!\n${(l as any).name}\n📞 ${(l as any).phone || 'N/A'}\n📍 ${(l as any).address || 'N/A'}\n⭐ ${(l as any).rating || '-'}/5 (${(l as any).reviews_count || 0} reviews)\n💬 "${body.slice(0, 100)}"\n📋 ${(l as any).category || 'N/A'}`;
        
        try {
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioToken}`),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              To: ownerPhone,
              From: twilioNumber,
              Body: notifBody,
            }),
          });
          console.log('Owner notified about interested lead:', lead.name);
        } catch (notifErr) {
          console.error('Failed to notify owner:', notifErr);
        }
      }
    }

    await supabase.from('leads').update(updates).eq('id', lead.id);

    // Return TwiML empty response
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
