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

    // Fetch campaign
    const { data: campaign, error: campErr } = await supabase
      .from('campaigns').select('*').eq('id', campaignId).single();
    if (campErr || !campaign) {
      return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404, headers: corsHeaders });
    }

    const filter = campaign.audience_filter || {};
    const cooldownDate = new Date(Date.now() - (campaign.cooldown_days || 14) * 86400000).toISOString();

    // Build query for eligible leads
    let query = supabase.from('leads').select('*')
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
    const { data: run, error: runErr } = await supabase
      .from('campaign_runs')
      .insert({ campaign_id: campaignId })
      .select()
      .single();
    if (runErr) throw runErr;

    const stats = {
      attempted: 0, sent: 0, delivered: 0, failed: 0,
      skipped_no_phone: 0, skipped_opt_out: 0, skipped_cooldown: 0, skipped_duplicate: 0,
    };

    // Process leads — mock provider (instant delivery)
    for (const lead of (leads || [])) {
      stats.attempted++;

      if (!lead.phone) { stats.skipped_no_phone++; continue; }

      // Render template
      const body = (campaign.template_text || '').replace(/\{(\w+)\}/g, (_: string, key: string) => {
        return (lead as any)[key] ?? '';
      });

      // Create message log
      const { error: msgErr } = await supabase.from('message_logs').insert({
        lead_id: lead.id,
        direction: 'outbound',
        channel: 'sms',
        from_number: 'MOCK',
        to_number: lead.phone_e164 || lead.phone,
        body,
        provider: 'mock',
        provider_message_sid: `mock_${crypto.randomUUID()}`,
        status: 'delivered',
        campaign_run_id: run.id,
      });

      if (msgErr) {
        stats.failed++;
        continue;
      }

      stats.sent++;
      stats.delivered++;

      // Update lead
      await supabase.from('leads').update({
        last_outbound_at: new Date().toISOString(),
        outreach_stage: 'sms_sent',
        last_message_preview: body.slice(0, 80),
        last_message_direction: 'outbound',
        last_message_status: 'delivered',
      }).eq('id', lead.id);
    }

    // Update run stats
    await supabase.from('campaign_runs').update({
      stats,
      ended_at: new Date().toISOString(),
    }).eq('id', run.id);

    return new Response(JSON.stringify({ success: true, stats, runId: run.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
