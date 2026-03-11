import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function detectCountry(address?: string | null, phone?: string | null): string {
  const addr = (address || '').toLowerCase();
  if (addr.includes('norge') || addr.includes('norway') || addr.includes(', no')) return 'NO';
  if (addr.includes('danmark') || addr.includes('denmark') || addr.includes(', dk')) return 'DK';
  if (addr.includes('sverige') || addr.includes('sweden') || addr.includes(', se')) return 'SE';
  if (phone) {
    const clean = phone.replace(/\s|-/g, '');
    if (clean.startsWith('+47') || (clean.startsWith('47') && clean.length >= 10)) return 'NO';
    if (clean.startsWith('+45') || (clean.startsWith('45') && clean.length >= 10)) return 'DK';
    if (clean.startsWith('+46') || (clean.startsWith('46') && clean.length >= 10)) return 'SE';
  }
  return 'SE';
}

function isSmsEligible(phone: string, address?: string | null): boolean {
  const cleaned = phone.replace(/\s|-/g, '');
  const country = detectCountry(address, phone);
  
  // For Norway and Denmark: send to ALL numbers — Twilio handles landline rejection
  if (country === 'NO' || country === 'DK') return true;
  
  // Sweden: only mobile numbers (landlines go to call list)
  return /^(070|072|073|076|079|\+46(70|72|73|76|79)|46(70|72|73|76|79))/.test(cleaned);
}

function normalizeToE164(phone: string, address?: string | null): string {
  let e164 = phone.replace(/\s|-/g, '');
  const country = detectCountry(address, phone);
  
  if (country === 'NO') {
    if (/^\d{8}$/.test(e164)) e164 = '+47' + e164;
    else if (/^47\d{8}$/.test(e164)) e164 = '+' + e164;
  } else if (country === 'DK') {
    if (/^\d{8}$/.test(e164)) e164 = '+45' + e164;
    else if (/^45\d{8}$/.test(e164)) e164 = '+' + e164;
  } else {
    // Sweden
    if (e164.startsWith('07')) e164 = '+46' + e164.slice(1);
    else if (e164.startsWith('467')) e164 = '+' + e164;
  }
  
  if (!e164.startsWith('+')) e164 = '+' + e164;
  return e164;
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

    // Verify the user is authenticated
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { campaignId, batchSize, countries: requestedCountries } = await req.json();
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
    const cooldownDays = campaign.cooldown_days || 0;
    const cooldownDate = new Date(Date.now() - cooldownDays * 86400000).toISOString();

    // Determine which countries to send to
    // Priority: 1) request body param, 2) campaign filter, 3) default to Sweden only
    const targetCountries: string[] = requestedCountries?.length
      ? requestedCountries
      : filter.countries?.length
        ? filter.countries
        : ['SE'];

    // Check how many messages THIS CAMPAIGN sent today (per-campaign daily cap)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Get today's run IDs for this campaign
    const { data: todayRuns } = await dbClient
      .from('campaign_runs')
      .select('id')
      .eq('campaign_id', campaignId)
      .gte('created_at', todayStart.toISOString());
    
    const todayRunIds = (todayRuns || []).map((r: any) => r.id);
    
    let sentToday = 0;
    if (todayRunIds.length > 0) {
      const { count } = await dbClient
        .from('message_logs')
        .select('id', { count: 'exact', head: true })
        .eq('direction', 'outbound')
        .not('status', 'eq', 'failed')
        .in('campaign_run_id', todayRunIds);
      sentToday = count || 0;
    }

    const dailyCap = campaign.daily_cap || 100;
    const remaining = Math.max(0, dailyCap - sentToday);
    if (remaining === 0) {
      return new Response(JSON.stringify({ error: 'Daily cap reached', sentToday }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requestedBatch = (batchSize && Number(batchSize) > 0) ? Math.min(Number(batchSize), remaining) : Math.min(campaign.daily_cap || 100, remaining);
    const effectiveLimit = requestedBatch;

    // Build query for eligible leads
    // CRITICAL: Only send to leads that have NEVER been messaged before (no outbound ever)
    const excludedStatuses = ['interested', 'not_interested', 'unsure', 'callback', 'closed_won', 'closed_lost', 'contacted'];
    let query = dbClient.from('leads').select('*')
      .eq('outreach_opt_out', false)
      .eq('has_replied', false)
      .is('last_outbound_at', null)
      .not('phone', 'is', null)
      .not('status', 'in', `(${excludedStatuses.join(',')})`);

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
    
    // Sort by highest reviews first — prioritise established businesses
    query = query.order('reviews_count', { ascending: false, nullsFirst: false });

    // Fetch MORE leads to account for landline skipping — we want effectiveLimit ACTUAL sends
    query = query.limit(effectiveLimit * 5);

    const { data: leads, error: leadErr } = await query;
    if (leadErr) throw leadErr;

    // Filter by target countries
    const filteredLeads = (leads || []).filter((lead: any) => {
      const country = detectCountry(lead.address, lead.phone);
      return targetCountries.includes(country);
    });

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
      countries: targetCountries,
    };

    // Loop until we've SENT effectiveLimit messages (not just attempted)
    for (const lead of filteredLeads) {
      // Stop once we've sent enough
      if (stats.sent >= effectiveLimit) break;

      stats.attempted++;

      const toNumber = lead.phone_e164 || lead.phone;
      if (!toNumber) { stats.skipped_no_phone++; continue; }

      // Check SMS eligibility — landlines DON'T count toward batch limit
      if (!isSmsEligible(toNumber, lead.address)) {
        const country = detectCountry(lead.address, toNumber);
        stats.skipped_landline++;
        if (country === 'SE') {
          await dbClient.from('leads').update({
            needs_call: true,
            outreach_stage: 'no_reply_call',
            call_after_at: new Date().toISOString(),
          }).eq('id', lead.id);
        }
        continue;
      }

      // Render template
      const body = (campaign.template_text || '').replace(/\{(\w+)\}/g, (_: string, key: string) => {
        return (lead as any)[key] ?? '';
      });

      // Normalize to E164
      const e164 = normalizeToE164(toNumber, lead.address);

      if (useTwilio) {
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
        await dbClient.from('message_logs').insert({
          lead_id: lead.id,
          direction: 'outbound',
          channel: 'sms',
          from_number: 'MOCK',
          to_number: e164,
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
        status: 'contacted',
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
