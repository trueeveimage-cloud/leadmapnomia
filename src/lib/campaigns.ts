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

const MOBILE_REGEX = /^(070|072|073|076|079|\+46(70|72|73|76|79)|46(70|72|73|76|79))/;

function isMobileNumber(phone: string): boolean {
  return MOBILE_REGEX.test(phone.replace(/\s|-/g, ''));
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
      .select('id, phone, section, rating, reviews_count, website, outreach_opt_out, has_replied, last_outbound_at')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allLeads.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const cooldownDate = new Date(Date.now() - cooldownDays * 86400000);
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
    // Check each exclusion reason (a lead can only be counted in first matching reason)
    if (!lead.phone) { breakdown.noPhone++; continue; }
    if (!isMobileNumber(lead.phone)) { breakdown.landline++; continue; }
    if (filter.excludeOptOut !== false && lead.outreach_opt_out) { breakdown.optedOut++; continue; }
    if (filter.excludeReplied !== false && lead.has_replied) { breakdown.replied++; continue; }
    if (filter.sections?.length && !filter.sections.includes(lead.section)) { breakdown.wrongSection++; continue; }
    if (filter.hasWebsite === false && lead.website) { breakdown.hasWebsite++; continue; }
    if (filter.minRating && (lead.rating == null || lead.rating < filter.minRating)) { breakdown.lowRating++; continue; }
    if (filter.minReviews && (lead.reviews_count == null || lead.reviews_count < filter.minReviews)) { breakdown.lowReviews++; continue; }
    if (lead.last_outbound_at && new Date(lead.last_outbound_at) > cooldownDate) { breakdown.cooldown++; continue; }
    breakdown.eligible++;
  }

  return breakdown;
}

export function renderTemplate(template: string, lead: Record<string, any>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return lead[key] ?? '';
  });
}
