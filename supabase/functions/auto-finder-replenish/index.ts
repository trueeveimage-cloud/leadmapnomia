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

function sectionFor(candidate: any, email?: string | null) {
  const hasPhone = !!String(candidate?.phone || '').trim();
  const hasEmail = !!String(email || candidate?.email || '').trim();
  if (hasPhone && hasEmail) return 'both';
  if (hasEmail) return 'email';
  if (hasPhone) return 'phone';
  return 'missing';
}

async function findDuplicateLead(supabase: any, candidate: any) {
  if (candidate.place_id) {
    const { data } = await supabase.from('leads').select('*').eq('place_id', candidate.place_id).maybeSingle();
    if (data) return data;
  }
  if (candidate.name && candidate.address) {
    const normName = String(candidate.name).toLowerCase().trim();
    const normAddr = String(candidate.address).toLowerCase().trim().slice(0, 50);
    const { data } = await supabase
      .from('leads')
      .select('*')
      .ilike('name', normName)
      .ilike('address', `${normAddr}%`)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

async function promoteCandidateLead(
  supabase: any,
  candidate: any,
  input: { city: string; country: string; keywords: string[]; email?: string | null; emailSource?: string | null },
) {
  const email = input.email || candidate.email || null;
  if (!candidate.phone && !email) return { added: 0, updated: 0 };

  const duplicate = await findDuplicateLead(supabase, candidate);
  const nicheText = candidate.category?.split(',')[0]?.trim() || input.keywords[0] || null;
  const basePatch: Record<string, unknown> = {
    place_id: candidate.place_id,
    maps_url: candidate.maps_url,
    name: candidate.name,
    category: candidate.category,
    niche_label: nicheText,
    detected_niche: input.keywords.join(', '),
    rating: candidate.rating,
    reviews_count: candidate.reviews_count,
    phone: candidate.phone,
    email,
    address: candidate.address,
    city: input.city,
    country: input.country,
    website: candidate.website,
    section: sectionFor(candidate, email),
    status: 'not_contacted',
    email_source: email ? (input.emailSource || 'website_scrape') : null,
    product: 'leadmap',
    lead_tier: 'A',
    potential_score: 78,
    why_good_lead: `Auto-found ${input.country} ${input.keywords.join(' / ')} lead with public contact data.`,
  };

  if (duplicate) {
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(basePatch)) {
      if (value !== null && value !== undefined && value !== '' && !duplicate[key]) patch[key] = value;
    }
    if (email && !duplicate.email) {
      patch.email = email;
      patch.email_source = input.emailSource || 'website_scrape';
    }
    if (candidate.phone && !duplicate.phone) patch.phone = candidate.phone;
    if (Object.keys(patch).length === 0) return { added: 0, updated: 0 };
    patch.section = sectionFor({ phone: patch.phone || duplicate.phone, email: patch.email || duplicate.email });
    await supabase.from('leads').update(patch).eq('id', duplicate.id);
    return { added: 0, updated: 1 };
  }

  await supabase.from('leads').insert(basePatch as any);
  return { added: 1, updated: 0 };
}

async function scrapeAndPromoteCandidates(
  supabase: any,
  supabaseUrl: string,
  serviceKey: string,
  input: { runId: string; city: string; country: string; keywords: string[] },
) {
  const { data: candidates } = await supabase
    .from('finder_candidates')
    .select('*')
    .eq('run_id', input.runId);

  const allCandidates = candidates || [];
  let checked = 0;
  let found = 0;
  let added = 0;
  let updated = 0;

  for (const candidate of allCandidates) {
    const result = await promoteCandidateLead(supabase, candidate, input);
    added += result.added;
    updated += result.updated;
  }

  const websiteCandidates = allCandidates.filter((candidate: any) => candidate.website && !candidate.email);
  for (let i = 0; i < websiteCandidates.length; i += 4) {
    const slice = websiteCandidates.slice(i, i + 4);
    checked += slice.length;
    const resp = await fetch(`${supabaseUrl}/functions/v1/scrape-emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
      body: JSON.stringify({
        urls: slice.map((candidate: any) => ({
          leadId: candidate.id,
          website: candidate.website,
          businessName: candidate.name,
        })),
      }),
    });
    const data = await resp.json().catch(() => ({}));
    for (const item of data?.results || []) {
      const candidate = slice.find((row: any) => row.id === item.leadId);
      const email = item?.email || item?.emails?.[0];
      if (!candidate || !email) continue;
      found += 1;
      await supabase.from('finder_candidates').update({ email } as any).eq('id', candidate.id);
      const result = await promoteCandidateLead(supabase, candidate, {
        ...input,
        email,
        emailSource: item.source || 'website_scrape',
      });
      added += result.added;
      updated += result.updated;
    }
  }

  const { data: run } = await supabase.from('finder_runs').select('stats').eq('id', input.runId).maybeSingle();
  await supabase.from('finder_runs').update({
    stats: {
      ...(run?.stats || {}),
      emailScrapeChecked: checked,
      emailsFound: found,
      promotedLeadsAdded: added,
      promotedLeadsUpdated: updated,
    },
  } as any).eq('id', input.runId);

  return { checked, found, added, updated };
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
        const promotion = await scrapeAndPromoteCandidates(supabase, supabaseUrl, serviceKey, {
          runId: (run as any).id,
          city,
          country: nextCountry,
          keywords,
        });
        await supabase.from('app_notifications').insert({
          type: 'finder_auto_replenish',
          title: 'Auto-replenish email scrape finished',
          message: `${promotion.found} emails found; ${promotion.added} leads added and ${promotion.updated} leads updated.`,
          payload: { runId: (run as any).id, country: nextCountry, city, keywords, ...promotion },
        });

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
