import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Follow redirects to get the final URL with a 6-second timeout */
async function resolveUrl(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timeout);
    await response.text(); // consume body
    console.log('Resolved to:', response.url.substring(0, 120));
    return response.url;
  } catch (e) {
    console.log('URL resolution failed:', (e as Error).message);
    return url;
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

/** Text Search API — finds places by name (requires Places API enabled) */
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
    const url = body?.url;
    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Input URL:', url.substring(0, 100));

    // Step 1: Resolve short links — try twice if first attempt fails
    let resolvedUrl = await resolveUrl(url);
    // If resolution didn't actually redirect (still same domain), try again
    if (resolvedUrl.includes('maps.app.goo.gl') || resolvedUrl.includes('goo.gl')) {
      console.log('First resolution failed, retrying...');
      await new Promise(r => setTimeout(r, 500));
      resolvedUrl = await resolveUrl(url);
    }
    console.log('Final resolved URL (first 150 chars):', resolvedUrl.substring(0, 150));

    let placeData: any = null;

    // Strategy 1: Place ID directly in URL (e.g., ChIJ...)
    const directPlaceId = extractPlaceId(resolvedUrl);
    if (directPlaceId) {
      console.log('Strategy 1: Place ID found:', directPlaceId.substring(0, 20));
      placeData = await fetchDetailsByPlaceId(directPlaceId, apiKey);
    }

    // Strategy 2: Name + precise coordinates from URL
    if (!placeData) {
      const name = extractNameFromPath(resolvedUrl);
      const latLng = extractPreciseLatLng(resolvedUrl);
      console.log('Strategy 2/3/4: name =', name?.substring(0, 40), 'latLng =', latLng);

      if (name && latLng) {
        // Try Text Search with location bias (most reliable)
        placeData = await textSearch(name, apiKey, latLng);
      }

      // Strategy 3: Find Place from Text with location bias
      if (!placeData && name && latLng) {
        placeData = await findPlaceFromText(name, apiKey, latLng);
      }

      // Strategy 4: Nearby Search
      if (!placeData && name && latLng) {
        placeData = await nearbySearch(latLng.lat, latLng.lng, name, apiKey);
      }

      // Strategy 5: Text Search without location (last resort)
      if (!placeData && name) {
        placeData = await textSearch(name, apiKey);
      }
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
