import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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
  action: 'search' | 'details' | 'estimate';
}

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
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
};

function getCityCoords(city: string): { lat: number; lng: number } | null {
  const normalized = city.toLowerCase().trim();
  return CITY_COORDS[normalized] || null;
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
  apiKey: string
): Promise<any[]> {
  const query = `${keyword} i ${city}`;
  const allResults: any[] = [];
  let pageToken: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${coords.lat},${coords.lng}&radius=${radius}&language=sv&key=${apiKey}`;
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
): Promise<number> {
  let detailsFetched = 0;
  const CONCURRENCY = 4;
  let idx = 0;

  while (idx < candidates.length) {
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
        stats: { stage: 'details', candidatesFound: allCandidatesCount, detailsFetched },
      }).eq('id', runId);
    }
  }

  return detailsFetched;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    const body: SearchRequest = await req.json();
    const { runId, city, keywords, radius, maxPages, maxCandidates, maxDetails, minRating, minReviews, maxReviews, requirePhone, findGmailOnly, action } = body;

    // Estimate mode
    if (action === 'estimate') {
      const stage1Requests = keywords.length * maxPages;
      const maxStage2 = Math.min(maxCandidates, maxDetails);
      return new Response(JSON.stringify({
        stage1Requests,
        maxStage2Details: maxStage2,
        estimatedCost: `Stage 1: ~${stage1Requests} text searches. Stage 2: up to ${maxStage2} detail lookups.`,
      }), {
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
        failedCandidates, failedCandidates.length, apiKey, supabase, runId, cacheTtlMs, failedCandidates.length, maxReviews
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
    await supabase.from('finder_runs').update({ status: 'running', stats: { stage: 'search', startedAt: new Date().toISOString() } }).eq('id', runId);

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

      const results = await textSearchPaginated(keyword, city, coords, radius, maxPages, apiKey);

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
        stats: { stage: 'search', candidatesFound: allCandidates.length, keywordsProcessed: keywords.indexOf(keyword) + 1 },
      }).eq('id', runId);
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
      pendingCandidates, maxDetails, apiKey, supabase, runId, cacheTtlMs, allCandidates.length, maxReviews
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
