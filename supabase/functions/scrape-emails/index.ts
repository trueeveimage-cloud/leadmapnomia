const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/** Extract emails from HTML/text content */
function extractEmails(text: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex) || [];
  // Deduplicate and filter out image/file extensions and common false positives
  const blacklist = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.css', '.js', '.woff', '.ttf', '.eot'];
  const seen = new Set<string>();
  return matches.filter(email => {
    const lower = email.toLowerCase();
    if (seen.has(lower)) return false;
    if (blacklist.some(ext => lower.endsWith(ext))) return false;
    // Skip very common non-contact emails
    if (lower.includes('noreply') || lower.includes('no-reply') || lower.includes('example.com')) return false;
    seen.add(lower);
    return true;
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { urls } = await req.json() as { urls: { leadId: string; website: string }[] };

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'urls array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Limit batch size
    const batch = urls.slice(0, 20);
    const results: { leadId: string; emails: string[]; error?: string }[] = [];

    for (const item of batch) {
      try {
        let url = item.website.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = `https://${url}`;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const resp = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; LeadBot/1.0)',
            'Accept': 'text/html,application/xhtml+xml',
          },
          redirect: 'follow',
        });
        clearTimeout(timeout);

        if (!resp.ok) {
          results.push({ leadId: item.leadId, emails: [], error: `HTTP ${resp.status}` });
          continue;
        }

        const html = await resp.text();
        const emails = extractEmails(html);
        results.push({ leadId: item.leadId, emails });
      } catch (e: any) {
        results.push({ leadId: item.leadId, emails: [], error: e.message || 'fetch failed' });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in scrape-emails:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
