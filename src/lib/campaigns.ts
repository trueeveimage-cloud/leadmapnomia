import { supabase } from "@/integrations/supabase/client";
import type { Country } from '@/lib/cities';
import { detectLeadCountry } from '@/lib/countryRouting';

type LeadEligibilityRow = {
  id: string;
  phone: string | null;
  address: string | null;
  section: string;
  rating: number | null;
  reviews_count: number | null;
  website: string | null;
  outreach_opt_out: boolean;
  has_replied: boolean;
  last_outbound_at: string | null;
  status: string;
};

const EXCLUDED_STATUSES = ['interested', 'not_interested', 'unsure', 'callback', 'closed_won', 'closed_lost', 'contacted'];

export interface AudienceFilter {
  sections?: string[];
  hasWebsite?: boolean;
  minRating?: number;
  minReviews?: number;
  excludeOptOut?: boolean;
  excludeReplied?: boolean;
  excludeMissingPhone?: boolean;
  countries?: Country[];
}

export interface Campaign {
  id: string;
  name: string;
  audience_filter: AudienceFilter;
  template_text: string;
  variables_used: string[];
  daily_cap: number;
  batch_cap: number;
  cooldown_days: number;
  call_after_hours: number;
  status: 'draft' | 'running' | 'paused' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface CampaignRun {
  id: string;
  campaign_id: string;
  started_at: string;
  ended_at: string | null;
  stats: Record<string, number>;
  notes: string | null;
  created_at: string;
}

export async function fetchCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data as Campaign[];
}

export async function fetchCampaign(id: string): Promise<Campaign> {
  const { data, error } = await supabase.from('campaigns').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Campaign;
}

export async function createCampaign(campaign: Partial<Campaign>): Promise<Campaign> {
  const payload = {
    ...campaign,
    audience_filter: campaign.audience_filter ? JSON.parse(JSON.stringify(campaign.audience_filter)) : {},
    variables_used: campaign.variables_used ? JSON.parse(JSON.stringify(campaign.variables_used)) : [],
  };
  const { data, error } = await supabase.from('campaigns').insert(payload as any).select().single();
  if (error) throw error;
  return data as Campaign;
}

export async function updateCampaign(id: string, updates: Partial<Campaign>): Promise<Campaign> {
  const payload: any = { ...updates };
  if (updates.audience_filter) payload.audience_filter = JSON.parse(JSON.stringify(updates.audience_filter));
  if (updates.variables_used) payload.variables_used = JSON.parse(JSON.stringify(updates.variables_used));
  const { data, error } = await supabase.from('campaigns').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data as Campaign;
}

export async function deleteCampaign(id: string): Promise<void> {
  const { error } = await supabase.from('campaigns').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchCampaignRuns(campaignId: string): Promise<CampaignRun[]> {
  const { data, error } = await supabase.from('campaign_runs').select('*').eq('campaign_id', campaignId).order('started_at', { ascending: false });
  if (error) throw error;
  return data as CampaignRun[];
}

export interface EligibilityBreakdown {
  total: number;
  eligible: number;
  noPhone: number;
  landline: number;
  optedOut: number;
  replied: number;
  cooldown: number;
  hasWebsite: number;
  wrongSection: number;
  lowRating: number;
  lowReviews: number;
}

function isMobileNumber(phone: string, address?: string | null): boolean {
  const cleaned = phone.replace(/\s|-/g, '');
  const country = detectLeadCountry(address, phone);
  
  if (country === 'NO') {
    // Norwegian mobiles: 8 digits starting with 4 or 9
    return /^(\+47|47)?(4|9)\d{7}$/.test(cleaned) || /^(4|9)\d{7}$/.test(cleaned);
  }
  if (country === 'DK') {
    // Danish mobiles: 8 digits, prefixes 2x, 30-31, 40-42, 50-53, 60-61, 71, 80-81, 91-93
    return /^(\+45|45)?(2\d|3[01]|4[0-2]|5[0-3]|6[01]|71|8[01]|9[1-3])\d{6}$/.test(cleaned) ||
           /^(2\d|3[01]|4[0-2]|5[0-3]|6[01]|71|8[01]|9[1-3])\d{6}$/.test(cleaned);
  }
  // Swedish mobile prefixes: 070, 072, 073, 076, 079
  return /^(070|072|073|076|079|\+46(70|72|73|76|79)|46(70|72|73|76|79))/.test(cleaned);
}

async function fetchLeadEligibilityRows(): Promise<LeadEligibilityRow[]> {
  const allLeads: LeadEligibilityRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('leads')
      .select('id, phone, address, section, rating, reviews_count, website, outreach_opt_out, has_replied, last_outbound_at, status')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allLeads.push(...(data as LeadEligibilityRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allLeads;
}

async function fetchPreviouslyMessagedLeadIds(): Promise<Set<string>> {
  const leadIds = new Set<string>();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('message_logs')
      .select('lead_id')
      .eq('direction', 'outbound')
      .not('campaign_run_id', 'is', null)
      .not('status', 'eq', 'failed')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row.lead_id) leadIds.add(row.lead_id);
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return leadIds;
}

function getLeadIneligibilityReason(
  lead: LeadEligibilityRow,
  filter: AudienceFilter,
  countries?: Country[],
): keyof Omit<EligibilityBreakdown, 'total' | 'eligible'> | null {
  const activeCountries = countries?.length ? countries : filter.countries;

  if (activeCountries?.length) {
    const leadCountry = detectLeadCountry(lead.address, lead.phone);
    if (!activeCountries.includes(leadCountry)) return 'wrongSection';
  }
  if (!lead.phone) return 'noPhone';
  if (!isMobileNumber(lead.phone, lead.address)) return 'landline';
  if (filter.excludeOptOut !== false && lead.outreach_opt_out) return 'optedOut';
  if (filter.excludeReplied !== false && lead.has_replied) return 'replied';
  if (lead.last_outbound_at) return 'cooldown';
  if (EXCLUDED_STATUSES.includes(lead.status)) return 'cooldown';
  if (filter.sections?.length && !filter.sections.includes(lead.section)) return 'wrongSection';
  if (filter.hasWebsite === false && lead.website) return 'hasWebsite';
  if (filter.minRating && (lead.rating == null || lead.rating < filter.minRating)) return 'lowRating';
  if (filter.minReviews && (lead.reviews_count == null || lead.reviews_count < filter.minReviews)) return 'lowReviews';

  return null;
}

export async function countEligibleLeads(filter: AudienceFilter, cooldownDays: number): Promise<number> {
  const breakdown = await countEligibleLeadsDetailed(filter, cooldownDays);
  return breakdown.eligible;
}

export async function countSendableLeads(filter: AudienceFilter, countries?: Country[]): Promise<number> {
  const [allLeads, previouslyMessagedLeadIds] = await Promise.all([
    fetchLeadEligibilityRows(),
    fetchPreviouslyMessagedLeadIds(),
  ]);

  let sendable = 0;
  for (const lead of allLeads) {
    if (getLeadIneligibilityReason(lead, filter, countries)) continue;
    if (previouslyMessagedLeadIds.has(lead.id)) continue;
    sendable++;
  }

  return sendable;
}

export async function countEligibleLeadsDetailed(filter: AudienceFilter, cooldownDays: number): Promise<EligibilityBreakdown> {
  const allLeads = await fetchLeadEligibilityRows();

  const breakdown: EligibilityBreakdown = {
    total: allLeads.length,
    eligible: 0,
    noPhone: 0,
    landline: 0,
    optedOut: 0,
    replied: 0,
    cooldown: 0,
    hasWebsite: 0,
    wrongSection: 0,
    lowRating: 0,
    lowReviews: 0,
  };

  for (const lead of allLeads) {
    const reason = getLeadIneligibilityReason(lead, filter);
    if (reason) {
      breakdown[reason]++;
      continue;
    }
    breakdown.eligible++;
  }

  return breakdown;
}

export function renderTemplate(template: string, lead: Record<string, any>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return lead[key] ?? '';
  });
}
