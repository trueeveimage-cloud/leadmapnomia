import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const HARD_COST_CAP_USD = 280;
const TEXT_SEARCH_COST = 0.032;
const DETAIL_COST = 0.017;
const DEFAULT_BUDGET_START_DATE = '2026-06-01';

type BudgetTracker = {
  cap: number;
  baseSpent: number;
  textSearchRequests: number;
  detailRequests: number;
  exhausted: boolean;
  reserveTextSearch: () => boolean;
  reserveDetail: () => boolean;
  spent: () => number;
  remaining: () => number;
  stats: () => Record<string, number | boolean>;
};

interface SearchRequest {
  runId: string;
  city: string;
  keywords: string[];
  radius: number;
  maxPages: number;
  maxCandidates: number;
  maxDetails: number;
  minRating?: number;
  minReviews?: number;
  maxReviews?: number;
  requirePhone: boolean;
  findGmailOnly?: boolean;
  action: 'search' | 'details' | 'estimate' | 'resume' | 'refetch';
}

function costFor(textSearchRequests: number, detailRequests: number) {
  return (textSearchRequests * TEXT_SEARCH_COST) + (detailRequests * DETAIL_COST);
}

function createBudgetTracker(baseSpent: number, cap: number): BudgetTracker {
  const budget: BudgetTracker = {
    cap,
    baseSpent,
    textSearchRequests: 0,
    detailRequests: 0,
    exhausted: false,
    reserveTextSearch() {
      if (this.spent() + TEXT_SEARCH_COST > this.cap) {
        this.exhausted = true;
        return false;
      }
      this.textSearchRequests += 1;
      return true;
    },
    reserveDetail() {
      if (this.spent() + DETAIL_COST > this.cap) {
        this.exhausted = true;
        return false;
      }
      this.detailRequests += 1;
      return true;
    },
    spent() {
      return this.baseSpent + costFor(this.textSearchRequests, this.detailRequests);
    },
    remaining() {
      return Math.max(0, this.cap - this.spent());
    },
    stats() {
      return {
        apiSpendCapUsd: this.cap,
        apiSpendBeforeRunUsd: Number(this.baseSpent.toFixed(2)),
        runTextSearchRequests: this.textSearchRequests,
        runDetailRequests: this.detailRequests,
        runCostUsd: Number(costFor(this.textSearchRequests, this.detailRequests).toFixed(2)),
        totalCostUsd: Number(this.spent().toFixed(2)),
        budgetRemainingUsd: Number(this.remaining().toFixed(2)),
        budgetExhausted: this.exhausted,
      };
    },
  };
  return budget;
}

function budgetStartIso(value?: string | null) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  // ─── SWEDEN ───
  'göteborg': { lat: 57.7089, lng: 11.9746 },
  'gothenburg': { lat: 57.7089, lng: 11.9746 },
  'malmö': { lat: 55.6050, lng: 13.0038 },
  'malmo': { lat: 55.6050, lng: 13.0038 },
  'stockholm': { lat: 59.3293, lng: 18.0686 },
  'uppsala': { lat: 59.8586, lng: 17.6389 },
  'linköping': { lat: 58.4108, lng: 15.6214 },
  'västerås': { lat: 59.6099, lng: 16.5448 },
  'örebro': { lat: 59.2753, lng: 15.2134 },
  'helsingborg': { lat: 56.0465, lng: 12.6945 },
  'norrköping': { lat: 58.5942, lng: 16.1826 },
  'jönköping': { lat: 57.7826, lng: 14.1618 },
  'lund': { lat: 55.7047, lng: 13.1910 },
  'umeå': { lat: 63.8258, lng: 20.2630 },
  'gävle': { lat: 60.6749, lng: 17.1413 },
  'borås': { lat: 57.7210, lng: 12.9401 },
  'södertälje': { lat: 59.1955, lng: 17.6253 },
  'eskilstuna': { lat: 59.3666, lng: 16.5077 },
  'halmstad': { lat: 56.6745, lng: 12.8578 },
  'växjö': { lat: 56.8777, lng: 14.8091 },
  'karlstad': { lat: 59.3793, lng: 13.5036 },
  'sundsvall': { lat: 62.3908, lng: 17.3069 },
  'luleå': { lat: 65.5848, lng: 22.1547 },
  'trollhättan': { lat: 58.2837, lng: 12.2886 },
  'östersund': { lat: 63.1767, lng: 14.6361 },
  'kristianstad': { lat: 56.0294, lng: 14.1567 },
  'kalmar': { lat: 56.6634, lng: 16.3566 },
  'skövde': { lat: 58.3869, lng: 13.8458 },
  'visby': { lat: 57.6349, lng: 18.2948 },
  'falun': { lat: 60.6065, lng: 15.6355 },
  'nyköping': { lat: 58.7530, lng: 17.0086 },
  'varberg': { lat: 57.1058, lng: 12.2508 },
  'karlskrona': { lat: 56.1612, lng: 15.5869 },
  'skellefteå': { lat: 64.7507, lng: 20.9528 },
  'uddevalla': { lat: 58.3520, lng: 11.9385 },
  'motala': { lat: 58.5369, lng: 15.0402 },
  'landskrona': { lat: 55.8709, lng: 12.8303 },
  'lidköping': { lat: 58.5055, lng: 13.1573 },
  'enköping': { lat: 59.6354, lng: 17.0773 },
  'kiruna': { lat: 67.8558, lng: 20.2253 },
  'ystad': { lat: 55.4295, lng: 13.8200 },
  'piteå': { lat: 65.3174, lng: 21.4797 },
  'mora': { lat: 61.0064, lng: 14.5430 },
  'katrineholm': { lat: 58.9960, lng: 16.2079 },
  'borlänge': { lat: 60.4858, lng: 15.4365 },
  'tumba': { lat: 59.1990, lng: 17.8310 },
  'norrtälje': { lat: 59.7578, lng: 18.7042 },
  'alingsås': { lat: 57.9300, lng: 12.5337 },
  'härnösand': { lat: 62.6323, lng: 17.9381 },
  'örnsköldsvik': { lat: 63.2909, lng: 18.7152 },
  'karlshamn': { lat: 56.1707, lng: 14.8619 },
  'oskarshamn': { lat: 57.2647, lng: 16.4478 },
  'värnamo': { lat: 57.1862, lng: 14.0404 },
  'köping': { lat: 59.5145, lng: 15.9933 },
  'arboga': { lat: 59.3942, lng: 15.8384 },
  'falkenberg': { lat: 56.9054, lng: 12.4913 },
  'vetlanda': { lat: 57.4289, lng: 15.0770 },
  'mariestad': { lat: 58.7095, lng: 13.8236 },
  'sala': { lat: 59.9200, lng: 16.6026 },
  'kungälv': { lat: 57.8710, lng: 11.9726 },
  'trelleborg': { lat: 55.3762, lng: 13.1574 },
  'mjölby': { lat: 58.3267, lng: 15.1317 },
  'sandviken': { lat: 60.6190, lng: 16.7758 },
  'avesta': { lat: 60.1451, lng: 16.1700 },
  'hudiksvall': { lat: 61.7272, lng: 17.1054 },
  'strängnäs': { lat: 59.3795, lng: 17.0292 },
  'bollnäs': { lat: 61.3483, lng: 16.3935 },
  'söderhamn': { lat: 61.3033, lng: 17.0586 },
  'kumla': { lat: 59.1269, lng: 15.1432 },
  'nässjö': { lat: 57.6530, lng: 14.6963 },
  'ängelholm': { lat: 56.2428, lng: 12.8622 },
  'lysekil': { lat: 58.2743, lng: 11.4352 },
  'markaryd': { lat: 56.4602, lng: 13.5953 },
  'lidingö': { lat: 59.3667, lng: 18.1500 },
  'kungsbacka': { lat: 57.4870, lng: 12.0762 },
  'partille': { lat: 57.7395, lng: 12.1065 },
  'mölndal': { lat: 57.6554, lng: 12.0134 },
  'sollentuna': { lat: 59.4281, lng: 17.9504 },
  'täby': { lat: 59.4439, lng: 18.0687 },
  'nacka': { lat: 59.3108, lng: 18.1636 },
  'haninge': { lat: 59.1740, lng: 18.1509 },
  'huddinge': { lat: 59.2372, lng: 17.9818 },
  // ─── NORWAY ───
  'oslo': { lat: 59.9139, lng: 10.7522 },
  'bergen': { lat: 60.3913, lng: 5.3221 },
  'trondheim': { lat: 63.4305, lng: 10.3951 },
  'stavanger': { lat: 58.9700, lng: 5.7331 },
  'drammen': { lat: 59.7441, lng: 10.2045 },
  'fredrikstad': { lat: 59.2181, lng: 10.9298 },
  'kristiansand': { lat: 58.1599, lng: 8.0182 },
  'sandnes': { lat: 58.8520, lng: 5.7352 },
  'tromsø': { lat: 69.6492, lng: 18.9553 },
  'bodø': { lat: 67.2804, lng: 14.4049 },
  'sandefjord': { lat: 59.1314, lng: 10.2166 },
  'sarpsborg': { lat: 59.2839, lng: 11.1094 },
  'ålesund': { lat: 62.4722, lng: 6.1495 },
  'tønsberg': { lat: 59.2672, lng: 10.4075 },
  'haugesund': { lat: 59.4138, lng: 5.2680 },
  'moss': { lat: 59.4342, lng: 10.6578 },
  'porsgrunn': { lat: 59.1405, lng: 9.6569 },
  'skien': { lat: 59.2098, lng: 9.6089 },
  'arendal': { lat: 58.4610, lng: 8.7726 },
  'gjøvik': { lat: 60.7957, lng: 10.6916 },
  'hamar': { lat: 60.7945, lng: 11.0680 },
  'lillehammer': { lat: 61.1153, lng: 10.4662 },
  'kongsberg': { lat: 59.6684, lng: 9.6520 },
  'molde': { lat: 62.7375, lng: 7.1591 },
  'harstad': { lat: 68.7985, lng: 16.5415 },
  'steinkjer': { lat: 64.0150, lng: 11.4955 },
  'elverum': { lat: 60.8813, lng: 11.5616 },
  'hønefoss': { lat: 60.1670, lng: 10.2567 },
  'narvik': { lat: 68.4385, lng: 17.4273 },
  'alta': { lat: 69.9689, lng: 23.2716 },
  'hammerfest': { lat: 70.6634, lng: 23.6821 },
  'kristiansund': { lat: 63.1106, lng: 7.7279 },
  'halden': { lat: 59.1337, lng: 11.3872 },
  'kongsvinger': { lat: 60.1943, lng: 12.0033 },
  'larvik': { lat: 59.0530, lng: 10.0270 },
  'mandal': { lat: 58.0293, lng: 7.4608 },
  'namsos': { lat: 64.4665, lng: 11.4965 },
  'sortland': { lat: 68.6932, lng: 15.4133 },
  'rana (mo i rana)': { lat: 66.3128, lng: 14.1428 },
  'mo i rana': { lat: 66.3128, lng: 14.1428 },
  // ─── DENMARK ───
  'københavn': { lat: 55.6761, lng: 12.5683 },
  'copenhagen': { lat: 55.6761, lng: 12.5683 },
  'aarhus': { lat: 56.1629, lng: 10.2039 },
  'odense': { lat: 55.4038, lng: 10.4024 },
  'aalborg': { lat: 57.0488, lng: 9.9217 },
  'esbjerg': { lat: 55.4764, lng: 8.4593 },
  'randers': { lat: 56.4607, lng: 10.0364 },
  'kolding': { lat: 55.4904, lng: 9.4722 },
  'horsens': { lat: 55.8607, lng: 9.8503 },
  'vejle': { lat: 55.7094, lng: 9.5356 },
  'roskilde': { lat: 55.6416, lng: 12.0880 },
  'herning': { lat: 56.1393, lng: 8.9735 },
  'silkeborg': { lat: 56.1694, lng: 9.5450 },
  'næstved': { lat: 55.2298, lng: 11.7610 },
  'fredericia': { lat: 55.5654, lng: 9.7520 },
  'viborg': { lat: 56.4532, lng: 9.4020 },
  'slagelse': { lat: 55.4027, lng: 11.3544 },
  'holstebro': { lat: 56.3600, lng: 8.6160 },
  'sønderborg': { lat: 54.9131, lng: 9.7928 },
  'hjørring': { lat: 57.4641, lng: 9.9822 },
  'frederikshavn': { lat: 57.4406, lng: 10.5364 },
  'helsingør': { lat: 56.0360, lng: 12.6136 },
  'hillerød': { lat: 55.9295, lng: 12.3110 },
  'holbæk': { lat: 55.7167, lng: 11.7167 },
  'køge': { lat: 55.4580, lng: 12.1820 },
  'ringsted': { lat: 55.4419, lng: 11.7903 },
  'svendborg': { lat: 55.0596, lng: 10.6070 },
  'thisted': { lat: 56.9558, lng: 8.6908 },
  'nykøbing falster': { lat: 54.7694, lng: 11.8722 },
  'haderslev': { lat: 55.2513, lng: 9.4894 },
  'skive': { lat: 56.5650, lng: 9.0330 },
  'nyborg': { lat: 55.3125, lng: 10.7903 },
  'middelfart': { lat: 55.5053, lng: 9.7314 },
  'aabenraa': { lat: 55.0444, lng: 9.4167 },
  'grenaa': { lat: 56.4156, lng: 10.8794 },

  // United Kingdom
  'london': { lat: 51.5072, lng: -0.1276 },
  'manchester': { lat: 53.4808, lng: -2.2426 },
  'birmingham': { lat: 52.4862, lng: -1.8904 },
  'leeds': { lat: 53.8008, lng: -1.5491 },
  'liverpool': { lat: 53.4084, lng: -2.9916 },
  'bristol': { lat: 51.4545, lng: -2.5879 },
  'edinburgh': { lat: 55.9533, lng: -3.1883 },
  'glasgow': { lat: 55.8642, lng: -4.2518 },
  'cardiff': { lat: 51.4816, lng: -3.1791 },
  'brighton': { lat: 50.8225, lng: -0.1372 },

  // Spain
  'madrid': { lat: 40.4168, lng: -3.7038 },
  'barcelona': { lat: 41.3874, lng: 2.1686 },
  'valencia': { lat: 39.4699, lng: -0.3763 },
  'sevilla': { lat: 37.3891, lng: -5.9845 },
  'malaga': { lat: 36.7213, lng: -4.4214 },
  'marbella': { lat: 36.5101, lng: -4.8824 },
  'alicante': { lat: 38.3452, lng: -0.4810 },
  'palma': { lat: 39.5696, lng: 2.6502 },
  'zaragoza': { lat: 41.6488, lng: -0.8891 },
  'murcia': { lat: 37.9922, lng: -1.1307 },
};

function getCityCoords(city: string): { lat: number; lng: number } | null {
  const normalized = city.toLowerCase().trim();
  return CITY_COORDS[normalized] || null;
}

function getSearchLocale(city: string): { connector: string; language: string } {
  const normalized = city.toLowerCase().trim();
  const ukCities = new Set(['london', 'manchester', 'birmingham', 'leeds', 'liverpool', 'bristol', 'edinburgh', 'glasgow', 'cardiff', 'brighton']);
  const esCities = new Set(['madrid', 'barcelona', 'valencia', 'sevilla', 'malaga', 'marbella', 'alicante', 'palma', 'zaragoza', 'murcia']);
  if (ukCities.has(normalized)) return { connector: 'in', language: 'en' };
  if (esCities.has(normalized)) return { connector: 'en', language: 'es' };
  return { connector: 'i', language: 'sv' };
}

/** Social media / free-site domains that don't count as a real website */
const FAKE_WEBSITE_PATTERNS = [
  'facebook.com', 'fb.com', 'fb.me',
  'instagram.com', 'instagr.am',
  'tiktok.com',
  'twitter.com', 'x.com',
  'youtube.com', 'youtu.be',
  'linkedin.com',
  'mail.google.com', 'gmail.com',
  'outlook.com', 'hotmail.com',
  'yahoo.com',
  'linktr.ee', 'linktree.com',
  'bit.ly',
];

/** Check if a website is NOT a real business website */
function isFakeWebsite(website: string | null | undefined): boolean {
  if (!website) return true;
  const lower = website.toLowerCase().trim();
  if (!lower) return true;
  return FAKE_WEBSITE_PATTERNS.some(pattern => lower.includes(pattern));
}

/** Stage 1: Text Search to get candidates (cheap) */
async function textSearchPaginated(
  keyword: string,
  city: string,
  coords: { lat: number; lng: number },
  radius: number,
  maxPages: number,
  apiKey: string,
  budget?: BudgetTracker,
): Promise<any[]> {
  const locale = getSearchLocale(city);
  const query = `${keyword} ${locale.connector} ${city}`;
  const allResults: any[] = [];
  let pageToken: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    if (budget && !budget.reserveTextSearch()) {
      console.log(`Text Search budget cap reached before "${keyword}" page ${page + 1}`);
      break;
    }

    let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${coords.lat},${coords.lng}&radius=${radius}&language=${locale.language}&key=${apiKey}`;
    if (pageToken) url += `&pagetoken=${pageToken}`;

    const res = await fetch(url);
    const data = await res.json();
    console.log(`Text Search "${keyword}" page ${page + 1}: status=${data.status} results=${data.results?.length ?? 0}`);

    if (data.status !== 'OK' || !data.results?.length) break;

    allResults.push(...data.results);
    pageToken = data.next_page_token || null;
    if (!pageToken) break;

    if (page < maxPages - 1 && pageToken) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return allResults;
}

/** Stage 2: Get Place Details — only valid fields, NO 'email' */
async function fetchPlaceDetails(placeId: string, apiKey: string): Promise<any> {
  const fields = 'place_id,name,formatted_address,types,rating,user_ratings_total,formatted_phone_number,international_phone_number,website,url';
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&language=sv&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === 'OK') return data.result;
  console.log(`Details failed for ${placeId}: ${data.status}`);
  return null;
}

/** Compute outcome from details */
function computeOutcome(website: string | null | undefined, phone: string | null | undefined): { hasWebsite: boolean; hasPhone: boolean; outcome: string } {
  const hasPhone = !!(phone && phone.trim());
  const hasRealWebsite = !!(website && website.trim()) && !isFakeWebsite(website);
  
  let outcome: string;
  if (!hasRealWebsite && hasPhone) {
    outcome = 'no_website_phone';
  } else if (!hasRealWebsite && !hasPhone) {
    outcome = 'no_website_no_phone';
  } else {
    outcome = 'has_website';
  }
  
  return { hasWebsite: hasRealWebsite, hasPhone, outcome };
}

/** Batch fetch with concurrency limit */
async function fetchDetailsWithConcurrency(
  candidates: any[],
  maxDetails: number,
  apiKey: string,
  supabase: any,
  runId: string,
  cacheTtlMs: number,
  allCandidatesCount: number,
  maxReviews?: number,
  budget?: BudgetTracker,
): Promise<number> {
  let detailsFetched = 0;
  const CONCURRENCY = 4;
  let idx = 0;

  while (idx < candidates.length) {
    if (budget?.exhausted) {
      const remaining = candidates.slice(idx).map(c => c.place_id);
      for (let i = 0; i < remaining.length; i += 50) {
        await supabase.from('finder_candidates').update({ outcome: 'skipped' })
          .eq('run_id', runId).in('place_id', remaining.slice(i, i + 50)).eq('outcome', 'pending');
      }
      break;
    }

    if (detailsFetched >= maxDetails) {
      // Mark remaining as skipped
      const remaining = candidates.slice(idx).map(c => c.place_id);
      if (remaining.length > 0) {
        for (let i = 0; i < remaining.length; i += 50) {
          await supabase.from('finder_candidates').update({ outcome: 'skipped' })
            .eq('run_id', runId).in('place_id', remaining.slice(i, i + 50)).eq('outcome', 'pending');
        }
      }
      break;
    }

    // Check if run was stopped every 10 fetches
    if (detailsFetched % 10 === 0 && detailsFetched > 0) {
      const { data: runCheck } = await supabase.from('finder_runs').select('status').eq('id', runId).single();
      if (runCheck?.status === 'stopped') {
        await supabase.from('finder_candidates').update({ outcome: 'skipped' })
          .eq('run_id', runId).eq('outcome', 'pending');
        return detailsFetched;
      }
    }

    // Process batch
    const batch = candidates.slice(idx, idx + CONCURRENCY);
    idx += CONCURRENCY;

    const promises = batch.map(async (candidate: any) => {
      if (detailsFetched >= maxDetails) return;

      // Check cache first
      const { data: cached } = await supabase.from('place_cache')
        .select('*').eq('place_id', candidate.place_id).single();

      if (cached && new Date(cached.fetched_at).getTime() > Date.now() - cacheTtlMs) {
        const phone = cached.phone;
        const { hasWebsite, hasPhone, outcome } = computeOutcome(cached.website, phone);
        
        await supabase.from('finder_candidates').update({
          has_website: hasWebsite,
          has_phone: hasPhone,
          phone: cached.phone,
          email: cached.email || null,
          website: cached.website,
          outcome,
          last_fetched_at: cached.fetched_at,
        }).eq('run_id', runId).eq('place_id', candidate.place_id);
        return; // cached — no API call
      }

      // Fetch from API
      if (budget && !budget.reserveDetail()) {
        await supabase.from('finder_candidates').update({ outcome: 'skipped' })
          .eq('run_id', runId).eq('place_id', candidate.place_id);
        return;
      }

      const details = await fetchPlaceDetails(candidate.place_id, apiKey);
      detailsFetched++;

      if (!details) {
        await supabase.from('finder_candidates').update({ outcome: 'failed' })
          .eq('run_id', runId).eq('place_id', candidate.place_id);
        return;
      }

      // Apply max reviews filter
      if (maxReviews && (details.user_ratings_total || 0) > maxReviews) {
        await supabase.from('finder_candidates').update({ outcome: 'skipped' })
          .eq('run_id', runId).eq('place_id', candidate.place_id);
        return;
      }

      const phone = details.formatted_phone_number || details.international_phone_number || null;
      const website = details.website || null;
      const { hasWebsite, hasPhone, outcome } = computeOutcome(website, phone);
      const types = (details.types || []).filter((t: string) => !['point_of_interest', 'establishment', 'food'].includes(t));

      // IMPORTANT: details.url is Google Maps URL, NOT the business website
      await supabase.from('finder_candidates').update({
        has_website: hasWebsite,
        has_phone: hasPhone,
        phone: phone,
        email: null,
        website: website,
        maps_url: details.url || candidate.maps_url,
        outcome,
        last_fetched_at: new Date().toISOString(),
        name: details.name || candidate.name,
        address: details.formatted_address || candidate.address,
        rating: details.rating ?? candidate.rating,
        reviews_count: details.user_ratings_total ?? candidate.reviews_count,
      }).eq('run_id', runId).eq('place_id', candidate.place_id);

      // Upsert to cache
      await supabase.from('place_cache').upsert({
        place_id: details.place_id,
        name: details.name,
        address: details.formatted_address || null,
        phone: phone,
        email: null,
        website: website,
        rating: details.rating || null,
        reviews_count: details.user_ratings_total || 0,
        types,
        maps_url: details.url || null,
        category: types.map((t: string) => t.replace(/_/g, ' ')).join(', ') || null,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'place_id' });
    });

    await Promise.all(promises);

    // Update stats periodically
    if (detailsFetched % 5 === 0) {
      await supabase.from('finder_runs').update({
        stats: { stage: 'details', candidatesFound: allCandidatesCount, detailsFetched, ...(budget?.stats() || {}) },
      }).eq('id', runId);
    }
  }

  return detailsFetched;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { requireCronServiceOrUserJwt } = await import('../_shared/auth.ts');
  const authFail = await requireCronServiceOrUserJwt(req, corsHeaders);
  if (authFail) return authFail;



  try {
    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Google Places API key not configured' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- API spending cap ---
    const [{ data: capSetting }, { data: startSetting }] = await Promise.all([
      supabase.from('settings').select('value').eq('key', 'finder_spend_cap_usd').maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'finder_budget_start_date').maybeSingle(),
    ]);
    const configuredCap = Number.parseFloat(Deno.env.get('FINDER_SPEND_CAP_USD') || capSetting?.value || String(HARD_COST_CAP_USD));
    const COST_CAP = Math.max(0, Math.min(HARD_COST_CAP_USD, Number.isFinite(configuredCap) ? configuredCap : HARD_COST_CAP_USD));
    const budgetStartDate = Deno.env.get('FINDER_BUDGET_START_DATE') || startSetting?.value || DEFAULT_BUDGET_START_DATE;
    const budgetStart = budgetStartIso(budgetStartDate);

    async function getSpent(excludeRunId?: string): Promise<number> {
      let query = supabase.from('finder_runs').select('id, created_at, stats');
      if (budgetStart) query = query.gte('created_at', budgetStart);
      const { data: allRuns } = await query;
      let totalSpent = 0;
      for (const run of (allRuns || [])) {
        if (excludeRunId && run.id === excludeRunId) continue;
        const s = run.stats as any;
        if (!s) continue;
        const runCost = Number(s.runCostUsd);
        if (Number.isFinite(runCost) && runCost > 0) {
          totalSpent += runCost;
          continue;
        }
        const searches = Number(s.runTextSearchRequests || s.textSearchRequests || (s.candidatesFound ? Math.ceil(s.candidatesFound / 20) : 0));
        const details = Number(s.runDetailRequests || s.detailsFetched || 0);
        totalSpent += costFor(searches, details);
      }
      return totalSpent;
    }

    async function checkSpendingCap(excludeRunId?: string): Promise<{ spent: number; ok: boolean }> {
      const spent = await getSpent(excludeRunId);
      return { spent, ok: spent < COST_CAP };
    }

    const body: SearchRequest = await req.json();
    const { runId, city, keywords, radius, maxPages, maxCandidates, maxDetails, minRating, minReviews, maxReviews, requirePhone, findGmailOnly, action } = body;

    // Estimate mode
    if (action === 'estimate') {
      const stage1Requests = keywords.length * maxPages;
      const maxStage2 = Math.min(maxCandidates, maxDetails);
      const estimatedUsd = costFor(stage1Requests, maxStage2);
      const { spent } = await checkSpendingCap();
      return new Response(JSON.stringify({
        stage1Requests,
        maxStage2Details: maxStage2,
        estimatedCost: `Stage 1: ~${stage1Requests} text searches. Stage 2: up to ${maxStage2} detail lookups.`,
        estimatedUsd: estimatedUsd.toFixed(2),
        totalSpentSoFar: spent.toFixed(2),
        budgetRemaining: Math.max(0, COST_CAP - spent).toFixed(2),
        spendCapUsd: COST_CAP.toFixed(2),
        budgetStartDate,
        fitsBudget: spent + estimatedUsd <= COST_CAP,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check spending cap before any search/resume
    if (action === 'search' || action === 'resume' || action === 'refetch') {
      const { spent, ok } = await checkSpendingCap(runId);
      if (!ok) {
        // Update the run status so it doesn't stay stuck as "pending"
        if (runId) {
          await supabase.from('finder_runs').update({ 
            status: 'failed', 
            stats: { error: 'spending_cap', spent: spent.toFixed(2), cap: COST_CAP, budgetStartDate }
          }).eq('id', runId);
        }
        return new Response(JSON.stringify({ 
          error: `API spending cap of $${COST_CAP} reached since ${budgetStartDate}. Total spent: $${spent.toFixed(2)}. Reduce the batch size or stop here.`
        }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const budget = createBudgetTracker(await getSpent(runId), COST_CAP);

    // Resume mode — continue detail fetching for pending candidates from a timed-out run
    if (action === 'resume' as any) {
      const { data: pendingCandidates } = await supabase.from('finder_candidates')
        .select('*').eq('run_id', runId).eq('outcome', 'pending');
      
      if (!pendingCandidates || pendingCandidates.length === 0) {
        // No pending left — finalize the run
        const { data: finalCandidates } = await supabase.from('finder_candidates')
          .select('outcome, has_phone').eq('run_id', runId);
        const prevDetailsFetched = (finalCandidates || []).filter((c: any) => c.outcome !== 'pending' && c.outcome !== 'duplicate').length;
        const stats = {
          stage: 'done',
          candidatesFound: (finalCandidates || []).length,
          detailsFetched: prevDetailsFetched,
          noWebsiteWithPhone: (finalCandidates || []).filter((c: any) => c.outcome === 'no_website_phone').length,
          noWebsiteNoPhone: (finalCandidates || []).filter((c: any) => c.outcome === 'no_website_no_phone').length,
          hasWebsite: (finalCandidates || []).filter((c: any) => c.outcome === 'has_website').length,
          duplicates: (finalCandidates || []).filter((c: any) => c.outcome === 'duplicate').length,
          skipped: (finalCandidates || []).filter((c: any) => c.outcome === 'skipped').length,
          failed: (finalCandidates || []).filter((c: any) => c.outcome === 'failed').length,
        };
        await supabase.from('finder_runs').update({ status: 'done', stats }).eq('id', runId);
        return new Response(JSON.stringify({ status: 'done', stats, resumed: 0, remaining: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`Resume: ${pendingCandidates.length} pending candidates for run ${runId}`);
      const totalCandidates = await supabase.from('finder_candidates').select('id', { count: 'exact' }).eq('run_id', runId);
      const allCount = totalCandidates.count || pendingCandidates.length;
      
      await supabase.from('finder_runs').update({ 
        status: 'running', 
        stats: { stage: 'details', candidatesFound: allCount, detailsFetched: allCount - pendingCandidates.length, resuming: true, ...budget.stats() } 
      }).eq('id', runId);

      const cacheTtlMs = 30 * 24 * 60 * 60 * 1000;
      // Use maxDetails from the run itself, minus already fetched
      const { data: runData } = await supabase.from('finder_runs').select('max_details').eq('id', runId).single();
      const alreadyFetched = allCount - pendingCandidates.length;
      const remainingBudget = Math.min(pendingCandidates.length, (runData?.max_details || 9999) - alreadyFetched);
      
      const detailsFetched = await fetchDetailsWithConcurrency(
        pendingCandidates, Math.max(remainingBudget, 0), apiKey, supabase, runId, cacheTtlMs, allCount, maxReviews, budget
      );

      // Recompute outcomes
      const { data: allFetched } = await supabase.from('finder_candidates')
        .select('id, website, phone, has_website, has_phone, outcome, last_fetched_at')
        .eq('run_id', runId).not('last_fetched_at', 'is', null);
      if (allFetched) {
        for (const c of allFetched) {
          const { hasWebsite, hasPhone, outcome: newOutcome } = computeOutcome(c.website, c.phone);
          if (c.outcome !== newOutcome || c.has_website !== hasWebsite || c.has_phone !== hasPhone) {
            await supabase.from('finder_candidates').update({ has_website: hasWebsite, has_phone: hasPhone, outcome: newOutcome }).eq('id', c.id);
          }
        }
      }

      // Check if there are still pending candidates (timed out again)
      const { data: stillPending } = await supabase.from('finder_candidates')
        .select('id', { count: 'exact' }).eq('run_id', runId).eq('outcome', 'pending');
      const remaining = stillPending?.length || 0;

      // Final stats
      const { data: finalCandidates } = await supabase.from('finder_candidates')
        .select('outcome, has_phone').eq('run_id', runId);
      const finalStatus = remaining > 0 ? 'running' : 'done';
      const stats = {
        stage: remaining > 0 ? 'details' : 'done',
        candidatesFound: (finalCandidates || []).length,
        detailsFetched: detailsFetched + alreadyFetched,
        noWebsiteWithPhone: (finalCandidates || []).filter((c: any) => c.outcome === 'no_website_phone').length,
        noWebsiteNoPhone: (finalCandidates || []).filter((c: any) => c.outcome === 'no_website_no_phone').length,
        hasWebsite: (finalCandidates || []).filter((c: any) => c.outcome === 'has_website').length,
        duplicates: (finalCandidates || []).filter((c: any) => c.outcome === 'duplicate').length,
        skipped: (finalCandidates || []).filter((c: any) => c.outcome === 'skipped').length,
        failed: (finalCandidates || []).filter((c: any) => c.outcome === 'failed').length,
        remaining,
        ...budget.stats(),
      };
      await supabase.from('finder_runs').update({ status: finalStatus, stats }).eq('id', runId);

      return new Response(JSON.stringify({ status: finalStatus, stats, resumed: detailsFetched, remaining }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Refetch mode — re-process failed candidates from a previous run
    if (action === 'refetch' as any) {
      const { data: failedCandidates } = await supabase.from('finder_candidates')
        .select('*').eq('run_id', runId).eq('outcome', 'failed');
      
      if (!failedCandidates || failedCandidates.length === 0) {
        return new Response(JSON.stringify({ status: 'done', refetched: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`Refetch: ${failedCandidates.length} failed candidates for run ${runId}`);
      await supabase.from('finder_runs').update({ status: 'running', stats: { stage: 'refetch', total: failedCandidates.length } }).eq('id', runId);

      // Reset failed candidates to pending
      await supabase.from('finder_candidates').update({ outcome: 'pending' })
        .eq('run_id', runId).eq('outcome', 'failed');

      const cacheTtlMs = 30 * 24 * 60 * 60 * 1000;
      const detailsFetched = await fetchDetailsWithConcurrency(
        failedCandidates, failedCandidates.length, apiKey, supabase, runId, cacheTtlMs, failedCandidates.length, maxReviews, budget
      );

      // Recompute
      const { data: allFetched } = await supabase.from('finder_candidates')
        .select('id, website, phone, has_website, has_phone, outcome, last_fetched_at')
        .eq('run_id', runId).not('last_fetched_at', 'is', null);
      if (allFetched) {
        for (const c of allFetched) {
          const { hasWebsite, hasPhone, outcome: newOutcome } = computeOutcome(c.website, c.phone);
          if (c.outcome !== newOutcome || c.has_website !== hasWebsite || c.has_phone !== hasPhone) {
            await supabase.from('finder_candidates').update({ has_website: hasWebsite, has_phone: hasPhone, outcome: newOutcome }).eq('id', c.id);
          }
        }
      }

      // Final stats
      const { data: finalCandidates } = await supabase.from('finder_candidates')
        .select('outcome, has_phone').eq('run_id', runId);
      const stats = {
        stage: 'done',
        candidatesFound: (finalCandidates || []).length,
        detailsFetched,
        noWebsiteWithPhone: (finalCandidates || []).filter(c => c.outcome === 'no_website_phone').length,
        noWebsiteNoPhone: (finalCandidates || []).filter(c => c.outcome === 'no_website_no_phone').length,
        hasWebsite: (finalCandidates || []).filter(c => c.outcome === 'has_website').length,
        duplicates: (finalCandidates || []).filter(c => c.outcome === 'duplicate').length,
        skipped: (finalCandidates || []).filter(c => c.outcome === 'skipped').length,
        failed: (finalCandidates || []).filter(c => c.outcome === 'failed').length,
        ...budget.stats(),
      };
      await supabase.from('finder_runs').update({ status: 'done', stats }).eq('id', runId);

      return new Response(JSON.stringify({ status: 'done', stats, refetched: detailsFetched }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const coords = getCityCoords(city);
    if (!coords) {
      return new Response(JSON.stringify({ error: `Unknown city "${city}". Supported: ${Object.keys(CITY_COORDS).join(', ')}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update run status
    await supabase.from('finder_runs').update({ status: 'running', stats: { stage: 'search', startedAt: new Date().toISOString(), ...budget.stats() } }).eq('id', runId);

    // --- STAGE 1: Text Search ---
    const allCandidates: any[] = [];
    const seenPlaceIds = new Set<string>();

    // Get existing lead place_ids for dedup
    const { data: existingLeads } = await supabase.from('leads').select('place_id').not('place_id', 'is', null);
    const existingPlaceIds = new Set((existingLeads || []).map(l => l.place_id));

    for (const keyword of keywords) {
      const { data: runCheck } = await supabase.from('finder_runs').select('status').eq('id', runId).single();
      if (runCheck?.status === 'stopped') {
        return new Response(JSON.stringify({ status: 'stopped', candidatesFound: allCandidates.length }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (allCandidates.length >= maxCandidates) break;

      const results = await textSearchPaginated(keyword, city, coords, radius, maxPages, apiKey, budget);

      for (const place of results) {
        if (allCandidates.length >= maxCandidates) break;
        if (seenPlaceIds.has(place.place_id)) continue;
        seenPlaceIds.add(place.place_id);

        if (minRating && (place.rating || 0) < minRating) continue;
        if (minReviews && (place.user_ratings_total || 0) < minReviews) continue;
        if (maxReviews && (place.user_ratings_total || 0) > maxReviews) continue;

        const isExisting = existingPlaceIds.has(place.place_id);
        const types = (place.types || []).filter((t: string) => !['point_of_interest', 'establishment', 'food'].includes(t));

        allCandidates.push({
          run_id: runId,
          place_id: place.place_id,
          name: place.name,
          address: place.formatted_address || null,
          rating: place.rating || null,
          reviews_count: place.user_ratings_total || 0,
          types,
          maps_url: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
          category: types.map((t: string) => t.replace(/_/g, ' ')).join(', ') || null,
          outcome: isExisting ? 'duplicate' : 'pending',
        });
      }

      await supabase.from('finder_runs').update({
        stats: { stage: 'search', candidatesFound: allCandidates.length, keywordsProcessed: keywords.indexOf(keyword) + 1, ...budget.stats() },
      }).eq('id', runId);

      if (budget.exhausted) break;
    }

    // Insert candidates
    if (allCandidates.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < allCandidates.length; i += batchSize) {
        await supabase.from('finder_candidates').insert(allCandidates.slice(i, i + batchSize));
      }
    }

    // --- STAGE 2: Details with concurrency ---
    const pendingCandidates = allCandidates.filter(c => c.outcome === 'pending');
    const cacheTtlMs = 30 * 24 * 60 * 60 * 1000;
    
    const detailsFetched = await fetchDetailsWithConcurrency(
      pendingCandidates, maxDetails, apiKey, supabase, runId, cacheTtlMs, allCandidates.length, maxReviews, budget
    );

    // --- RECOMPUTE STEP: ensure all fetched candidates have correct outcome ---
    const { data: allFetched } = await supabase.from('finder_candidates')
      .select('id, website, phone, has_website, has_phone, outcome, last_fetched_at')
      .eq('run_id', runId)
      .not('last_fetched_at', 'is', null);

    if (allFetched && allFetched.length > 0) {
      for (const c of allFetched) {
        const { hasWebsite, hasPhone, outcome } = computeOutcome(c.website, c.phone);
        if (c.outcome !== outcome || c.has_website !== hasWebsite || c.has_phone !== hasPhone) {
          await supabase.from('finder_candidates').update({
            has_website: hasWebsite,
            has_phone: hasPhone,
            outcome,
          }).eq('id', c.id);
        }
      }
    }

    // Final stats
    const { data: finalCandidates } = await supabase.from('finder_candidates')
      .select('outcome, has_phone').eq('run_id', runId);

    const stats = {
      stage: 'done',
      candidatesFound: allCandidates.length,
      detailsFetched,
      noWebsiteWithPhone: (finalCandidates || []).filter(c => c.outcome === 'no_website_phone').length,
      noWebsiteNoPhone: (finalCandidates || []).filter(c => c.outcome === 'no_website_no_phone').length,
      hasWebsite: (finalCandidates || []).filter(c => c.outcome === 'has_website').length,
      duplicates: (finalCandidates || []).filter(c => c.outcome === 'duplicate').length,
      skipped: (finalCandidates || []).filter(c => c.outcome === 'skipped').length,
      failed: (finalCandidates || []).filter(c => c.outcome === 'failed').length,
      ...budget.stats(),
    };

    await supabase.from('finder_runs').update({ status: 'done', stats }).eq('id', runId);

    return new Response(JSON.stringify({ status: 'done', stats }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Finder error:', (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
