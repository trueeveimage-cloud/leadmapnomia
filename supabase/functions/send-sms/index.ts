import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function notify(dbClient: any, input: { type: string; title: string; message: string; payload?: Record<string, unknown> }) {
  await dbClient.from('app_notifications').insert({
    type: input.type,
    title: input.title,
    message: input.message,
    payload: input.payload || {},
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !data?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { leadId, body, phone, manualUnlock } = await req.json();
    
    // Support direct phone sending (no lead required)
    if (!body) {
      return new Response(JSON.stringify({ error: 'body is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!leadId && !phone) {
      return new Response(JSON.stringify({ error: 'leadId or phone required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioFrom = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!twilioSid || !twilioToken || !twilioFrom) {
      console.error('Missing Twilio config:', { hasSid: !!twilioSid, hasToken: !!twilioToken, hasFrom: !!twilioFrom });
      return new Response(JSON.stringify({ error: 'Twilio not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const dbClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let toNumber: string;
    let resolvedLeadId: string | null = leadId || null;
    let leadRecord: any = null;

    if (leadId) {
      // Fetch lead
      const { data: lead, error: leadErr } = await dbClient
        .from('leads').select('*').eq('id', leadId).single();
      if (leadErr || !lead) {
        return new Response(JSON.stringify({ error: 'Lead not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      leadRecord = lead;
      toNumber = lead.phone_e164 || lead.phone;
      if (!toNumber) {
        return new Response(JSON.stringify({ error: 'Lead has no phone number' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: lockResult, error: lockError } = await dbClient.rpc('acquire_outreach_lock', {
        p_lead_id: leadId,
        p_method: 'sms',
        p_manual_unlock: !!manualUnlock,
      });
      if (lockError) {
        return new Response(JSON.stringify({ error: 'outreach_lock_failed', details: lockError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (!lockResult?.allowed) {
        await notify(dbClient, {
          type: 'outreach_skipped',
          title: 'SMS skipped: outreach locked',
          message: `${leadRecord?.name || toNumber} was blocked by the outreach lock.`,
          payload: { leadId, phone: toNumber, reason: lockResult?.reason || 'outreach_locked' },
        });
        return new Response(JSON.stringify({ skipped: true, reason: lockResult?.reason || 'outreach_locked', lock: lockResult }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } else {
      toNumber = phone;
      // Try to find a lead by phone
      const { data: matchedLeads } = await dbClient
        .from('leads').select('id').or(`phone.eq.${phone},phone_e164.eq.${phone}`).limit(1);
      if (matchedLeads?.length) resolvedLeadId = matchedLeads[0].id;
    }

    // Normalize to E164
    let e164 = toNumber.replace(/\s|-/g, '');
    if (e164.startsWith('07')) {
      e164 = '+46' + e164.slice(1);
    } else if (e164.startsWith('467')) {
      e164 = '+' + e164;
    }

    if (!leadId && resolvedLeadId) {
      const { data: matchedLead } = await dbClient.from('leads').select('*').eq('id', resolvedLeadId).maybeSingle();
      leadRecord = matchedLead;
      const { data: lockResult, error: lockError } = await dbClient.rpc('acquire_outreach_lock', {
        p_lead_id: resolvedLeadId,
        p_method: 'sms',
        p_manual_unlock: !!manualUnlock,
      });
      if (lockError) {
        return new Response(JSON.stringify({ error: 'outreach_lock_failed', details: lockError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (!lockResult?.allowed) {
        await notify(dbClient, {
          type: 'outreach_skipped',
          title: 'SMS skipped: outreach locked',
          message: `${leadRecord?.name || toNumber} was blocked by the outreach lock.`,
          payload: { leadId: resolvedLeadId || '', phone: toNumber, reason: lockResult?.reason || 'outreach_locked' },
        });
        return new Response(JSON.stringify({ skipped: true, reason: lockResult?.reason || 'outreach_locked', lock: lockResult }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const statusCallbackUrl = `${supabaseUrl}/functions/v1/twilio-status`;

    // Send via Twilio
    const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
    const credentials = btoa(`${twilioSid}:${twilioToken}`);
    const params = new URLSearchParams({ From: twilioFrom, To: e164, Body: body, StatusCallback: statusCallbackUrl });
    
    console.log('Sending SMS to:', e164, 'from:', twilioFrom, 'SID prefix:', twilioSid.slice(0, 6));
    
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const json = await resp.json();

    if (!resp.ok) {
      console.error('Twilio error:', resp.status, JSON.stringify(json));
      if (resolvedLeadId) {
        await notify(dbClient, {
          type: 'system_error',
          title: 'SMS send failed',
          message: `${leadRecord?.name || e164}: ${json.message || 'Twilio error'}`,
          payload: { leadId: resolvedLeadId, phone: e164, status: resp.status, code: json.code || '', error: json.message || 'Twilio error' },
        });
      }
      return new Response(JSON.stringify({ error: json.message || 'Twilio error', code: json.code, status: resp.status }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('SMS sent successfully, SID:', json.sid);

    // Log message (only if we have a lead)
    if (resolvedLeadId) {
      await dbClient.from('message_logs').insert({
        lead_id: resolvedLeadId,
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
        outreach_state: 'sms_sent',
        outreach_count: (leadRecord?.outreach_count || 0) + 1,
        outreach_history: [
          ...((Array.isArray(leadRecord?.outreach_history) ? leadRecord.outreach_history : [])),
          { method: 'SMS', status: json.status || 'queued', to: e164, at: new Date().toISOString() },
        ],
        last_contact_method: 'SMS',
        last_contacted_at: new Date().toISOString(),
      }).eq('id', resolvedLeadId);
    }

    return new Response(JSON.stringify({ success: true, sid: json.sid }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('send-sms error:', (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
