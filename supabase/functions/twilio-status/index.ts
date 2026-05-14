import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateTwilioSignature, paramsFromBody } from "../_shared/twilio-signature.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
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

    const contentType = req.headers.get('content-type') || '';
    const rawBody = await req.text();
    const params = paramsFromBody(rawBody, contentType);

    // Verify Twilio signature to prevent forged status callbacks
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
    const signature = req.headers.get('x-twilio-signature');
    const valid = await validateTwilioSignature(signature, req.url, params, authToken);
    if (!valid) {
      console.warn('Invalid Twilio signature on status webhook');
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }

    const messageSid = params.MessageSid || params.messageSid || '';
    const messageStatus = params.MessageStatus || params.messageStatus || '';
    const numSegments: number | null = params.NumSegments ? parseInt(params.NumSegments, 10) : null;

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
