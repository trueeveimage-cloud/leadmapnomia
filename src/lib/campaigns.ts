import { supabase } from "@/integrations/supabase/client";

export interface AudienceFilter {
  sections?: string[];
  hasWebsite?: boolean;
  minRating?: number;
  minReviews?: number;
  excludeOptOut?: boolean;
  excludeReplied?: boolean;
  excludeMissingPhone?: boolean;
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

export async function countEligibleLeads(filter: AudienceFilter, cooldownDays: number): Promise<number> {
  let query = supabase.from('leads').select('id', { count: 'exact', head: true });

  if (filter.sections?.length) {
    query = query.in('section', filter.sections);
  }
  if (filter.hasWebsite === false) {
    query = query.is('website', null);
  }
  if (filter.minRating) {
    query = query.gte('rating', filter.minRating);
  }
  if (filter.minReviews) {
    query = query.gte('reviews_count', filter.minReviews);
  }
  if (filter.excludeOptOut !== false) {
    query = query.eq('outreach_opt_out', false);
  }
  if (filter.excludeReplied !== false) {
    query = query.eq('has_replied', false);
  }
  if (filter.excludeMissingPhone !== false) {
    query = query.not('phone', 'is', null);
  }

  // Cooldown check
  const cooldownDate = new Date(Date.now() - cooldownDays * 86400000).toISOString();
  query = query.or(`last_outbound_at.is.null,last_outbound_at.lt.${cooldownDate}`);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export function renderTemplate(template: string, lead: Record<string, any>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return lead[key] ?? '';
  });
}
