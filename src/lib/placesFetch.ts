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
 * Attempt to resolve a short link (maps.app.goo.gl) in the browser.
 * The browser can follow Google's redirects since it's a real browser (not blocked as a bot).
 * We use fetch() with redirect:'follow' — CORS will prevent reading the response body,
 * but response.url will contain the final URL after all redirects.
 */
async function resolveShortLinkInBrowser(url: string): Promise<string> {
  if (!url.includes('maps.app.goo.gl') && !url.includes('goo.gl/maps')) return url;

  try {
    // Use no-cors mode so CORS doesn't block the request;
    // We can't read the body in no-cors, but we CAN read response.url in some cases.
    // Actually with 'no-cors', response is opaque and response.url is empty string.
    // 
    // Better: use 'cors' mode with credentials omitted.
    // Google WILL redirect us, and since we're a real browser, they'll serve the page.
    // But CORS will block reading response.url cross-origin...
    //
    // THE REAL SOLUTION: use fetch with mode:'no-cors' won't work.
    // Instead: create a temporary iframe, navigate it, and read its location... also blocked.
    //
    // WHAT ACTUALLY WORKS: The browser follows the redirect chain natively.
    // We use XMLHttpRequest which exposes responseURL (the final URL after redirects).
    
    return await new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          const finalUrl = xhr.responseURL;
          if (finalUrl && finalUrl !== url && finalUrl.includes('google.com/maps')) {
            console.log('[placesFetch] XHR resolved short link to:', finalUrl.substring(0, 120));
            resolve(finalUrl);
          } else {
            resolve(url);
          }
        }
      };
      xhr.onerror = () => resolve(url);
      xhr.timeout = 8000;
      xhr.ontimeout = () => resolve(url);
      xhr.send();
    });
  } catch {
    return url;
  }
}

export async function fetchPlaceFromUrl(url: string): Promise<{ result?: PlaceResult; error?: string }> {
  try {
    // For short links, attempt browser-side resolution first
    // (browsers can follow Google's JS redirects; servers cannot)
    const resolvedUrl = await resolveShortLinkInBrowser(url);
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
