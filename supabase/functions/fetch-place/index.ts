import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function extractPlaceIdFromUrl(url: string): string | null {
  // Handle various Google Maps URL formats
  const patterns = [
    /place_id[=:]([^&\s/]+)/i,
    /[?&]placeid=([^&\s]+)/i,
    /\/maps\/place\/[^/]+\/@[^/]+\/([^/]+)/i,
    /!1s([^!]+)!2s/i,
    /\?q=place_id:([^&\s]+)/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return decodeURIComponent(match[1]);
  }

  return null;
}

async function resolveShortUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url, { redirect: 'follow', method: 'HEAD' });
    return response.url;
  } catch {
    return url;
  }
}

async function searchByQuery(query: string, apiKey: string): Promise<any> {
  const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
  const res = await fetch(searchUrl);
  const data = await res.json();
  if (data.results && data.results.length > 0) {
    return data.results[0];
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
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve short URLs (maps.app.goo.gl, goo.gl etc)
    let resolvedUrl = url;
    if (url.includes('goo.gl') || url.includes('maps.app')) {
      resolvedUrl = await resolveShortUrl(url);
    }

    let placeId = extractPlaceIdFromUrl(resolvedUrl);
    let placeData: any = null;

    if (placeId) {
      // Fetch by Place ID
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=place_id,name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,types,editorial_summary&key=${apiKey}`;
      const res = await fetch(detailsUrl);
      const data = await res.json();
      if (data.result) {
        placeData = data.result;
      }
    }

    if (!placeData) {
      // Try to extract name from URL path and search
      const pathMatch = resolvedUrl.match(/\/maps\/place\/([^/@]+)/);
      if (pathMatch) {
        const queryStr = decodeURIComponent(pathMatch[1]).replace(/\+/g, ' ');
        const searchResult = await searchByQuery(queryStr, apiKey);
        if (searchResult) {
          placeId = searchResult.place_id;
          // Get full details
          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=place_id,name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,types,editorial_summary&key=${apiKey}`;
          const res = await fetch(detailsUrl);
          const data = await res.json();
          if (data.result) {
            placeData = data.result;
          }
        }
      }
    }

    if (!placeData) {
      return new Response(JSON.stringify({ error: 'Could not parse lead from this link. Try a direct Google Maps place link.' }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine email from website (placeholder — can't scrape)
    const email = null;

    // Determine category
    const types = placeData.types || [];
    const category = types
      .filter((t: string) => !['point_of_interest', 'establishment'].includes(t))
      .map((t: string) => t.replace(/_/g, ' '))
      .join(', ');

    const result = {
      placeId: placeData.place_id || placeId,
      name: placeData.name,
      address: placeData.formatted_address,
      phone: placeData.formatted_phone_number || null,
      email,
      website: placeData.website || null,
      rating: placeData.rating || null,
      reviewsCount: placeData.user_ratings_total || 0,
      category,
      nicheLabel: category.split(',')[0]?.trim() || null,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
