import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { requireCronOrService } = await import('../_shared/auth.ts');
  const authFail = requireCronOrService(req, corsHeaders);
  if (authFail) return authFail;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const db = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: pauseRows, error: pauseError } = await db
      .from('settings')
      .select('key,value')
      .in('key', ['outreach_master_paused', 'nomia_sms_paused']);
    if (pauseError) throw pauseError;
    const pauses = Object.fromEntries((pauseRows || []).map((row: any) => [row.key, row.value]));
    if (pauses.outreach_master_paused !== 'false' || pauses.nomia_sms_paused !== 'false') {
      return new Response(JSON.stringify({ skipped: true, reason: 'SMS outreach is paused' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if follow-up is enabled
    const { data: enabledSetting } = await db.from('settings').select('value').eq('key', 'followup_enabled').single();
    if (!enabledSetting || enabledSetting.value !== 'true') {
      return new Response(JSON.stringify({ skipped: true, reason: 'followup_enabled is not true' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get config
    const { data: hoursSetting } = await db.from('settings').select('value').eq('key', 'followup_after_hours').single();
    const afterHours = Number(hoursSetting?.value) || 24;

    const { data: templateSetting } = await db.from('settings').select('value').eq('key', 'followup_template').single();
    const template = templateSetting?.value || 'Hej {name}! Såg att du var intresserad — har du hunnit fundera? /Simon';

    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioFrom = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!twilioSid || !twilioToken || !twilioFrom) {
      return new Response(JSON.stringify({ error: 'Twilio not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cutoff = new Date(Date.now() - afterHours * 60 * 60 * 1000).toISOString();

    // Find interested leads where last outbound is older than threshold
    const { data: leads, error } = await db
      .from('leads')
      .select('id, name, phone, phone_e164, last_outbound_at')
      .eq('product', 'nomia')
      .eq('status', 'interested')
      .eq('outreach_opt_out', false)
      .eq('do_not_contact', false)
      .not('phone', 'is', null)
      .lt('last_outbound_at', cutoff)
      .order('last_outbound_at', { ascending: true })
      .limit(20);

    if (error) throw error;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no eligible leads' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Filter: skip leads that already got an outbound message in the last 24h
    const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const eligibleLeads = [];
    for (const lead of leads) {
      const { count } = await db
        .from('message_logs')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', lead.id)
        .eq('direction', 'outbound')
        .gte('created_at', recentCutoff);
      if ((count || 0) === 0) eligibleLeads.push(lead);
    }

    let sentCount = 0;
    const statusCallbackUrl = `${supabaseUrl}/functions/v1/twilio-status`;

    for (const lead of eligibleLeads) {
      let e164 = (lead.phone_e164 || lead.phone || '').replace(/\s|-/g, '');
      if (e164.startsWith('07')) e164 = '+46' + e164.slice(1);
      else if (e164.startsWith('467')) e164 = '+' + e164;
      if (!e164.startsWith('+')) continue;

      const firstName = lead.name.split(' ')[0];
      const body = template.replace('{name}', firstName);

      const { data: lockResult, error: lockError } = await db.rpc('acquire_outreach_lock', {
        p_lead_id: lead.id,
        p_method: 'sms',
        p_manual_unlock: false,
      });
      if (lockError || !lockResult?.allowed) continue;

      const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
      const credentials = btoa(`${twilioSid.trim()}:${twilioToken.trim()}`);
      const params = new URLSearchParams({ From: twilioFrom, To: e164, Body: body, StatusCallback: statusCallbackUrl });

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const json = await resp.json();

      if (resp.ok) {
        sentCount++;
        await db.from('message_logs').insert({
          lead_id: lead.id,
          direction: 'outbound',
          channel: 'sms',
          from_number: twilioFrom,
          to_number: e164,
          body,
          provider: 'twilio',
          provider_message_sid: json.sid,
          status: json.status || 'queued',
        });
        await db.from('leads').update({
          last_outbound_at: new Date().toISOString(),
          last_message_preview: body.slice(0, 80),
          last_message_direction: 'outbound',
          last_message_status: json.status || 'queued',
          last_contact_method: 'sms',
          last_contacted_at: new Date().toISOString(),
        }).eq('id', lead.id);
      } else {
        console.error(`Failed to send to ${lead.id}:`, json.message);
      }
    }

    return new Response(JSON.stringify({ sent: sentCount, checked: leads.length, eligible: eligibleLeads.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('auto-followup error:', (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
