/* eslint-disable @typescript-eslint/no-explicit-any */
// Auto-replenish partner prospects when partner Gmail supply is low.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CITIES_BY_COUNTRY: Record<string, string[]> = {
  SE: ['stockholm', 'gothenburg', 'malmo', 'uppsala', 'helsingborg', 'lund', 'eskilstuna', 'halmstad', 'karlstad', 'sundsvall', 'kristianstad', 'kalmar', 'visby', 'falun'],
  UK: ['london', 'manchester', 'birmingham', 'leeds', 'bristol'],
  ES: ['madrid', 'barcelona', 'valencia', 'sevilla', 'malaga'],
};

const KEYWORDS_BY_COUNTRY: Record<string, string[]> = {
  SE: [
    'foretagstelefoni',
    'telefonvaxel foretag',
    'molnvaxel',
    'voip foretag',
    'webbyra',
    'digital marknadsforingsbyra',
    'it konsult foretag',
    'natverksinstallation foretag',
  ],
  UK: [
    'business telecom provider',
    'business phone systems',
    'cloud pbx provider',
    'voip provider',
    'web design agency',
    'digital marketing agency',
    'business IT installer',
    'IT consultant business',
  ],
  ES: [
    'telecomunicaciones empresas',
    'telefonia empresas',
    'centralita virtual',
    'voip empresas',
    'agencia marketing digital',
    'agencia web',
    'consultor informatico empresas',
  ],
};

function pickRandom<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function normalizeWebsite(value?: string | null) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
}

function normalizeEmail(value?: string | null) {
  return String(value || '').trim().toLowerCase() || null;
}

function classifyPartner(candidate: any) {
  const text = [candidate.name, candidate.category, candidate.website, candidate.address].filter(Boolean).join(' ').toLowerCase();
  if (/(voip|pbx|molnvaxel|vaxel|centralita|cloud phone)/i.test(text)) return { type: 'pbx_voip', score: 82, reason: 'Phone-system fit' };
  if (/(telecom|telekom|telefoni|telefon|carrier)/i.test(text)) return { type: 'telecom', score: 80, reason: 'Telecom channel fit' };
  if (/(agency|byra|bureau|marketing|seo|web design|webbyra)/i.test(text)) return { type: 'agency_marketer', score: 76, reason: 'Agency client-channel fit' };
  if (/(install|installation|network|natverk|redes)/i.test(text)) return { type: 'installer', score: 72, reason: 'Installer handoff fit' };
  return { type: 'consultant', score: 66, reason: 'Potential B2B service partner' };
}

async function upsertPartner(supabase: any, candidate: any, input: { city: string; country: string }) {
  const email = normalizeEmail(candidate.email);
  const website = normalizeWebsite(candidate.website);
  if (!email && !website && !candidate.phone) return { skipped: true };
  const fit = classifyPartner(candidate);
  let existing: any = null;
  if (email) {
    const { data } = await supabase.from('partner_prospects').select('*').eq('email', email).maybeSingle();
    existing = data || null;
  }
  if (!existing && website) {
    const { data } = await supabase.from('partner_prospects').select('*').eq('website', website).maybeSingle();
    existing = data || null;
  }
  const payload = {
    name: candidate.name,
    website,
    email,
    phone: candidate.phone || null,
    country: input.country,
    city: input.city,
    address: candidate.address || null,
    partner_type: fit.type,
    status: email ? 'ready_to_contact' : 'researching',
    fit_score: fit.score,
    fit_reason: fit.reason,
    source_url: candidate.maps_url || null,
    source: 'auto_partner_finder',
    updated_at: new Date().toISOString(),
  };
  if (existing) {
    const { error } = await supabase.from('partner_prospects').update({
      ...payload,
      status: existing.status === 'contacted' ? existing.status : payload.status,
    }).eq('id', existing.id);
    if (error) throw error;
    return { updated: true };
  }
  const { error } = await supabase.from('partner_prospects').insert(payload);
  if (error) throw error;
  return { created: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const { requireCronServiceOrUserJwt } = await import('../_shared/auth.ts');
  const authFail = await requireCronServiceOrUserJwt(req, corsHeaders);
  if (authFail) return authFail;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;
    const trigger = String(body?.trigger || 'manual');
    const targetReady = Math.max(20, Math.min(1000, Number(body?.targetReady) || 140));

    const { count: readyCount } = await supabase
      .from('partner_prospects')
      .select('id', { count: 'exact', head: true })
      .not('email', 'is', null)
      .neq('email', '')
      .eq('do_not_contact', false)
      .not('status', 'in', '(contacted,replied,partner_call_booked,qualified,not_fit,do_not_contact)');

    if (!force && (readyCount || 0) >= targetReady) {
      return new Response(JSON.stringify({ skipped: true, reason: 'supply_ok', readyCount, targetReady }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: lastRun } = await supabase
      .from('finder_runs')
      .select('id, created_at, batch_label')
      .ilike('batch_label', 'partner-auto-replenish%')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!force && lastRun?.created_at && Date.now() - new Date(lastRun.created_at).getTime() < 25 * 60 * 1000) {
      return new Response(JSON.stringify({ skipped: true, reason: 'cooldown', lastRunAt: lastRun.created_at, readyCount, targetReady }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const country = String(body?.country || 'SE').toUpperCase();
    const selectedCountry = CITIES_BY_COUNTRY[country] ? country : 'SE';
    const city = String(body?.city || pickRandom(CITIES_BY_COUNTRY[selectedCountry]));
    const keywords = Array.isArray(body?.keywords) && body.keywords.length
      ? body.keywords.slice(0, 12)
      : KEYWORDS_BY_COUNTRY[selectedCountry].slice(0, 8);
    const maxCandidates = Math.max(50, Math.min(500, Number(body?.maxCandidates) || 260));
    const maxDetails = Math.max(50, Math.min(300, Number(body?.maxDetails) || 160));

    const { data: run, error: runError } = await supabase.from('finder_runs').insert({
      city,
      mode: 'partner_acquisition',
      keywords,
      radius: Math.max(3000, Math.min(30000, Number(body?.radius) || 9000)),
      max_pages: Math.max(1, Math.min(4, Number(body?.maxPages) || 2)),
      max_candidates: maxCandidates,
      max_details: maxDetails,
      min_rating: 3,
      min_reviews: 0,
      require_phone: false,
      status: 'pending',
      stats: {},
      batch_label: `partner-auto-replenish-${selectedCountry}-${trigger}`,
    } as any).select().single();
    if (runError) throw runError;

    const searchResp = await fetch(`${supabaseUrl}/functions/v1/finder-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
      body: JSON.stringify({
        runId: run.id,
        action: 'search',
        city,
        keywords,
        radius: 9000,
        maxPages: 2,
        maxCandidates,
        maxDetails,
        minRating: 3,
        minReviews: 0,
        requirePhone: false,
      }),
    });
    const searchData = await searchResp.json().catch(() => ({}));
    if (!searchResp.ok) throw new Error(searchData?.error || `finder-search failed ${searchResp.status}`);

    const { data: candidates, error: candidatesError } = await supabase
      .from('finder_candidates')
      .select('*')
      .eq('run_id', run.id)
      .limit(1000);
    if (candidatesError) throw candidatesError;

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let emailFound = 0;

    for (const candidate of candidates || []) {
      const saved = await upsertPartner(supabase, candidate, { city, country: selectedCountry });
      if (saved.created) created++;
      else if (saved.updated) updated++;
      else skipped++;
    }

    const scrapeTargets = (candidates || []).filter((candidate: any) => candidate.website && !candidate.email).slice(0, 80);
    for (let i = 0; i < scrapeTargets.length; i += 4) {
      const slice = scrapeTargets.slice(i, i + 4);
      const scrapeResp = await fetch(`${supabaseUrl}/functions/v1/scrape-emails`, {
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
      const scrapeData = await scrapeResp.json().catch(() => ({}));
      if (!scrapeResp.ok) continue;
      for (const result of scrapeData?.results || []) {
        const email = result?.email || result?.emails?.[0];
        if (!email) continue;
        const candidate = scrapeTargets.find((item: any) => item.id === result.leadId);
        if (!candidate) continue;
        candidate.email = email;
        await supabase.from('finder_candidates').update({ email } as any).eq('id', candidate.id);
        const saved = await upsertPartner(supabase, candidate, { city, country: selectedCountry });
        emailFound++;
        if (saved.created) created++;
        else if (saved.updated) updated++;
      }
    }

    const { count: nextReady } = await supabase
      .from('partner_prospects')
      .select('id', { count: 'exact', head: true })
      .not('email', 'is', null)
      .neq('email', '')
      .eq('do_not_contact', false)
      .not('status', 'in', '(contacted,replied,partner_call_booked,qualified,not_fit,do_not_contact)');

    await supabase.from('app_notifications').insert({
      type: 'partner_finder_auto_replenish',
      title: 'Partner supply replenished',
      message: `Found ${emailFound} partner emails. Ready partner supply is now ${nextReady || 0}.`,
      payload: { runId: run.id, trigger, city, country: selectedCountry, created, updated, skipped, emailFound, readyBefore: readyCount || 0, readyAfter: nextReady || 0 },
    });

    return new Response(JSON.stringify({
      success: true,
      runId: run.id,
      trigger,
      city,
      country: selectedCountry,
      created,
      updated,
      skipped,
      emailFound,
      readyBefore: readyCount || 0,
      readyAfter: nextReady || 0,
      search: searchData,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('auto-partner-finder-replenish error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
