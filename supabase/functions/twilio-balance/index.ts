import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

    const accountSid = (Deno.env.get('TWILIO_ACCOUNT_SID') || '').trim();
    const authToken = (Deno.env.get('TWILIO_AUTH_TOKEN') || '').trim();

    if (!accountSid || !authToken) {
      return new Response(JSON.stringify({ error: 'Twilio not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('Fetching Twilio balance, SID prefix:', accountSid.slice(0, 6));

    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Balance.json`,
      {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        },
      }
    );

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Twilio balance error:', resp.status, errText);
      return new Response(JSON.stringify({ error: 'Failed to fetch balance', details: resp.status }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const balanceData = await resp.json();

    return new Response(JSON.stringify({
      balance: parseFloat(balanceData.balance),
      currency: balanceData.currency,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Balance function error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
