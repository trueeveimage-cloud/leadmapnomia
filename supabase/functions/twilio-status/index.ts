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

    let messageSid = '', messageStatus = '', numSegments: number | null = null;

    const contentType = req.headers.get('content-type') || '';
    const rawBody = await req.text();

    if (contentType.includes('json') && rawBody.startsWith('{')) {
      const json = JSON.parse(rawBody);
      messageSid = json.MessageSid || json.messageSid || '';
      messageStatus = json.MessageStatus || json.messageStatus || '';
      if (json.NumSegments) numSegments = parseInt(json.NumSegments, 10);
    } else {
      const params = new URLSearchParams(rawBody);
      messageSid = params.get('MessageSid') || '';
      messageStatus = params.get('MessageStatus') || '';
      const seg = params.get('NumSegments');
      if (seg) numSegments = parseInt(seg, 10);
    }

    if (!messageSid || !messageStatus) {
      return new Response(JSON.stringify({ error: 'Missing MessageSid or MessageStatus' }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Update message log with status and num_segments
    const updateData: Record<string, any> = { status: messageStatus };
    if (numSegments && numSegments > 0) {
      updateData.num_segments = numSegments;
    }

    const { data: msg } = await supabase
      .from('message_logs')
      .update(updateData)
      .eq('provider_message_sid', messageSid)
      .select('lead_id')
      .maybeSingle();

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
