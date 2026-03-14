import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Cron-style edge function: finds leads who sent SMS but got no reply after X hours
// and marks them as needs_call — but does NOT change their status (user decides)
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: setting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'default_call_after_hours')
      .maybeSingle();

    const callAfterHours = parseInt(setting?.value || '48', 10);
    const cutoff = new Date(Date.now() - callAfterHours * 3600000).toISOString();

    // Find leads: sms_sent, no reply, outbound older than cutoff
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id')
      .eq('outreach_stage', 'sms_sent')
      .eq('has_replied', false)
      .eq('needs_call', false)
      .lte('last_outbound_at', cutoff)
      .limit(500);

    if (error) throw error;

    let updated = 0;
    for (const lead of (leads || [])) {
      // Only set needs_call and outreach_stage — do NOT change status
      const { error: upErr } = await supabase.from('leads').update({
        needs_call: true,
        outreach_stage: 'no_reply_call',
      }).eq('id', lead.id);
      if (!upErr) updated++;
    }

    return new Response(JSON.stringify({ success: true, processed: leads?.length || 0, updated }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
