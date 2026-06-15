// Auto-replenish leads when Gmail/AI-call automations run dry.
// Picks a country (rotates SE → UK → ES → SE...), picks a random supported city,
// creates a small finder_runs row and invokes finder-search in the background.
//
// Self-throttled: refuses to run more than once every N minutes (default 30)
// across all callers, so multiple triggers don't pile up spend.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CITIES_BY_COUNTRY: Record<string, string[]> = {
  SE: ['stockholm', 'göteborg', 'malmö', 'uppsala', 'linköping', 'örebro', 'västerås', 'helsingborg', 'jönköping', 'norrköping', 'lund', 'umeå', 'gävle', 'borås', 'karlstad', 'växjö', 'halmstad', 'sundsvall', 'eskilstuna', 'södertälje'],
  UK: ['london', 'manchester', 'birmingham', 'leeds', 'liverpool', 'bristol', 'edinburgh', 'glasgow', 'cardiff', 'brighton'],
  ES: ['madrid', 'barcelona', 'valencia', 'sevilla', 'malaga', 'marbella', 'alicante', 'palma', 'zaragoza', 'murcia'],
};

const KEYWORDS_BY_COUNTRY: Record<string, string[]> = {
  SE: ['elektriker', 'rörmokare', 'snickare', 'målare', 'städfirma', 'frisör', 'tandläkare', 'bilverkstad', 'flyttfirma', 'bygg'],
  UK: ['plumber', 'electrician', 'painter', 'cleaner', 'hairdresser', 'mechanic', 'builder', 'roofer', 'carpenter', 'gardener'],
  ES: ['fontanero', 'electricista', 'pintor', 'limpieza', 'peluquería', 'mecánico', 'reformas', 'carpintero', 'cerrajero', 'jardinería'],
};

const COUNTRY_ROTATION = ['SE', 'UK', 'ES'];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickKeywords(country: string, count = 4): string[] {
  const pool = [...(KEYWORDS_BY_COUNTRY[country] || [])];
  const out: string[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const trigger = String(body?.trigger || 'manual');
    const force = body?.force === true;

    // Throttle: don't run more than once every 30 minutes unless forced.
    const cooldownMinutes = 30;
    const { data: last } = await supabase
      .from('finder_runs')
      .select('id, created_at, batch_label')
      .ilike('batch_label', 'auto-replenish%')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!force && last?.created_at) {
      const ageMs = Date.now() - new Date(last.created_at).getTime();
      if (ageMs < cooldownMinutes * 60 * 1000) {
        return new Response(JSON.stringify({
          skipped: true,
          reason: 'cooldown',
          lastRunAt: last.created_at,
          cooldownMinutes,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Pick the next country in rotation based on last run.
    let nextCountry = body?.country as string | undefined;
    if (!nextCountry) {
      const lastCountryMatch = String(last?.batch_label || '').match(/auto-replenish-(SE|UK|ES)/i);
      const lastCountry = lastCountryMatch?.[1]?.toUpperCase() || COUNTRY_ROTATION[COUNTRY_ROTATION.length - 1];
      const idx = COUNTRY_ROTATION.indexOf(lastCountry);
      nextCountry = COUNTRY_ROTATION[(idx + 1) % COUNTRY_ROTATION.length];
    }
    nextCountry = String(nextCountry).toUpperCase();
    if (!CITIES_BY_COUNTRY[nextCountry]) nextCountry = 'SE';

    const city = body?.city || pickRandom(CITIES_BY_COUNTRY[nextCountry]);
    const keywords: string[] = Array.isArray(body?.keywords) && body.keywords.length
      ? body.keywords
      : pickKeywords(nextCountry, 4);

    const findGmailOnly = body?.findGmailOnly !== false; // default true
    const maxPages = Math.max(1, Math.min(5, Number(body?.maxPages) || 1));
    const maxCandidates = Math.max(10, Math.min(2000, Number(body?.maxCandidates) || 30));
    const maxDetails = Math.max(10, Math.min(2000, Number(body?.maxDetails) || 30));
    const radius = Math.max(1000, Math.min(30000, Number(body?.radius) || 15000));
    const requirePhone = body?.requirePhone === true;
    const minRating = Number.isFinite(Number(body?.minRating)) ? Number(body.minRating) : null;
    const minReviews = Number.isFinite(Number(body?.minReviews)) ? Number(body.minReviews) : null;
    const maxReviews = Number.isFinite(Number(body?.maxReviews)) ? Number(body.maxReviews) : null;

    // Create finder_runs row
    const batchLabel = `auto-replenish-${nextCountry}-${trigger}`;
    const { data: run, error: runErr } = await supabase.from('finder_runs').insert({
      city,
      mode: requirePhone ? 'call' : 'gmail',
      keywords,
      radius,
      max_pages: maxPages,
      max_candidates: maxCandidates,
      max_details: maxDetails,
      min_rating: minRating,
      min_reviews: minReviews,
      require_phone: requirePhone,
      status: 'pending',
      stats: {},
      batch_label: batchLabel,
    } as any).select().single();
    if (runErr) throw runErr;

    // Fire-and-forget invocation of finder-search so this function returns quickly.
    const url = `${supabaseUrl}/functions/v1/finder-search`;
    const payload: Record<string, unknown> = {
      runId: (run as any).id,
      city,
      keywords,
      radius,
      maxPages,
      maxCandidates,
      maxDetails,
      requirePhone,
      findGmailOnly,
      action: 'search',
    };
    if (minRating !== null) payload.minRating = minRating;
    if (minReviews !== null) payload.minReviews = minReviews;
    if (maxReviews !== null) payload.maxReviews = maxReviews;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    };

    // EdgeRuntime.waitUntil keeps the request alive after the response is sent.
    const task = fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) })
      .then(async (r) => {
        if (!r.ok) {
          const text = await r.text().catch(() => '');
          await supabase.from('finder_runs').update({
            status: 'failed',
            stats: { error: 'replenish_invoke_failed', status: r.status, body: text.slice(0, 500) },
          } as any).eq('id', (run as any).id);
          return;
        }
        // Once finder-search returns, immediately re-queue the originating job
        // so newly discovered leads get used right away instead of waiting for cron.
        const requeueTarget = trigger === 'ai_calls_empty'
          ? 'auto-start-ai-calls-daily'
          : (trigger === 'gmail_empty' ? 'auto-send-gmail-daily' : null);
        if (requeueTarget) {
          await fetch(`${supabaseUrl}/functions/v1/${requeueTarget}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ source: 'auto-replenish-requeue' }),
          }).catch(() => {});
        }
      })
      .catch(async (e) => {
        await supabase.from('finder_runs').update({
          status: 'failed',
          stats: { error: 'replenish_invoke_threw', message: String(e?.message || e) },
        } as any).eq('id', (run as any).id);
      });
    try {
      // @ts-ignore - EdgeRuntime is available in Supabase edge runtime.
      EdgeRuntime?.waitUntil?.(task);
    } catch (_) { /* noop */ }

    await supabase.from('app_notifications').insert({
      type: 'finder_auto_replenish',
      title: 'Auto-replenish started',
      message: `Searching ${city} (${nextCountry}) for ${keywords.length} niches because ${trigger}.`,
      payload: { runId: (run as any).id, country: nextCountry, city, keywords, trigger, findGmailOnly },
    });

    return new Response(JSON.stringify({
      success: true,
      runId: (run as any).id,
      country: nextCountry,
      city,
      keywords,
      trigger,
      findGmailOnly,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('auto-finder-replenish error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'unknown',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
