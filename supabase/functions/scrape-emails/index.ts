const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BUSINESS_PREFIXES = new Set([
  'info', 'kontakt', 'contact', 'hello', 'hej', 'sales', 'booking', 'bookings', 'boka',
  'admin', 'support', 'reception', 'office', 'mail', 'hq', 'team', 'order', 'orders',
  'customerservice', 'kundtjanst', 'kundservice', 'service', 'post', 'enquiries',
  'enquiry', 'hi', 'jobs', 'career', 'careers', 'press', 'marketing',
]);

const FREE_MAIL_DOMAINS = /(gmail\.com|hotmail\.com|outlook\.com|live\.com|yahoo\.com|icloud\.com|proton\.me|protonmail\.com)$/i;
const BAD_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.css', '.js', '.woff', '.woff2', '.ttf', '.eot', '.ico', '.pdf'];
const NOISE = [
  'noreply', 'no-reply', 'donotreply', 'example.com', 'sentry.io', 'wixpress.com',
  'wordpress.com', 'jsdelivr', 'googleapis', 'cloudflare', 'schema.org', 'your-email',
  'email@example', 'domain.com', 'godaddy', 'squarespace',
];

const FALLBACK_PATHS = [
  '/contact', '/kontakt', '/contact-us', '/contacts', '/contacto', '/contato',
  '/about', '/about-us', '/om-oss', '/om', '/quienes-somos', '/sobre-nosotros',
  '/team', '/staff', '/personal', '/medarbetare',
  '/booking', '/book', '/boka', '/appointment',
  '/privacy', '/privacy-policy', '/integritet', '/datenschutz',
  '/terms', '/terms-and-conditions', '/villkor',
  '/impressum', '/legal', '/footer', '/sitemap.xml',
];

const PRIORITY_LINK_WORDS = [
  'contact', 'kontakt', 'contacto', 'contato', 'about', 'om-oss', 'om oss', 'team',
  'staff', 'personal', 'medarbetare', 'booking', 'boka', 'privacy', 'integritet',
  'legal', 'impressum', 'facebook', 'instagram', 'linkedin',
];

interface ScrapeInput {
  leadId: string;
  website: string;
  businessName?: string;
}

interface FoundEmail {
  email: string;
  source: string;
  page: string;
  score: number;
}

function decodeHtml(input: string): string {
  return input
    .replace(/&#64;|&#x40;|&commat;/gi, '@')
    .replace(/&#46;|&#x2e;|&period;/gi, '.')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\\u0040/gi, '@')
    .replace(/\\x40/gi, '@');
}

function deobfuscate(input: string): string {
  return decodeHtml(input)
    .replace(/\s*(?:\[|\()?at(?:\]|\))?\s*/gi, '@')
    .replace(/\s+(?:at)\s+/gi, '@')
    .replace(/\s*(?:\[|\()?dot(?:\]|\))?\s*/gi, '.')
    .replace(/\s+(?:dot)\s+/gi, '.')
    .replace(/\s*\(a\)\s*/gi, '@')
    .replace(/\s*\[a\]\s*/gi, '@');
}

function extractEmails(text: string): string[] {
  const decoded = deobfuscate(text);
  const normal = decoded.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
  const mailto: string[] = [];
  const re = /mailto:([^"'?\s>&]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(decoded)) !== null) mailto.push(decodeURIComponent(m[1]));
  return [...mailto, ...normal];
}

function cleanEmails(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw) {
    const lower = value
      .toLowerCase()
      .replace(/^mailto:/, '')
      .replace(/[<>"',;)\]]+$/g, '')
      .replace(/^[<>"'([;]+/g, '')
      .trim();
    if (!lower || seen.has(lower)) continue;
    if (BAD_EXTENSIONS.some(ext => lower.endsWith(ext))) continue;
    if (NOISE.some(n => lower.includes(n))) continue;
    if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(lower)) continue;
    seen.add(lower);
    out.push(lower);
  }
  return out;
}

function rootDomain(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function isPublicBusinessEmail(email: string, domain: string): boolean {
  const [prefix, host] = email.split('@');
  if (!host) return false;
  if (FREE_MAIL_DOMAINS.test(email)) return true;
  if (host === domain || host.endsWith(`.${domain}`)) return true;
  if (BUSINESS_PREFIXES.has(prefix)) return true;
  return false;
}

function sourceFor(url: string, html: string, email: string): string {
  const lowerUrl = url.toLowerCase();
  if (/facebook\.com/i.test(lowerUrl)) return 'facebook';
  if (/instagram\.com/i.test(lowerUrl)) return 'instagram';
  if (/linkedin\.com/i.test(lowerUrl)) return 'linkedin';
  if (/contact|kontakt|contacto|contato/i.test(lowerUrl)) return 'contact';
  if (/about|om-oss|quienes|sobre|team|staff|personal|medarbetare/i.test(lowerUrl)) return 'about/team';
  if (/booking|book|boka|appointment/i.test(lowerUrl)) return 'booking';
  if (/privacy|integritet|legal|impressum|terms|villkor/i.test(lowerUrl)) return 'legal';
  const idx = html.toLowerCase().indexOf(email.toLowerCase());
  if (idx >= 0) {
    const nearby = html.slice(Math.max(0, idx - 1000), idx + 300).toLowerCase();
    if (nearby.includes('<footer') || nearby.includes('footer')) return 'footer';
  }
  return 'homepage';
}

function rank(email: string, domain: string, source: string): number {
  const [prefix, host] = email.toLowerCase().split('@');
  let score = 0;
  if (host === domain) score += 80;
  if (host?.endsWith(`.${domain}`)) score += 70;
  if (BUSINESS_PREFIXES.has(prefix)) score += 45;
  if (source === 'contact') score += 30;
  if (source === 'footer') score += 20;
  if (source === 'about/team') score += 15;
  if (source === 'facebook' || source === 'instagram') score += 10;
  if (FREE_MAIL_DOMAINS.test(email)) score += 8;
  if (/(privacy|legal|dpo|gdpr|datenschutz)/i.test(prefix)) score -= 20;
  if (/[0-9]{3,}/.test(prefix)) score -= 15;
  return score;
}

async function fetchPage(url: string, timeoutMs = 4500): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LeadMapEmailFinder/2.0; +https://lovable.app)',
        'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5',
        'Accept-Language': 'en-US,en;q=0.8,sv;q=0.6,es;q=0.6',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const contentType = resp.headers.get('content-type') || '';
    if (!/html|text|xml|json/i.test(contentType)) return null;
    const reader = resp.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();
    let html = '';
    let bytes = 0;
    const MAX = 220_000;
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

function absolutize(base: URL, href: string): string | null {
  try {
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return null;
    return new URL(decodeHtml(href), base.origin).toString().split('#')[0];
  } catch {
    return null;
  }
}

function extractLinks(base: URL, html: string): { internal: string[]; socials: Record<string, string> } {
  const internal = new Set<string>();
  const socials: Record<string, string> = {};
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = absolutize(base, m[1]);
    if (!href) continue;
    const text = decodeHtml(m[2].replace(/<[^>]+>/g, ' ')).toLowerCase();
    const url = new URL(href);
    const hrefLower = href.toLowerCase();
    if (hrefLower.includes('facebook.com') && !socials.facebook) socials.facebook = href;
    if (hrefLower.includes('instagram.com') && !socials.instagram) socials.instagram = href;
    if (hrefLower.includes('linkedin.com') && !socials.linkedin) socials.linkedin = href;
    const sameHost = rootDomain(url.hostname) === rootDomain(base.hostname);
    const priority = PRIORITY_LINK_WORDS.some(word => hrefLower.includes(word) || text.includes(word));
    if (sameHost && priority) internal.add(href);
  }
  return { internal: [...internal], socials };
}

function buildFallbackUrls(base: URL): string[] {
  return FALLBACK_PATHS.map(path => new URL(path, base.origin).toString());
}

async function scrapeOne(item: ScrapeInput) {
  let url = item.website.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = `https://${url}`;
  const base = new URL(url);
  const domain = rootDomain(base.hostname);
  const queue: string[] = [base.origin + (base.pathname === '/' ? '' : base.pathname)];
  const pagesScanned: string[] = [];
  const socials: Record<string, string> = {};
  const found = new Map<string, FoundEmail>();

  const addEmails = (pageUrl: string, html: string) => {
    for (const email of cleanEmails(extractEmails(html))) {
      const source = sourceFor(pageUrl, html, email);
      if (!isPublicBusinessEmail(email, domain)) continue;
      const score = rank(email, domain, source);
      const existing = found.get(email);
      if (!existing || score > existing.score) found.set(email, { email, source, page: pageUrl, score });
    }
  };

  const firstHtml = await fetchPage(queue[0], 5500);
  if (firstHtml) {
    pagesScanned.push(queue[0]);
    addEmails(queue[0], firstHtml);
    const links = extractLinks(base, firstHtml);
    Object.assign(socials, links.socials);
    queue.push(...links.internal);
  }

  queue.push(...buildFallbackUrls(base));
  for (const socialUrl of Object.values(socials)) queue.push(socialUrl);

  const uniqueQueue = [...new Set(queue)].slice(0, 14);
  for (const pageUrl of uniqueQueue) {
    if (pagesScanned.includes(pageUrl)) continue;
    if (found.size >= 5 && !/facebook|instagram|linkedin/i.test(pageUrl)) break;
    const html = await fetchPage(pageUrl, /facebook|instagram|linkedin/i.test(pageUrl) ? 2500 : 3500);
    if (!html) continue;
    pagesScanned.push(pageUrl);
    addEmails(pageUrl, html);
    const links = extractLinks(base, html);
    Object.assign(socials, { ...links.socials, ...socials });
  }

  const emailsDetailed = [...found.values()].sort((a, b) => b.score - a.score);
  const best = emailsDetailed[0];
  return {
    leadId: item.leadId,
    emails: emailsDetailed.map(e => e.email),
    emailsDetailed,
    email: best?.email,
    source: best?.source ?? 'none',
    facebook_url: socials.facebook || null,
    instagram_url: socials.instagram || null,
    linkedin_url: socials.linkedin || null,
    pagesScanned,
    confidence: best ? Math.max(0, Math.min(100, best.score)) : 0,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const { requireCronServiceOrUserJwt } = await import('../_shared/auth.ts');
  const authFail = await requireCronServiceOrUserJwt(req, corsHeaders);
  if (authFail) return authFail;

  try {
    const { urls } = await req.json() as { urls: ScrapeInput[] };
    if (!urls?.length) {
      return new Response(JSON.stringify({ success: false, error: 'urls array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const batch = urls.slice(0, 4);
    const results = [];
    for (const item of batch) {
      try {
        results.push(await scrapeOne(item));
      } catch (e) {
        results.push({
          leadId: item.leadId,
          emails: [],
          source: 'none',
          error: e instanceof Error ? e.message : 'fetch failed',
        });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in scrape-emails:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
