import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type ScheduledBatch = {
  id: string;
  at: string;
  countries: string[];
  batchSize?: number;
};

function parseScheduledBatches(value: string | null): ScheduledBatch[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is ScheduledBatch => {
      return !!item
        && typeof item.id === 'string'
        && typeof item.at === 'string'
        && Array.isArray(item.countries);
    });
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { requireCronOrService } = await import('../_shared/auth.ts');
  const authFail = requireCronOrService(req, corsHeaders);
  if (authFail) return authFail;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const dbClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: settingsRows, error: settingsError } = await dbClient
      .from('settings')
      .select('key, value')
      .like('key', 'campaign_schedule_%');

    if (settingsError) throw settingsError;

    if (!settingsRows?.length) {
      return new Response(JSON.stringify({ processed: 0, remaining: 0, message: 'No scheduled batches found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const nowMs = Date.now();
    let processed = 0;
    let failed = 0;
    let remaining = 0;

    for (const row of settingsRows) {
      const campaignId = row.key.replace('campaign_schedule_', '');
      if (!campaignId) continue;

      const batches = parseScheduledBatches(row.value);
      const pending: ScheduledBatch[] = [];

      for (const batch of batches) {
        const scheduledMs = new Date(batch.at).getTime();
        if (Number.isNaN(scheduledMs)) continue;

        if (scheduledMs > nowMs) {
          pending.push(batch);
          continue;
        }

        try {
          const body: Record<string, unknown> = {
            campaignId,
            countries: batch.countries?.length ? batch.countries : ['SE'],
          };

          if (batch.batchSize && Number(batch.batchSize) > 0) {
            body.batchSize = Number(batch.batchSize);
          }

          const response = await fetch(`${supabaseUrl}/functions/v1/send-campaign-batch`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify(body),
          });

          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload?.error) {
            failed++;
            pending.push(batch);
            console.error(`Scheduled batch failed for campaign ${campaignId}`, payload?.error || response.statusText);
            continue;
          }

          processed++;
        } catch (err) {
          failed++;
          pending.push(batch);
          console.error(`Scheduled batch exception for campaign ${campaignId}:`, err);
        }
      }

      remaining += pending.length;
      if (pending.length === 0) {
        await dbClient.from('settings').delete().eq('key', row.key);
      } else {
        await dbClient.from('settings').update({ value: JSON.stringify(pending) }).eq('key', row.key);
      }
    }

    return new Response(JSON.stringify({ processed, failed, remaining }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('process-scheduled-batches error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
