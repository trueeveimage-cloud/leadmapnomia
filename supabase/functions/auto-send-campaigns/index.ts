import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const { requireCronOrService } = await import('../_shared/auth.ts');
  const authFail = requireCronOrService(req, corsHeaders);
  if (authFail) return authFail;

  try {
    const dbClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Find all running campaigns
    const { data: campaigns, error: campErr } = await dbClient
      .from('campaigns')
      .select('id, name, daily_cap, audience_filter')
      .eq('status', 'running');

    if (campErr) throw campErr;

    if (!campaigns?.length) {
      return new Response(JSON.stringify({ message: 'No running campaigns' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: any[] = [];

    for (const campaign of campaigns) {
      try {
        // Call the send-campaign-batch function using service role key
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        const resp = await fetch(`${supabaseUrl}/functions/v1/send-campaign-batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ 
            campaignId: campaign.id,
            // Use campaign's country filter, default to Sweden only
            countries: (campaign.audience_filter as any)?.countries || ['SE'],
          }),
        });

        const data = await resp.json();
        results.push({ 
          campaign: campaign.name, 
          campaignId: campaign.id,
          status: resp.status, 
          ...data 
        });
        
        console.log(`Campaign ${campaign.name}: status=${resp.status}, sent=${data?.stats?.sent || 0}`);
      } catch (err) {
        console.error(`Failed to send batch for campaign ${campaign.name}:`, err);
        results.push({ 
          campaign: campaign.name, 
          campaignId: campaign.id,
          error: (err as Error).message 
        });
      }
    }

    return new Response(JSON.stringify({ results, timestamp: new Date().toISOString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Auto-send error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
