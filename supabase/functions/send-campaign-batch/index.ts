import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function isMobileNumber(phone: string): boolean {
  const cleaned = phone.replace(/\s|-/g, '');
  // Swedish mobile prefixes: 070, 072, 073, 076, 079
  return /^(070|072|073|076|079)/.test(cleaned) ||
         /^\+46(70|72|73|76|79)/.test(cleaned) ||
         /^46(70|72|73|76|79)/.test(cleaned);
}

async function sendTwilioSms(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  body: string,
  statusCallback: string,
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
  if (!resp.ok) {
    return { sid: '', status: 'failed', error: json.message || json.code || 'Twilio error' };
  }
  return { sid: json.sid, status: json.status };
}

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

    const { data: claims, error: authErr } = await supabase.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { campaignId } = await req.json();
    if (!campaignId) {
      return new Response(JSON.stringify({ error: 'campaignId required' }), { status: 400, headers: corsHeaders });
    }

    // Check Twilio credentials
    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioFrom = Deno.env.get('TWILIO_PHONE_NUMBER');
    const useTwilio = !!(twilioSid && twilioToken && twilioFrom);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const statusCallbackUrl = `${supabaseUrl}/functions/v1/twilio-status`;

    // Use service role for DB operations
    const dbClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Fetch campaign
    const { data: campaign, error: campErr } = await dbClient
      .from('campaigns').select('*').eq('id', campaignId).single();
    if (campErr || !campaign) {
      return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404, headers: corsHeaders });
    }

    const filter = campaign.audience_filter || {};
    const cooldownDate = new Date(Date.now() - (campaign.cooldown_days || 14) * 86400000).toISOString();

    // Build query for eligible leads
    let query = dbClient.from('leads').select('*')
      .eq('outreach_opt_out', false)
      .eq('has_replied', false)
      .not('phone', 'is', null);

    if (filter.sections?.length) {
      query = query.in('section', filter.sections);
    }
    if (filter.hasWebsite === false) {
      query = query.is('website', null);
    }
    if (filter.minRating) {
      query = query.gte('rating', filter.minRating);
    }
    if (filter.minReviews) {
      query = query.gte('reviews_count', filter.minReviews);
    }

    query = query.or(`last_outbound_at.is.null,last_outbound_at.lt.${cooldownDate}`);
    query = query.limit(campaign.batch_cap || 200);

    const { data: leads, error: leadErr } = await query;
    if (leadErr) throw leadErr;

    // Create campaign run
    const { data: run, error: runErr } = await dbClient
      .from('campaign_runs')
      .insert({ campaign_id: campaignId })
      .select()
      .single();
    if (runErr) throw runErr;

    const stats = {
      attempted: 0, sent: 0, delivered: 0, failed: 0,
      skipped_no_phone: 0, skipped_opt_out: 0, skipped_cooldown: 0, skipped_duplicate: 0,
      skipped_landline: 0,
      provider: useTwilio ? 'twilio' : 'mock',
    };

    for (const lead of (leads || [])) {
      stats.attempted++;

      const toNumber = lead.phone_e164 || lead.phone;
      if (!toNumber) { stats.skipped_no_phone++; continue; }

      // Only SMS mobile numbers (07...), move landlines straight to call list
      if (!isMobileNumber(toNumber)) {
        stats.skipped_landline++;
        await dbClient.from('leads').update({
          needs_call: true,
          outreach_stage: 'no_reply_call',
          call_after_at: new Date().toISOString(),
        }).eq('id', lead.id);
        continue;
      }

      // Render template
      const body = (campaign.template_text || '').replace(/\{(\w+)\}/g, (_: string, key: string) => {
        return (lead as any)[key] ?? '';
      });

      if (useTwilio) {
        // --- REAL TWILIO SMS ---
        // Normalize to E164 for Twilio
        let e164 = toNumber.replace(/\s|-/g, '');
        if (e164.startsWith('07')) {
          e164 = '+46' + e164.slice(1);
        } else if (e164.startsWith('467')) {
          e164 = '+' + e164;
        }

        const result = await sendTwilioSms(twilioSid!, twilioToken!, twilioFrom!, e164, body, statusCallbackUrl);

        await dbClient.from('message_logs').insert({
          lead_id: lead.id,
          direction: 'outbound',
          channel: 'sms',
          from_number: twilioFrom,
          to_number: e164,
          body,
          provider: 'twilio',
          provider_message_sid: result.sid || null,
          status: result.error ? 'failed' : result.status,
          error_message: result.error || null,
          campaign_run_id: run.id,
        });

        // Save normalized E164 on the lead if not already set
        if (!lead.phone_e164 && e164 !== toNumber) {
          await dbClient.from('leads').update({ phone_e164: e164 }).eq('id', lead.id);
        }

        if (result.error) {
          stats.failed++;
          console.error(`SMS failed for ${lead.id}: ${result.error}`);
          continue;
        }

        stats.sent++;
      } else {
        // --- MOCK PROVIDER ---
        await dbClient.from('message_logs').insert({
          lead_id: lead.id,
          direction: 'outbound',
          channel: 'sms',
          from_number: 'MOCK',
          to_number: toNumber,
          body,
          provider: 'mock',
          provider_message_sid: `mock_${crypto.randomUUID()}`,
          status: 'delivered',
          campaign_run_id: run.id,
        });

        stats.sent++;
        stats.delivered++;
      }

      // Update lead
      await dbClient.from('leads').update({
        last_outbound_at: new Date().toISOString(),
        outreach_stage: 'sms_sent',
        last_message_preview: body.slice(0, 80),
        last_message_direction: 'outbound',
        last_message_status: useTwilio ? 'queued' : 'delivered',
        last_contact_method: 'sms',
        last_contacted_at: new Date().toISOString(),
      }).eq('id', lead.id);
    }

    // Update run stats
    await dbClient.from('campaign_runs').update({
      stats,
      ended_at: new Date().toISOString(),
    }).eq('id', run.id);

    return new Response(JSON.stringify({ success: true, stats, runId: run.id, provider: useTwilio ? 'twilio' : 'mock' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
