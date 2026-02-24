import { supabase } from "@/integrations/supabase/client";

export type LeadSection = 'unsorted' | 'phone' | 'email' | 'missing' | 'both';
export type LeadStatus =
  | 'not_contacted'
  | 'contacted'
  | 'answered'
  | 'callback'
  | 'interested'
  | 'not_interested'
  | 'unsure'
  | 'demo'
  | 'closed_won'
  | 'closed_lost';

export type CallOutcome = 'answered' | 'not_answered' | 'busy' | 'wrong_number' | 'callback_later';

export interface Lead {
  id: string;
  place_id: string | null;
  maps_url: string | null;
  name: string;
  category: string | null;
  niche_label: string | null;
  rating: number | null;
  reviews_count: number | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  section: LeadSection;
  status: LeadStatus;
  call_outcome_last: string | null;
  next_action_at: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  // Outreach fields
  phone_e164: string | null;
  outreach_opt_out: boolean;
  last_outbound_at: string | null;
  last_inbound_at: string | null;
  has_replied: boolean;
  needs_call: boolean;
  call_after_at: string | null;
  outreach_stage: string;
  last_message_preview: string | null;
  last_message_direction: string | null;
  last_message_status: string | null;
  // Contact tracking
  call_attempts: number;
  last_contacted_at: string | null;
  last_contact_method: string | null;
}

export interface Activity {
  id: string;
  lead_id: string;
  type: string;
  payload: Record<string, any>;
  created_at: string;
}

/** Determine section from contact info */
export function determineSection(lead: Partial<Lead>): LeadSection {
  const hasPhone = !!(lead.phone && lead.phone.trim());
  const hasEmail = !!(lead.email && lead.email.trim());

  if (hasPhone && hasEmail) return 'both';
  if (hasEmail) return 'email';
  if (hasPhone) return 'phone';
  return 'missing';
}

export async function fetchLeads(filter?: { section?: LeadSection; status?: LeadStatus }) {
  let query = supabase.from('leads').select('*').order('created_at', { ascending: false });
  if (filter?.section !== undefined) query = query.eq('section', filter.section);
  if (filter?.status) query = query.eq('status', filter.status);

  // Fetch all rows (no 1000 limit) via pagination
  const allData: any[] = [];
  const PAGE_SIZE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allData.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allData as Lead[];
}

export async function fetchLeadCounts() {
  const { data, error } = await supabase.from('leads').select('section, status, next_action_at');
  if (error) throw error;
  const leads = data as Pick<Lead, 'section' | 'status' | 'next_action_at'>[];
  const now = new Date();

  return {
    total: leads.length,
    unsorted: leads.filter(l => l.section === 'unsorted').length,
    phone: leads.filter(l => l.section === 'phone').length,
    email: leads.filter(l => l.section === 'email').length,
    both: leads.filter(l => l.section === 'both').length,
    missing: leads.filter(l => l.section === 'missing').length,
    callbacks: leads.filter(l => l.status === 'callback').length,
    callbacksDue: leads.filter(l => l.status === 'callback' && l.next_action_at && new Date(l.next_action_at) <= now).length,
    not_contacted: leads.filter(l => l.status === 'not_contacted').length,
    contacted: leads.filter(l => l.status === 'contacted').length,
    answered: leads.filter(l => l.status === 'answered').length,
    interested: leads.filter(l => l.status === 'interested').length,
    not_interested: leads.filter(l => l.status === 'not_interested').length,
    unsure: leads.filter(l => l.status === 'unsure').length,
    demo: leads.filter(l => l.status === 'demo').length,
    closed_won: leads.filter(l => l.status === 'closed_won').length,
    closed_lost: leads.filter(l => l.status === 'closed_lost').length,
  };
}

export async function addLead(lead: Partial<Omit<Lead, 'id' | 'created_at' | 'updated_at'>> & { name: string }): Promise<{ lead?: Lead; duplicate?: Lead; error?: string }> {
  // Check for duplicate by place_id
  if (lead.place_id) {
    const { data: existing } = await supabase.from('leads').select('*').eq('place_id', lead.place_id).maybeSingle();
    if (existing) return { duplicate: existing as Lead };
  }

  // Check for duplicate by normalized name + address
  if (lead.name && lead.address) {
    const normName = lead.name.toLowerCase().trim();
    const normAddr = lead.address.toLowerCase().trim().slice(0, 50);
    const { data: existing } = await supabase
      .from('leads').select('*')
      .ilike('name', normName)
      .ilike('address', `${normAddr}%`)
      .maybeSingle();
    if (existing) return { duplicate: existing as Lead };
  }

  const { data, error } = await supabase.from('leads').insert(lead).select().single();
  if (error) return { error: error.message };
  return { lead: data as Lead };
}

export async function updateLead(id: string, updates: Partial<Lead>): Promise<Lead> {
  const { data, error } = await supabase.from('leads').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data as Lead;
}

export async function deleteLead(id: string): Promise<void> {
  const { error } = await supabase.from('leads').delete().eq('id', id);
  if (error) throw error;
}

export async function logActivity(leadId: string, type: string, payload: Record<string, any> = {}) {
  await supabase.from('activities').insert({ lead_id: leadId, type, payload });
}

export async function fetchActivities(leadId: string): Promise<Activity[]> {
  const { data, error } = await supabase.from('activities').select('*').eq('lead_id', leadId).order('created_at', { ascending: false });
  if (error) throw error;
  return data as Activity[];
}

export async function getSetting(key: string): Promise<string | null> {
  const { data } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
  return data?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  await supabase.from('settings').upsert({ key, value }, { onConflict: 'key' });
}
