import { supabase } from "@/integrations/supabase/client";

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  rating: number | null;
  reviewsCount: number;
  category: string | null;
  nicheLabel: string | null;
}

/**
 * Attempt to resolve a short link in the browser using fetch with redirect:follow.
 * response.url gives the final URL after all HTTP redirects.
 */
async function resolveShortLinkInBrowser(url: string): Promise<string> {
  if (!url.includes('maps.app.goo.gl') && !url.includes('goo.gl/maps')) return url;

  try {
    const resp = await fetch(url, { method: 'GET', redirect: 'follow' });
    const finalUrl = resp.url;
    // Consume body to avoid resource leak
    try { await resp.text(); } catch { /* ignore */ }
    if (finalUrl && finalUrl !== url && finalUrl.includes('google.com/maps')) {
      console.log('[placesFetch] browser fetch resolved to:', finalUrl.substring(0, 120));
      return finalUrl;
    }
  } catch {
    // CORS or network error — fall through to edge function
  }
  return url;
}

/** Strip any accidental text after the URL (spaces, notes, etc.) */
function sanitizeUrl(raw: string): string {
  return raw.trim().split(/\s+/)[0];
}

export async function fetchPlaceFromUrl(rawUrl: string): Promise<{ result?: PlaceResult; error?: string }> {
  try {
    // Strip any text after the URL first (frontend layer of protection)
    const cleanUrl = sanitizeUrl(rawUrl);

    // For short links, attempt browser-side resolution first
    // (browsers can follow Google's JS redirects; servers cannot)
    const resolvedUrl = await resolveShortLinkInBrowser(cleanUrl);
    console.log('[placesFetch] resolved URL:', resolvedUrl.substring(0, 120));

    const { data, error } = await supabase.functions.invoke('fetch-place', {
      body: { url: resolvedUrl },
    });

    if (error) {
      const msg = (error as any)?.context?.json?.error || error.message;
      return { error: msg };
    }
    if (data?.error) return { error: data.error };
    return { result: data as PlaceResult };
  } catch (e: any) {
    return { error: e.message };
  }
}
