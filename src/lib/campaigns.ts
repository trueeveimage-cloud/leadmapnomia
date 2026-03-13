import { supabase } from "@/integrations/supabase/client";
import type { Country } from '@/lib/cities';

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

import { detectLeadCountry } from '@/lib/countryRouting';

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

export async function countEligibleLeads(filter: AudienceFilter, cooldownDays: number): Promise<number> {
  const breakdown = await countEligibleLeadsDetailed(filter, cooldownDays);
  return breakdown.eligible;
}

export async function countEligibleLeadsDetailed(filter: AudienceFilter, cooldownDays: number): Promise<EligibilityBreakdown> {
  // Fetch all leads with minimal fields
  const allLeads: any[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('leads')
      .select('id, phone, address, section, rating, reviews_count, website, outreach_opt_out, has_replied, last_outbound_at, status')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allLeads.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const excludedStatuses = ['interested', 'not_interested', 'unsure', 'callback', 'closed_won', 'closed_lost', 'contacted'];

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
    // Country filter
    if (filter.countries?.length) {
      const leadCountry = detectLeadCountry(lead.address, lead.phone);
      if (!filter.countries.includes(leadCountry)) { breakdown.wrongSection++; continue; }
    }
    // Check each exclusion reason (a lead can only be counted in first matching reason)
    if (!lead.phone) { breakdown.noPhone++; continue; }
    if (!isMobileNumber(lead.phone, lead.address)) { breakdown.landline++; continue; }
    if (filter.excludeOptOut !== false && lead.outreach_opt_out) { breakdown.optedOut++; continue; }
    if (filter.excludeReplied !== false && lead.has_replied) { breakdown.replied++; continue; }
    // Exclude already contacted leads (last_outbound_at is set = already messaged)
    if (lead.last_outbound_at) { breakdown.cooldown++; continue; }
    // Exclude leads with engaged/contacted statuses
    if (excludedStatuses.includes(lead.status)) { breakdown.cooldown++; continue; }
    if (filter.sections?.length && !filter.sections.includes(lead.section)) { breakdown.wrongSection++; continue; }
    if (filter.hasWebsite === false && lead.website) { breakdown.hasWebsite++; continue; }
    if (filter.minRating && (lead.rating == null || lead.rating < filter.minRating)) { breakdown.lowRating++; continue; }
    if (filter.minReviews && (lead.reviews_count == null || lead.reviews_count < filter.minReviews)) { breakdown.lowReviews++; continue; }
    breakdown.eligible++;
  }

  return breakdown;
}

export function renderTemplate(template: string, lead: Record<string, any>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return lead[key] ?? '';
  });
}
