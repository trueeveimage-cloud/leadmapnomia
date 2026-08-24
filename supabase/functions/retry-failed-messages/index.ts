import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function sendTwilioSms(
  accountSid: string, authToken: string, from: string, to: string, body: string, statusCallback: string,
): Promise<{ sid: string; status: string; error?: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({ From: from, To: to, Body: body, StatusCallback: statusCallback });
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const json = await resp.json();
  if (!resp.ok) return { sid: '', status: 'failed', error: json.message || 'Twilio error' };
  return { sid: json.sid, status: json.status };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: authErr } = await supabase.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const { data: isOwner } = await supabase.rpc('is_crm_owner');
    if (!isOwner) {
      return new Response(JSON.stringify({ error: 'Owner access required' }), { status: 403, headers: corsHeaders });
    }

    const { messageIds } = await req.json();
    if (!messageIds?.length) {
      return new Response(JSON.stringify({ error: 'No messageIds' }), { status: 400, headers: corsHeaders });
    }

    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID')!;
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN')!;
    const twilioFrom = Deno.env.get('TWILIO_PHONE_NUMBER')!;
    const statusCallback = `${Deno.env.get('SUPABASE_URL')!}/functions/v1/twilio-status`;

    const dbClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: pauseRows, error: pauseError } = await dbClient
      .from('settings')
      .select('key,value')
      .in('key', ['outreach_master_paused', 'nomia_sms_paused']);
    if (pauseError) throw pauseError;
    const pauses = Object.fromEntries((pauseRows || []).map((row: any) => [row.key, row.value]));
    if (pauses.outreach_master_paused !== 'false' || pauses.nomia_sms_paused !== 'false') {
      return new Response(JSON.stringify({ error: 'SMS outreach is paused' }), { status: 409, headers: corsHeaders });
    }

    // Fetch failed messages
    const { data: failedMsgs } = await dbClient
      .from('message_logs')
      .select('*')
      .in('id', messageIds)
      .eq('status', 'failed');

    let retried = 0, succeeded = 0, stillFailed = 0;

    for (const msg of (failedMsgs || [])) {
      if (!msg.lead_id) {
        stillFailed++;
        continue;
      }
      const { data: lockResult, error: lockError } = await dbClient.rpc('acquire_outreach_lock', {
        p_lead_id: msg.lead_id,
        p_method: 'sms',
        p_manual_unlock: false,
      });
      if (lockError || !lockResult?.allowed) {
        stillFailed++;
        continue;
      }
      const result = await sendTwilioSms(twilioSid, twilioToken, twilioFrom, msg.to_number!, msg.body!, statusCallback);
      retried++;

      if (result.error) {
        stillFailed++;
        await dbClient.from('message_logs').update({
          error_message: result.error,
          status: 'failed',
        }).eq('id', msg.id);
      } else {
        succeeded++;
        await dbClient.from('message_logs').update({
          status: result.status,
          provider_message_sid: result.sid,
          error_message: null,
          error_code: null,
        }).eq('id', msg.id);
      }
    }

    return new Response(JSON.stringify({ retried, succeeded, stillFailed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
