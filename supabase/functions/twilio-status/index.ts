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

    // Parse Twilio status callback
    let messageSid = '', messageStatus = '';

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      messageSid = formData.get('MessageSid')?.toString() || '';
      messageStatus = formData.get('MessageStatus')?.toString() || '';
    } else {
      const json = await req.json();
      messageSid = json.MessageSid || json.messageSid || '';
      messageStatus = json.MessageStatus || json.messageStatus || '';
    }

    if (!messageSid || !messageStatus) {
      return new Response(JSON.stringify({ error: 'Missing MessageSid or MessageStatus' }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Update message log
    const { data: msg } = await supabase
      .from('message_logs')
      .update({ status: messageStatus })
      .eq('provider_message_sid', messageSid)
      .select('lead_id')
      .maybeSingle();

    // Update lead status if we found the message
    if (msg?.lead_id) {
      await supabase.from('leads').update({
        last_message_status: messageStatus,
      }).eq('id', msg.lead_id);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Status webhook error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
