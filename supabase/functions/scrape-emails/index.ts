const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Acceptable business prefixes — only emails using one of these are kept as "public business".
const BUSINESS_PREFIXES = new Set([
  'info','kontakt','contact','hello','hej','sales','booking','boka','admin','support',
  'reception','office','mail','hq','team','order','orders','customerservice','kundtjanst',
  'kundservice','sale','salg','salgs','sale','firma','post','enquiries','enquiry','hi'
]);
// Free-mail domains accepted when found publicly on the site.
const FREE_MAIL_DOMAINS = /(gmail\.com|hotmail\.com|outlook\.com|live\.com|yahoo\.com|icloud\.com)$/i;

// Pages we'll try, in priority order. Homepage is fetched separately.
// Keep small to stay under edge-function CPU limits.
const CANDIDATE_PATHS = [
  '/kontakt','/contact','/om-oss','/about','/privacy','/integritet',
];

function extractFromText(text: string): string[] {
  const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  return text.match(re) || [];
}
function extractMailto(html: string): string[] {
  const re = /mailto:([^"'?\s>&]+)/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(decodeURIComponent(m[1]));
  return out;
}

function cleanEmails(raw: string[]): string[] {
  const blacklist = ['.png','.jpg','.jpeg','.gif','.svg','.webp','.css','.js','.woff','.ttf','.eot'];
  const noise = ['noreply','no-reply','donotreply','example.com','sentry.io','wixpress.com','wordpress.com','jsdelivr','googleapis','cloudflare','schema.org'];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of raw) {
    const lower = e.toLowerCase().replace(/^mailto:/, '').replace(/[<>"',;]+/g, '').trim();
    if (!lower || seen.has(lower)) continue;
    if (blacklist.some(ext => lower.endsWith(ext))) continue;
    if (noise.some(n => lower.includes(n))) continue;
    if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(lower)) continue;
    seen.add(lower);
    out.push(lower);
  }
  return out;
}

/** Keep only PUBLIC business-style emails. No guessing/permutations — input emails are
 * already verified as appearing on the public site. We filter to: business-prefix matches
 * OR free-mail addresses (both indicate a real, publicly listed inbox). */
function isPublicBusinessEmail(email: string, domain: string): boolean {
  const [prefix] = email.split('@');
  const isFreeMail = FREE_MAIL_DOMAINS.test(email);
  const isSameDomain = !!domain && email.endsWith('@' + domain);
  if (isFreeMail) return true;
  if (BUSINESS_PREFIXES.has(prefix)) return true;
  // Same-domain catch-all (e.g. firstname@site.se) is acceptable if it's clearly the company domain
  if (isSameDomain) return true;
  return false;
}

function rank(email: string, domain: string): number {
  const lower = email.toLowerCase();
  const prefix = lower.split('@')[0];
  let score = 0;
  if (domain && lower.endsWith('@' + domain)) score += 60;
  if (BUSINESS_PREFIXES.has(prefix)) score += 35;
  if (FREE_MAIL_DOMAINS.test(lower)) score += 5;
  if (/[0-9]{3,}/.test(prefix)) score -= 10;
  return score;
}

async function fetchPage(url: string, timeoutMs = 3500): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LeadBot/1.1; +https://lovable.app)',
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
    const MAX = 60_000;
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
  if (/\/kontakt|\/contact|contacto/i.test(path)) return 'contact';
  if (/\/om-oss|\/about|\/om/i.test(path)) return 'about';
  if (/\/boka|\/booking|\/book/i.test(path)) return 'booking';
  if (/\/team|\/personal|\/staff|medarbetare/i.test(path)) return 'team';
  if (/\/privacy|integritet|dataskydd/i.test(path)) return 'privacy';
  if (/\/terms|villkor/i.test(path)) return 'terms';
  if (/\/footer|sitemap/i.test(path)) return 'footer';
  const idx = html.toLowerCase().indexOf(email.toLowerCase());
  if (idx >= 0) {
    const w = html.slice(Math.max(0, idx - 800), idx + 200).toLowerCase();
    if (w.includes('<footer') || w.includes('footer')) return 'footer';
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

    const batch = urls.slice(0, 2);
    const results: { leadId: string; emails: string[]; email?: string; source?: string; error?: string }[] = [];

    for (const item of batch) {
      try {
        let url = item.website.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) url = `https://${url}`;
        const u = new URL(url);
        const domain = u.hostname.replace(/^www\./, '');

        const allFound: { email: string; source: string }[] = [];

        // 1) homepage — fetch first, parse mailto + visible text
        const homepage = await fetchPage(u.origin + u.pathname);
        if (homepage) {
          const raws = [...extractMailto(homepage), ...extractFromText(homepage)];
          for (const e of cleanEmails(raws)) {
            if (isPublicBusinessEmail(e, domain) && !allFound.some(f => f.email === e)) {
              allFound.push({ email: e, source: detectSource('/', homepage, e) });
            }
          }
        }

        // 2) Walk a few candidate pages, stop as soon as we find a business email
        for (const p of CANDIDATE_PATHS) {
          if (allFound.length >= 2) break;
          const html = await fetchPage(u.origin + p, 2000);
          if (!html) continue;
          const raws = [...extractMailto(html), ...extractFromText(html)];
          for (const e of cleanEmails(raws)) {
            if (isPublicBusinessEmail(e, domain) && !allFound.some(f => f.email === e)) {
              allFound.push({ email: e, source: detectSource(p, html, e) });
            }
          }
        }

        allFound.sort((a, b) => rank(b.email, domain) - rank(a.email, domain));
        const best = allFound[0];
        results.push({
          leadId: item.leadId,
          emails: allFound.map(f => f.email),
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
