import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Try multiple strategies to resolve a short/redirect URL to a full Google Maps URL */
async function resolveUrl(url: string): Promise<string> {
  const isShortLink = url.includes('maps.app.goo.gl') || url.includes('goo.gl/maps');

  // Strategy A: HEAD request — some CDN edges do return Location for HEAD
  try {
    const headResp = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      headers: { 'User-Agent': 'curl/7.88.1', Accept: '*/*' },
      signal: AbortSignal.timeout(8000),
    });
    const loc = headResp.headers.get('location');
    console.log('HEAD redirect location:', loc?.substring(0, 150));
    if (loc && loc.includes('google.com/maps')) return loc;
  } catch (e) {
    console.log('HEAD failed:', (e as Error).message);
  }

  // Strategy B: GET with curl-like User-Agent — forces HTTP 301/302 on some short link servers
  try {
    const getResp = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'curl/7.88.1',
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });
    const loc = getResp.headers.get('location');
    console.log('GET (curl UA) redirect location:', loc?.substring(0, 150));
    if (loc && loc.includes('google.com/maps')) return loc;
    // Follow the location if it's a different short link
    if (loc && loc !== url) {
      const loc2 = await resolveUrlSingle(loc);
      if (loc2 && loc2.includes('google.com/maps')) return loc2;
    }
  } catch (e) {
    console.log('GET curl UA failed:', (e as Error).message);
  }

  // Strategy C: Follow with browser UA and inspect HTML for embedded Maps URL
  try {
    const resp = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(12000),
    });

    // Final URL after HTTP redirects
    if (resp.url && resp.url !== url && resp.url.includes('google.com/maps')) {
      console.log('Follow-redirect resolved to:', resp.url.substring(0, 150));
      return resp.url;
    }

    const html = await resp.text();

    // Dump first 2000 chars for debug
    console.log('HTML snippet:', html.substring(0, 2000));

    // Parse patterns from HTML — order matters (most specific first)
    const patterns: RegExp[] = [
      // og:url meta tag (most reliable for maps.app.goo.gl)
      /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']*google\.com\/maps[^"']*)["'][^>]+property=["']og:url["']/i,
      // canonical link
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*google\.com\/maps[^"']*)["']/i,
      // itemprop url
      /<[^>]+itemprop=["']url["'][^>]+content=["']([^"']*google\.com\/maps[^"']*)["']/i,
      // JSON-LD or window variable
      /"url"\s*:\s*"(https:\/\/[^"]*google\.com\/maps\/place[^"]*)"/i,
      // Firebase Dynamic Link deepLink field
      /"deepLink"\s*:\s*"(https:\/\/[^"]*google\.com\/maps[^"]*)"/i,
      /"link"\s*:\s*"(https:\/\/[^"]*google\.com\/maps[^"]*)"/i,
      // meta refresh
      /<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^;]*;\s*url=([^"'>\s]+)/i,
      // window.location
      /window\.location(?:\.href)?\s*=\s*["'](https?:\/\/[^"']*google\.com\/maps[^"']*)["']/i,
      // Any google.com/maps/place URL in the page
      /(https:\/\/(?:www\.)?google\.com\/maps\/(?:place|search)\/[^\s"'<>\\]+)/i,
    ];

    for (const pattern of patterns) {
      const m = html.match(pattern);
      if (m) {
        const found = m[1]
          .replace(/\\u003d/g, '=')
          .replace(/\\u0026/g, '&')
          .replace(/\\\//g, '/')
          .replace(/&amp;/g, '&');
        console.log('Extracted maps URL from HTML:', found.substring(0, 150));
        return found;
      }
    }

    // Last resort: check if the final URL after follow contains maps data
    if (resp.url && resp.url.includes('google.com')) {
      console.log('Using follow-redirect final URL:', resp.url.substring(0, 150));
      return resp.url;
    }
  } catch (e) {
    console.log('HTML parse strategy failed:', (e as Error).message);
  }

  console.log('All resolution strategies failed, using original URL.');
  return url;
}

/** Single-hop redirect resolver (no recursion) */
async function resolveUrlSingle(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': 'curl/7.88.1', Accept: '*/*' },
      signal: AbortSignal.timeout(6000),
    });
    return r.headers.get('location');
  } catch {
    return null;
  }
}

/** Extract Place ID (ChIJ...) from URL */
function extractPlaceId(url: string): string | null {
  const patterns = [
    /[?&]place_id=([^&\s]+)/i,
    /[?&]placeid=([^&\s]+)/i,
    /!1s(ChIJ[^!]+)!/,
    /\?q=place_id:([^&\s]+)/i,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

/** Extract business name from URL path */
function extractNameFromPath(url: string): string | null {
  const m = url.match(/\/maps\/place\/([^/@?]+)/);
  if (!m) return null;
  return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
}

/** Extract precise business lat/lng from data segment (!3d..!4d..) */
function extractPreciseLatLng(url: string): { lat: number; lng: number } | null {
  const latM = url.match(/!3d(-?\d+\.\d+)/);
  const lngM = url.match(/!4d(-?\d+\.\d+)/);
  if (latM && lngM) return { lat: parseFloat(latM[1]), lng: parseFloat(lngM[1]) };
  const m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
}

/** Fetch full place details by Place ID */
async function fetchDetailsByPlaceId(placeId: string, apiKey: string): Promise<any> {
  const fields = 'place_id,name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,types';
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log('Place Details status:', data.status);
  if (data.status === 'OK') return data.result;
  return null;
}

/** Text Search API */
async function textSearch(query: string, apiKey: string, latLng?: { lat: number; lng: number }): Promise<any> {
  let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
  if (latLng) url += `&location=${latLng.lat},${latLng.lng}&radius=300`;
  const res = await fetch(url);
  const data = await res.json();
  console.log('Text Search status:', data.status, 'results:', data.results?.length ?? 0);
  if (data.status === 'OK' && data.results?.length > 0) {
    return await fetchDetailsByPlaceId(data.results[0].place_id, apiKey);
  }
  return null;
}

/** Find Place from Text API */
async function findPlaceFromText(query: string, apiKey: string, latLng?: { lat: number; lng: number }): Promise<any> {
  const fields = 'place_id,name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,types';
  let url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=${fields}&key=${apiKey}`;
  if (latLng) url += `&locationbias=point:${latLng.lat},${latLng.lng}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log('Find Place status:', data.status, 'candidates:', data.candidates?.length ?? 0);
  if (data.status === 'OK' && data.candidates?.length > 0) return data.candidates[0];
  return null;
}

/** Nearby Search API */
async function nearbySearch(lat: number, lng: number, keyword: string, apiKey: string): Promise<any> {
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=300&keyword=${encodeURIComponent(keyword)}&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log('Nearby Search status:', data.status, 'results:', data.results?.length ?? 0);
  if (data.status === 'OK' && data.results?.length > 0) {
    return await fetchDetailsByPlaceId(data.results[0].place_id, apiKey);
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Cannot fetch details without Places API key' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const rawUrl = body?.url;
    if (!rawUrl || typeof rawUrl !== 'string') {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Strip any extra text after the URL (spaces, notes, etc.)
    const url = rawUrl.trim().split(/\s+/)[0];
    console.log('Input URL:', url.substring(0, 150));

    const resolvedUrl = await resolveUrl(url);
    console.log('Resolved URL:', resolvedUrl.substring(0, 200));

    let placeData: any = null;

    // Strategy 1: Place ID directly in URL
    const directPlaceId = extractPlaceId(resolvedUrl);
    if (directPlaceId) {
      console.log('Strategy 1: Place ID found:', directPlaceId.substring(0, 30));
      placeData = await fetchDetailsByPlaceId(directPlaceId, apiKey);
    }

    // Strategy 2-5: Name + coordinates
    if (!placeData) {
      const name = extractNameFromPath(resolvedUrl);
      const latLng = extractPreciseLatLng(resolvedUrl);
      console.log('Name:', name?.substring(0, 40), 'LatLng:', latLng);

      if (name && latLng) placeData = await textSearch(name, apiKey, latLng);
      if (!placeData && name && latLng) placeData = await findPlaceFromText(name, apiKey, latLng);
      if (!placeData && name && latLng) placeData = await nearbySearch(latLng.lat, latLng.lng, name, apiKey);
      if (!placeData && name) placeData = await textSearch(name, apiKey);
      if (!placeData && name) placeData = await findPlaceFromText(name, apiKey);
    }

    if (!placeData) {
      return new Response(JSON.stringify({
        error: 'Could not find this place. Two possible fixes: (1) In Google Cloud Console → APIs & Services, enable "Places API" — it must include Text Search, Nearby Search, and Find Place. (2) Copy the full URL directly from your browser address bar instead of the share link.',
      }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const types: string[] = placeData.types || [];
    const category = types
      .filter((t: string) => !['point_of_interest', 'establishment', 'food'].includes(t))
      .map((t: string) => t.replace(/_/g, ' '))
      .join(', ');

    const result = {
      placeId: placeData.place_id,
      name: placeData.name,
      address: placeData.formatted_address || null,
      phone: placeData.formatted_phone_number || null,
      email: null,
      website: placeData.website || null,
      rating: placeData.rating || null,
      reviewsCount: placeData.user_ratings_total || 0,
      category: category || null,
      nicheLabel: category.split(',')[0]?.trim() || null,
    };

    console.log('Success:', result.name, '| phone:', result.phone, '| rating:', result.rating);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
