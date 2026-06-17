import { supabase } from '@/integrations/supabase/client';
import type { FinderCandidate } from '@/lib/finder';

export const PARTNER_STATUSES = [
  'new',
  'researching',
  'ready_to_contact',
  'contacted',
  'replied',
  'partner_call_booked',
  'qualified',
  'not_fit',
  'do_not_contact',
] as const;

export const PARTNER_TYPES = [
  'telecom',
  'pbx_voip',
  'agency_marketer',
  'installer',
  'consultant',
] as const;

export type PartnerStatus = typeof PARTNER_STATUSES[number];
export type PartnerType = typeof PARTNER_TYPES[number];

export type PartnerProspect = {
  id: string;
  name: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  partner_type: PartnerType;
  status: PartnerStatus;
  fit_score: number;
  fit_reason: string | null;
  source_url: string | null;
  source: string | null;
  notes: string | null;
  do_not_contact: boolean;
  last_contacted_at: string | null;
  last_reply_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PartnerOutreachLog = {
  id: string;
  partner_prospect_id: string | null;
  channel: string;
  direction: string;
  status: string;
  subject: string | null;
  body: string | null;
  to_email: string | null;
  provider: string | null;
  provider_message_id: string | null;
  error_message: string | null;
  created_at: string;
};

export type SavePartnerCandidatesResult = {
  saved: number;
  updated: number;
  skipped: number;
  errors: number;
};

export const PARTNER_SEARCH_PRESETS: Array<{
  type: PartnerType;
  label: string;
  keywords: Record<string, string[]>;
}> = [
  {
    type: 'telecom',
    label: 'Telecom',
    keywords: {
      SE: ['telekom foretag', 'telefonvaxel foretag', 'foretagstelefoni'],
      NO: ['telekom bedrift', 'telefonisystem bedrift'],
      DK: ['erhvervstelefoni', 'telefonanlaeg erhverv'],
      UK: ['business telecom provider', 'business phone systems'],
      ES: ['telecomunicaciones empresas', 'telefonia empresas'],
    },
  },
  {
    type: 'pbx_voip',
    label: 'PBX / VoIP',
    keywords: {
      SE: ['voip foretag', 'pbx foretag', 'molnvaxel'],
      NO: ['voip bedrift', 'skybasert sentralbord'],
      DK: ['voip erhverv', 'cloud pbx'],
      UK: ['voip provider', 'cloud pbx provider'],
      ES: ['voip empresas', 'centralita virtual'],
    },
  },
  {
    type: 'agency_marketer',
    label: 'Agencies',
    keywords: {
      SE: ['webbyra', 'digital marknadsforingsbyra', 'seo byra'],
      NO: ['webbyra', 'digital markedsforing byra'],
      DK: ['webbureau', 'digital marketing bureau'],
      UK: ['web design agency', 'digital marketing agency'],
      ES: ['agencia marketing digital', 'agencia web'],
    },
  },
  {
    type: 'installer',
    label: 'Installers',
    keywords: {
      SE: ['it installation foretag', 'natverksinstallation foretag'],
      NO: ['it installasjon bedrift', 'nettverksinstallasjon'],
      DK: ['it installation erhverv', 'netvaerksinstallation'],
      UK: ['business IT installer', 'network installation company'],
      ES: ['instalacion redes empresas', 'instalador informatico empresas'],
    },
  },
  {
    type: 'consultant',
    label: 'Consultants',
    keywords: {
      SE: ['affarskonsult smaforetag', 'it konsult foretag'],
      NO: ['bedriftsradgiver sma bedrifter', 'it konsulent bedrift'],
      DK: ['erhvervskonsulent sma virksomheder', 'it konsulent erhverv'],
      UK: ['small business consultant', 'IT consultant business'],
      ES: ['consultor empresas pequenas', 'consultor informatico empresas'],
    },
  },
];

export function partnerTypeLabel(type: PartnerType | string) {
  return PARTNER_SEARCH_PRESETS.find(item => item.type === type)?.label || String(type).replace(/_/g, ' ');
}

function normalizeEmail(value?: string | null) {
  return String(value || '').trim().toLowerCase() || null;
}

function normalizeWebsite(value?: string | null) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  return raw
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

export function partnerWebsiteHref(value?: string | null) {
  const website = String(value || '').trim();
  if (!website) return null;
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

function normalizeName(value?: string | null) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ') || null;
}

export function classifyPartner(candidate: Partial<FinderCandidate>, fallback?: PartnerType): { type: PartnerType; score: number; reason: string } {
  const text = [candidate.name, candidate.category, candidate.website, candidate.address].filter(Boolean).join(' ').toLowerCase();
  const signals: Array<[PartnerType, string[], string]> = [
    ['pbx_voip', ['voip', 'pbx', 'molnvaxel', 'vaxel', 'centralita', 'cloud phone'], 'Phone-system fit'],
    ['telecom', ['telecom', 'telekom', 'telefoni', 'telefon', 'carrier'], 'Telecom channel fit'],
    ['agency_marketer', ['agency', 'byra', 'bureau', 'marketing', 'seo', 'web design', 'webbyra'], 'Agency client-channel fit'],
    ['installer', ['install', 'installation', 'network', 'natverk', 'redes'], 'Installer handoff fit'],
    ['consultant', ['consult', 'konsult', 'radgiv', 'advisor'], 'Consultant referral fit'],
  ];
  for (const [type, words, reason] of signals) {
    if (words.some(word => text.includes(word))) {
      return { type, score: 78, reason };
    }
  }
  return { type: fallback || 'consultant', score: 62, reason: 'Potential B2B service partner' };
}

export async function fetchPartnerProspects(): Promise<PartnerProspect[]> {
  const { data, error } = await (supabase as any)
    .from('partner_prospects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchPartnerLogs(): Promise<PartnerOutreachLog[]> {
  const { data, error } = await (supabase as any)
    .from('partner_outreach_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data || [];
}

export async function upsertPartnerProspect(input: Partial<PartnerProspect>) {
  const normalizedEmail = normalizeEmail(input.email);
  const normalizedWebsite = normalizeWebsite(input.website);
  const normalizedName = normalizeName(input.name);
  const normalizedCity = normalizeName(input.city);
  const payload = {
    ...input,
    email: normalizedEmail,
    website: normalizedWebsite,
    updated_at: new Date().toISOString(),
  };
  const sb = supabase as any;
  let existing: PartnerProspect | null = null;
  if (normalizedEmail) {
    const { data } = await sb.from('partner_prospects').select('*').eq('email', normalizedEmail).maybeSingle();
    existing = data || null;
  }
  if (!existing && normalizedWebsite) {
    const { data } = await sb.from('partner_prospects').select('*').eq('website', normalizedWebsite).maybeSingle();
    existing = data || null;
  }
  if (!existing && normalizedName && normalizedCity) {
    const { data } = await sb
      .from('partner_prospects')
      .select('*')
      .ilike('name', normalizedName)
      .ilike('city', normalizedCity)
      .maybeSingle();
    existing = data || null;
  }
  const query = existing
    ? sb.from('partner_prospects').update(payload).eq('id', existing.id).select().single()
    : sb.from('partner_prospects').insert(payload).select().single();
  const { data, error } = await query;
  if (error) {
    const duplicateConflict = String(error.message || '').toLowerCase().includes('duplicate key');
    if (!duplicateConflict) throw error;

    const retry = normalizedEmail
      ? await sb.from('partner_prospects').select('*').eq('email', normalizedEmail).maybeSingle()
      : normalizedWebsite
        ? await sb.from('partner_prospects').select('*').eq('website', normalizedWebsite).maybeSingle()
        : await sb.from('partner_prospects').select('*').ilike('name', normalizedName || '').ilike('city', normalizedCity || '').maybeSingle();
    const retryExisting = retry.data || null;
    if (!retryExisting) throw error;
    const second = await sb.from('partner_prospects').update(payload).eq('id', retryExisting.id).select().single();
    if (second.error) throw second.error;
    return { prospect: second.data as PartnerProspect, created: false };
  }
  return { prospect: data as PartnerProspect, created: !existing };
}

export async function updatePartnerProspect(id: string, patch: Partial<PartnerProspect>) {
  const { data, error } = await (supabase as any)
    .from('partner_prospects')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as PartnerProspect;
}

export async function savePartnerCandidates(
  candidates: FinderCandidate[],
  input: { city: string; country: string; fallbackType?: PartnerType },
) {
  const result: SavePartnerCandidatesResult = { saved: 0, updated: 0, skipped: 0, errors: 0 };
  for (const candidate of candidates) {
    if (!candidate.website && !candidate.email && !candidate.phone) {
      result.skipped += 1;
      continue;
    }
    const fit = classifyPartner(candidate, input.fallbackType);
    try {
      const upserted = await upsertPartnerProspect({
        name: candidate.name,
        website: candidate.website,
        email: candidate.email,
        phone: candidate.phone,
        country: input.country,
        city: input.city,
        address: candidate.address,
        partner_type: fit.type,
        status: candidate.email ? 'ready_to_contact' : 'researching',
        fit_score: fit.score,
        fit_reason: fit.reason,
        source_url: candidate.maps_url,
        source: 'partner_finder',
      });
      if (upserted.created) result.saved += 1;
      else result.updated += 1;
    } catch {
      result.errors += 1;
    }
  }
  return result;
}

export function buildPartnerEmail(prospect: PartnerProspect) {
  const subject = `Partner idea for ${prospect.name}`;
  const body = `Hi ${prospect.name},

I am reaching out from Leadmap. We build an AI receptionist that helps service businesses answer missed calls, qualify the caller, and send a clean summary or booking request to the owner.

I thought this could fit your clients because many telecom, web, IT and local business providers already help companies get more calls, but missed calls still leak revenue.

Would it make sense to book a short partner call and see if this could become a useful add-on for your clients?

Best,
Leadmap.se`;
  return { subject, body };
}
