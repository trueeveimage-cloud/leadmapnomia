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
  requirePhone: boolean;
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
};

function getCityCoords(city: string): { lat: number; lng: number } | null {
  const normalized = city.toLowerCase().trim();
  return CITY_COORDS[normalized] || null;
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

    // Google requires a short delay before using next_page_token
    if (page < maxPages - 1 && pageToken) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return allResults;
}

/** Stage 2: Get Place Details (selective, cached) */
async function fetchPlaceDetails(placeId: string, apiKey: string): Promise<any> {
  const fields = 'place_id,name,formatted_address,types,rating,user_ratings_total,formatted_phone_number,website,url';
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&language=sv&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === 'OK') return data.result;
  console.log(`Details failed for ${placeId}: ${data.status}`);
  return null;
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
    const { runId, city, keywords, radius, maxPages, maxCandidates, maxDetails, minRating, minReviews, requirePhone, action } = body;

    // Estimate mode — return counts without doing anything
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
      // Check if run was stopped
      const { data: runCheck } = await supabase.from('finder_runs').select('status').eq('id', runId).single();
      if (runCheck?.status === 'stopped') {
        console.log('Run was stopped by user');
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

        // Apply filters on Stage 1 data
        if (minRating && (place.rating || 0) < minRating) continue;
        if (minReviews && (place.user_ratings_total || 0) < minReviews) continue;

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

      // Update stats
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

    // --- STAGE 2: Selective Details ---
    const pendingCandidates = allCandidates.filter(c => c.outcome === 'pending');
    let detailsFetched = 0;
    const cacheTtlMs = 30 * 24 * 60 * 60 * 1000; // 30 days

    for (const candidate of pendingCandidates) {
      if (detailsFetched >= maxDetails) {
        // Mark remaining as skipped
        await supabase.from('finder_candidates').update({ outcome: 'skipped' })
          .eq('run_id', runId).eq('place_id', candidate.place_id).eq('outcome', 'pending');
        continue;
      }

      // Check if run was stopped
      if (detailsFetched % 10 === 0) {
        const { data: runCheck } = await supabase.from('finder_runs').select('status').eq('id', runId).single();
        if (runCheck?.status === 'stopped') {
          // Mark remaining as skipped
          await supabase.from('finder_candidates').update({ outcome: 'skipped' })
            .eq('run_id', runId).eq('outcome', 'pending');
          return new Response(JSON.stringify({ status: 'stopped', candidatesFound: allCandidates.length, detailsFetched }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Check cache first
      const { data: cached } = await supabase.from('place_cache')
        .select('*').eq('place_id', candidate.place_id).single();

      if (cached && new Date(cached.fetched_at).getTime() > Date.now() - cacheTtlMs) {
        // Use cached data — no API call needed
        const hasWebsite = !!(cached.website && cached.website.trim());
        const hasPhone = !!(cached.phone && cached.phone.trim());
        const outcome = hasWebsite ? 'has_website' : 'no_website';

        await supabase.from('finder_candidates').update({
          has_website: hasWebsite,
          has_phone: hasPhone,
          phone: cached.phone,
          website: cached.website,
          outcome,
          last_fetched_at: cached.fetched_at,
        }).eq('run_id', runId).eq('place_id', candidate.place_id);
        continue; // Don't count cached as a detail fetch
      }

      // Fetch details from API
      const details = await fetchPlaceDetails(candidate.place_id, apiKey);
      detailsFetched++;

      if (!details) {
        await supabase.from('finder_candidates').update({ outcome: 'failed' })
          .eq('run_id', runId).eq('place_id', candidate.place_id);
        continue;
      }

      const hasWebsite = !!(details.website && details.website.trim());
      const hasPhone = !!(details.formatted_phone_number && details.formatted_phone_number.trim());
      const outcome = hasWebsite ? 'has_website' : 'no_website';
      const types = (details.types || []).filter((t: string) => !['point_of_interest', 'establishment', 'food'].includes(t));

      // Update candidate
      await supabase.from('finder_candidates').update({
        has_website: hasWebsite,
        has_phone: hasPhone,
        phone: details.formatted_phone_number || null,
        website: details.website || null,
        maps_url: details.url || candidate.maps_url,
        outcome,
        last_fetched_at: new Date().toISOString(),
        name: details.name || candidate.name,
        address: details.formatted_address || candidate.address,
        rating: details.rating || candidate.rating,
        reviews_count: details.user_ratings_total || candidate.reviews_count,
      }).eq('run_id', runId).eq('place_id', candidate.place_id);

      // Upsert to cache
      await supabase.from('place_cache').upsert({
        place_id: details.place_id,
        name: details.name,
        address: details.formatted_address || null,
        phone: details.formatted_phone_number || null,
        website: details.website || null,
        rating: details.rating || null,
        reviews_count: details.user_ratings_total || 0,
        types,
        maps_url: details.url || null,
        category: types.map((t: string) => t.replace(/_/g, ' ')).join(', ') || null,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'place_id' });

      // Update stats periodically
      if (detailsFetched % 5 === 0) {
        await supabase.from('finder_runs').update({
          stats: { stage: 'details', candidatesFound: allCandidates.length, detailsFetched },
        }).eq('id', runId);
      }

      // Rate limiting: ~5 req/sec
      await new Promise(r => setTimeout(r, 200));
    }

    // Final stats
    const { data: finalCandidates } = await supabase.from('finder_candidates')
      .select('outcome, has_phone').eq('run_id', runId);

    const stats = {
      stage: 'done',
      candidatesFound: allCandidates.length,
      detailsFetched,
      noWebsiteWithPhone: (finalCandidates || []).filter(c => c.outcome === 'no_website' && c.has_phone).length,
      noWebsiteNoPhone: (finalCandidates || []).filter(c => c.outcome === 'no_website' && !c.has_phone).length,
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
