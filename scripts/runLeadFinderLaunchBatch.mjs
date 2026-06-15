import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import crypto from 'node:crypto';

const TARGETS = {
  SE: { emails: 100, phones: 15 },
  UK: { emails: 10, phones: 0 },
  ES: { emails: 10, phones: 0 },
};

const NICHE_PLANS = {
  emergency_trades: {
    label: 'VVS and emergency trades',
    detectedNiche: 'plumber',
    terms: ['vvs', 'ror', 'rormokare', 'plumber', 'locksmith', 'tak', 'roof', 'water damage', 'vattenskada'],
    SE: ['vvs jour', 'rormokare jour', 'rormokare', 'vattenskada'],
    UK: ['emergency plumber', 'emergency locksmith'],
    ES: ['fontanero 24 horas', 'cerrajero 24 horas'],
  },
  dental: {
    label: 'Dental clinics',
    detectedNiche: 'dental',
    terms: ['dental', 'dentist', 'tand', 'tandlakare', 'clinica dental', 'dentista'],
    SE: ['tandlakare', 'tandklinik', 'implantat tandlakare'],
    UK: ['dental clinic', 'dentist'],
    ES: ['clinica dental', 'dentista'],
  },
  electricians: {
    label: 'Electricians',
    detectedNiche: 'electrician',
    terms: ['electric', 'electrician', 'elektriker', 'elinstallation', 'electricista'],
    SE: ['elektriker jour', 'elektriker', 'elinstallation'],
    UK: ['emergency electrician', 'electrician'],
    ES: ['electricista 24 horas', 'electricista'],
  },
  auto_services: {
    label: 'Auto workshops',
    detectedNiche: 'car_repair',
    terms: ['auto', 'car', 'bil', 'verkstad', 'mechanic', 'garage', 'taller', 'detailing', 'rekond'],
    SE: ['bilverkstad', 'bilrekond', 'dackverkstad'],
    UK: ['auto repair', 'car detailer'],
    ES: ['taller mecanico', 'detailing coches'],
  },
  cleaning: {
    label: 'Cleaning companies',
    detectedNiche: 'cleaning',
    terms: ['clean', 'cleaning', 'stad', 'stadning', 'hemstad', 'limpieza'],
    SE: ['stadfirma', 'hemstadning', 'flyttstadning'],
    UK: ['cleaning company', 'commercial cleaning'],
    ES: ['empresa limpieza', 'limpieza oficinas'],
  },
};

const MARKET_RUNS = {
  SE: {
    cities: ['Stockholm', 'Gothenburg', 'Malmo', 'Uppsala', 'Helsingborg', 'Lund', 'Halmstad', 'Karlstad', 'Sundsvall', 'Kristianstad', 'Kalmar', 'Varberg'],
    radius: 50000,
    maxPages: 4,
    maxCandidates: 420,
    maxDetails: 260,
    minRating: 3.0,
    minReviews: 1,
  },
  UK: {
    cities: ['London', 'Manchester', 'Birmingham'],
    radius: 40000,
    maxPages: 3,
    maxCandidates: 120,
    maxDetails: 55,
    minRating: 3.0,
    minReviews: 1,
  },
  ES: {
    cities: ['Madrid', 'Barcelona', 'Valencia'],
    radius: 40000,
    maxPages: 3,
    maxCandidates: 120,
    maxDetails: 55,
    minRating: 3.0,
    minReviews: 1,
  },
};

function loadEnv(path = '.env') {
  const out = {};
  const text = fs.readFileSync(path, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o');
}

function detectSection({ phone, email }) {
  const hasPhone = !!String(phone || '').trim();
  const hasEmail = !!String(email || '').trim();
  if (hasPhone && hasEmail) return 'both';
  if (hasEmail) return 'email';
  if (hasPhone) return 'phone';
  return 'missing';
}

function leadMatchesNiche(lead, plan) {
  const hay = normalize(`${lead.name || ''} ${lead.category || ''} ${lead.niche_label || ''} ${lead.detected_niche || ''}`);
  return plan.terms.some(term => hay.includes(normalize(term))) || normalize(lead.detected_niche) === normalize(plan.detectedNiche);
}

function scoreLead(candidate, plan, email) {
  const reviews = Number(candidate.reviews_count || 0);
  const rating = Number(candidate.rating || 0);
  const hasPhone = !!String(candidate.phone || '').trim();
  const hasEmail = !!String(email || candidate.email || '').trim();
  let score = 58;
  if (hasPhone) score += 10;
  if (hasEmail) score += 6;
  if (reviews >= 200) score += 14;
  else if (reviews >= 100) score += 10;
  else if (reviews >= 50) score += 7;
  else if (reviews >= 15) score += 4;
  else if (reviews < 5) score -= 5;
  if (rating >= 4.5) score += 8;
  else if (rating >= 4.0) score += 4;
  else if (rating > 0 && rating < 3.5) score -= 10;
  if (['plumber', 'electrician', 'dental'].includes(plan.detectedNiche)) score += 8;
  if (plan.detectedNiche === 'cleaning') score += 3;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const tier = score >= 85 ? 'S' : score >= 72 ? 'A+' : score >= 60 ? 'A' : score >= 45 ? 'B' : 'C';
  return {
    potential_score: score,
    lead_tier: tier,
    detected_niche: plan.detectedNiche,
    estimated_value: plan.detectedNiche === 'cleaning' ? 'Medium' : 'High',
    website_quality: candidate.website?.startsWith('https://') ? 'decent' : (candidate.website ? 'weak' : 'none'),
    has_emergency: ['plumber', 'electrician'].includes(plan.detectedNiche),
    why_good_lead: `${tier}-tier ${plan.label.toLowerCase()} lead with ${reviews} reviews, ${rating || 'unknown'} rating, and public contact details.`,
  };
}

async function edge(url, key, fnName, body) {
  const res = await fetch(`${url}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${fnName} failed: ${JSON.stringify(data)}`);
  return data;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeSlice(url, key, slice) {
  try {
    return await edge(url, key, 'scrape-emails', {
      urls: slice.map(candidate => ({ leadId: candidate.id, website: candidate.website, businessName: candidate.name })),
    });
  } catch (error) {
    const msg = String(error?.message || error);
    if (slice.length > 1 && /WORKER_RESOURCE_LIMIT|resource|timeout|failed/i.test(msg)) {
      const results = [];
      for (const candidate of slice) {
        try {
          await sleep(750);
          const single = await scrapeSlice(url, key, [candidate]);
          results.push(...(single.results || []));
        } catch (singleError) {
          console.log(`  scrape skipped ${candidate.name}: ${String(singleError?.message || singleError).slice(0, 160)}`);
        }
      }
      return { results };
    }
    throw error;
  }
}

async function getLeadCounts(supabase, plan) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('leads')
      .select('id,name,category,niche_label,detected_niche,email,phone,country,product,lead_tier,outreach_opt_out,do_not_contact,status')
      .eq('product', 'leadmap')
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  const usableTier = lead => ['S', 'A+', 'A'].includes(String(lead.lead_tier || ''));
  const allowed = lead => !lead.outreach_opt_out && !lead.do_not_contact && lead.status !== 'contacted';
  const matching = all.filter(lead => leadMatchesNiche(lead, plan) && allowed(lead));
  return {
    SE: {
      emails: matching.filter(lead => lead.country === 'SE' && lead.email && usableTier(lead)).length,
      phones: matching.filter(lead => lead.country === 'SE' && lead.phone).length,
    },
    UK: { emails: matching.filter(lead => lead.country === 'UK' && lead.email && usableTier(lead)).length, phones: 0 },
    ES: { emails: matching.filter(lead => lead.country === 'ES' && lead.email && usableTier(lead)).length, phones: 0 },
  };
}

async function createFinderRun(supabase, def, batchId, batchLabel) {
  const { data, error } = await supabase.from('finder_runs').insert({
    city: def.city,
    mode: 'launch_week_niche',
    keywords: def.keywords,
    radius: def.radius,
    max_pages: def.maxPages,
    max_candidates: def.maxCandidates,
    max_details: def.maxDetails,
    min_rating: def.minRating,
    min_reviews: def.minReviews,
    require_phone: false,
    status: 'pending',
    stats: {},
    batch_id: batchId,
    batch_label: batchLabel,
  }).select().single();
  if (error) throw error;
  return data;
}

async function hasRecentFinderRun(supabase, def, plan) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('finder_runs')
    .select('id,status')
    .eq('city', def.city)
    .eq('mode', 'launch_week_niche')
    .ilike('batch_label', `%${plan.label}%`)
    .gte('created_at', since.toISOString())
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

async function findDuplicate(supabase, candidate) {
  if (candidate.place_id) {
    const { data, error } = await supabase.from('leads').select('*').eq('place_id', candidate.place_id).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  if (candidate.name && candidate.address) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .ilike('name', candidate.name.trim())
      .ilike('address', `${candidate.address.trim().slice(0, 50)}%`)
      .limit(1);
    if (error) throw error;
    return data?.[0] || null;
  }
  return null;
}

async function saveCandidateLead(supabase, candidate, plan, country, city, email = null, emailSource = null) {
  const nextEmail = email || candidate.email || null;
  if (!candidate.phone && !nextEmail) return { status: 'skipped' };
  const score = scoreLead(candidate, plan, nextEmail);
  const duplicate = await findDuplicate(supabase, candidate);
  const patch = {
    phone: candidate.phone || duplicate?.phone || null,
    email: nextEmail || duplicate?.email || null,
    address: candidate.address || duplicate?.address || null,
    website: candidate.website || duplicate?.website || null,
    city: duplicate?.city || city,
    country: duplicate?.country || country,
    category: candidate.category || duplicate?.category || null,
    niche_label: plan.label,
    product: 'leadmap',
    section: detectSection({ phone: candidate.phone || duplicate?.phone, email: nextEmail || duplicate?.email }),
    email_source: nextEmail ? (emailSource || duplicate?.email_source || 'website_scrape') : duplicate?.email_source || null,
    ...score,
  };
  if (duplicate) {
    const { error } = await supabase.from('leads').update(patch).eq('id', duplicate.id);
    if (error) throw error;
    return { status: 'updated', id: duplicate.id };
  }
  const { data, error } = await supabase.from('leads').insert({
    place_id: candidate.place_id,
    maps_url: candidate.maps_url,
    name: candidate.name,
    rating: candidate.rating,
    reviews_count: candidate.reviews_count || 0,
    status: 'not_contacted',
    tags: [],
    needs_call: country === 'SE' && !!candidate.phone,
    ...patch,
  }).select('id').single();
  if (error) throw error;
  return { status: 'added', id: data.id };
}

async function scrapeAndSave(supabase, url, key, candidates, plan, country, city, targetEmailCount) {
  let checked = 0;
  let found = 0;
  let added = 0;
  let updated = 0;

  for (const candidate of candidates) {
    const result = await saveCandidateLead(supabase, candidate, plan, country, city);
    if (result.status === 'added') added++;
    if (result.status === 'updated') updated++;
  }

  const scrapePool = candidates.filter(candidate => candidate.website && !candidate.email);
  for (let i = 0; i < scrapePool.length; i += 4) {
    const currentCounts = await getLeadCounts(supabase, plan);
    if (currentCounts[country]?.emails >= targetEmailCount) break;
    const slice = scrapePool.slice(i, i + 4);
    let data;
    try {
      data = await scrapeSlice(url, key, slice);
    } catch (error) {
      console.log(`  scrape batch skipped: ${String(error?.message || error).slice(0, 180)}`);
      checked += slice.length;
      continue;
    }
    const results = data.results || [];
    for (const result of results) {
      const candidate = slice.find(item => item.id === result.leadId);
      const email = result.email || result.emails?.[0] || null;
      if (!candidate || !email) continue;
      found++;
      await supabase.from('finder_candidates').update({ email }).eq('id', candidate.id);
      const saved = await saveCandidateLead(supabase, candidate, plan, country, city, email, result.source || 'website_scrape');
      if (saved.status === 'added') added++;
      if (saved.status === 'updated') updated++;
    }
    checked += slice.length;
    if (checked % 24 === 0) {
      console.log(`  ${country} scraped ${checked}/${scrapePool.length}, found=${found}, added=${added}, updated=${updated}`);
    }
  }
  return { checked, found, added, updated };
}

async function runOneNiche(supabase, url, key, nicheKey) {
  const plan = NICHE_PLANS[nicheKey];
  if (!plan) throw new Error(`Unknown niche "${nicheKey}". Options: ${Object.keys(NICHE_PLANS).join(', ')}`);
  const batchId = crypto.randomUUID();
  const batchLabel = `Launch week stock - ${plan.label} - ${new Date().toISOString().slice(0, 10)}`;
  console.log(`\n=== ${plan.label} ===`);
  console.log(`batch_id=${batchId}`);

  const before = await getLeadCounts(supabase, plan);
  console.log(`before=${JSON.stringify(before)}`);

  for (const country of ['SE', 'UK', 'ES']) {
    const target = TARGETS[country];
    const initialCount = before[country];
    if (initialCount.emails >= target.emails && (!target.phones || initialCount.phones >= target.phones)) {
      console.log(`${country}: target already met; skipping search.`);
      continue;
    }

    const market = MARKET_RUNS[country];
    for (const city of market.cities) {
      const currentCounts = await getLeadCounts(supabase, plan);
      const count = currentCounts[country];
      if (count.emails >= target.emails && (!target.phones || count.phones >= target.phones)) {
        console.log(`${country}: target met at ${JSON.stringify(count)}; stopping ${country} expansion.`);
        break;
      }

      const def = { ...market, city, country, keywords: plan[country] };
      delete def.cities;
      const recent = await hasRecentFinderRun(supabase, def, plan);
      if (recent) {
        console.log(`${country}: reusing ${city}; already ran today (${recent.id}, ${recent.status}).`);
        const { data: candidates, error } = await supabase
          .from('finder_candidates')
          .select('*')
          .eq('run_id', recent.id)
          .order('reviews_count', { ascending: false, nullsFirst: false });
        if (error) throw error;
        if (candidates?.length) {
          const scrapeStats = await scrapeAndSave(supabase, url, key, candidates, plan, country, def.city, target.emails);
          console.log(`${country}: reused scrape/save=${JSON.stringify(scrapeStats)}`);
        }
        continue;
      }

      const run = await createFinderRun(supabase, def, batchId, batchLabel);
      console.log(`${country}: run=${run.id} city=${def.city} keywords=${def.keywords.join('|')}`);

      const result = await edge(url, key, 'finder-search', {
        action: 'search',
        runId: run.id,
        city: def.city,
        keywords: def.keywords,
        radius: def.radius,
        maxPages: def.maxPages,
        maxCandidates: def.maxCandidates,
        maxDetails: def.maxDetails,
        minRating: def.minRating,
        minReviews: def.minReviews,
        requirePhone: false,
      });
      console.log(`${country}: search done ${JSON.stringify(result.stats || result).slice(0, 400)}`);

      const { data: candidates, error } = await supabase
        .from('finder_candidates')
        .select('*')
        .eq('run_id', run.id)
        .order('reviews_count', { ascending: false, nullsFirst: false });
      if (error) throw error;
      console.log(`${country}: candidates=${candidates?.length || 0}`);

      const scrapeStats = await scrapeAndSave(supabase, url, key, candidates || [], plan, country, def.city, target.emails);
      console.log(`${country}: scrape/save=${JSON.stringify(scrapeStats)}`);
    }
  }

  const after = await getLeadCounts(supabase, plan);
  console.log(`after=${JSON.stringify(after)}`);
  return { niche: nicheKey, label: plan.label, batchId, before, after };
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing Supabase URL/key in .env');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const selected = process.argv.slice(2);
const niches = selected.length ? selected : Object.keys(NICHE_PLANS);
const summaries = [];
for (const niche of niches) {
  summaries.push(await runOneNiche(supabase, SUPABASE_URL, SUPABASE_KEY, niche));
}
console.log('\nSUMMARY');
console.log(JSON.stringify(summaries, null, 2));
