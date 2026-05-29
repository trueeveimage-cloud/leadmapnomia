const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PRIORITY_PREFIXES = ['info','kontakt','hello','hej','boka','booking','reception','admin','sales','support','contact','office','mail'];
const CANDIDATE_PATHS = ['/kontakt','/contact','/about','/om-oss'];

function extractEmails(text: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex) || [];
  const blacklist = ['.png','.jpg','.jpeg','.gif','.svg','.webp','.css','.js','.woff','.ttf','.eot'];
  const seen = new Set<string>();
  return matches.filter((email) => {
    const lower = email.toLowerCase();
    if (seen.has(lower)) return false;
    if (blacklist.some((ext) => lower.endsWith(ext))) return false;
    if (lower.includes('noreply') || lower.includes('no-reply') || lower.includes('example.com')) return false;
    if (lower.includes('sentry.io') || lower.includes('wixpress.com')) return false;
    seen.add(lower);
    return true;
  });
}

function rank(email: string, domain: string): number {
  const lower = email.toLowerCase();
  const prefix = lower.split('@')[0];
  let score = 0;
  if (domain && lower.endsWith('@' + domain)) score += 50;
  if (PRIORITY_PREFIXES.includes(prefix)) score += 30;
  if (/gmail\.com$|hotmail\.com$|outlook\.com$|live\.com$/.test(lower)) score += 5;
  if (/[0-9]{3,}/.test(prefix)) score -= 10;
  return score;
}

async function fetchPage(url: string, timeoutMs = 3000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LeadBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const reader = resp.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();
    let html = '';
    let bytes = 0;
    const MAX = 200_000;
    while (bytes < MAX) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      bytes += value.length;
    }
    reader.cancel().catch(() => {});
    return html;
  } catch {
    return null;
  }
}

function detectSource(path: string, html: string, email: string): string {
  if (/\/kontakt|\/contact/i.test(path)) return 'contact';
  if (/\/om-oss|\/about/i.test(path)) return 'about';
  if (/\/boka|\/booking/i.test(path)) return 'booking';
  // Heuristic: if email appears near "footer" tag
  const idx = html.toLowerCase().indexOf(email.toLowerCase());
  if (idx >= 0) {
    const window = html.slice(Math.max(0, idx - 800), idx + 200).toLowerCase();
    if (window.includes('<footer') || window.includes('footer')) return 'footer';
  }
  return 'homepage';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { urls } = await req.json() as { urls: { leadId: string; website: string }[] };
    if (!urls?.length) {
      return new Response(JSON.stringify({ success: false, error: 'urls array is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const batch = urls.slice(0, 5);
    const results: { leadId: string; emails: string[]; email?: string; source?: string; error?: string }[] = [];

    for (const item of batch) {
      try {
        let url = item.website.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) url = `https://${url}`;
        const u = new URL(url);
        const domain = u.hostname.replace(/^www\./, '');

        // Fetch homepage
        const homepage = await fetchPage(u.origin + u.pathname);
        let allFound: { email: string; source: string }[] = [];
        if (homepage) {
          for (const e of extractEmails(homepage)) {
            allFound.push({ email: e, source: detectSource('/', homepage, e) });
          }
        }

        // Try up to 2 candidate paths concurrently
        const paths = CANDIDATE_PATHS;
        const pageResults = await Promise.all(paths.map((p) => fetchPage(u.origin + p, 3000).then((html) => ({ p, html }))));
        for (const { p, html } of pageResults) {
          if (!html) continue;
          for (const e of extractEmails(html)) {
            if (!allFound.some((f) => f.email.toLowerCase() === e.toLowerCase())) {
              allFound.push({ email: e, source: detectSource(p, html, e) });
            }
          }
        }

        // Rank and pick best
        allFound.sort((a, b) => rank(b.email, domain) - rank(a.email, domain));
        const best = allFound[0];
        results.push({
          leadId: item.leadId,
          emails: allFound.map((f) => f.email),
          email: best?.email,
          source: best?.source ?? (allFound.length ? 'homepage' : 'none'),
        });
      } catch (e: any) {
        results.push({ leadId: item.leadId, emails: [], error: e.message || 'fetch failed' });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in scrape-emails:', error);
    return new Response(JSON.stringify({ success: false, error: error.message || 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
