import { supabase } from '@/integrations/supabase/client';
import type { Lead } from '@/lib/supabase';

export type Workspace = 'nomia' | 'leadmap';

export const PIPELINE_STAGES = [
  'New',
  'Contacted',
  'Replied',
  'Interested',
  'Meeting Booked',
  'Demo/Proposal',
  'Won',
  'Lost',
] as const;

export type PipelineStage = typeof PIPELINE_STAGES[number];

/** Compute the pipeline stage from existing lead fields + appointments. No extra status column. */
export function computePipelineStage(lead: Partial<Lead> & Record<string, any>, hasAppointment = false): PipelineStage {
  const status = (lead.status || '') as string;
  const outreach = (lead.outreach_state || lead.outreach_stage || '') as string;
  const call = (lead.call_status || '') as string;

  if (status === 'closed_won' || outreach === 'closed' || call === 'Closed') return 'Won';
  if (status === 'closed_lost' || status === 'not_interested' || outreach === 'lost' || call === 'Lost' || call === 'Not interested') return 'Lost';
  if (status === 'demo' || status === 'demo_sent' || status === 'making_demo' || call === 'Demo sent') return 'Demo/Proposal';
  if (hasAppointment || call === 'Meeting requested' || call === 'Demo requested') return 'Meeting Booked';
  if (status === 'interested' || call === 'Interested') return 'Interested';
  if (lead.has_replied || outreach === 'replied' || lead.last_inbound_at) return 'Replied';
  if (
    lead.last_contacted_at ||
    lead.last_outbound_at ||
    ['email_sent', 'sms_sent', 'called'].includes(outreach) ||
    status === 'contacted'
  ) return 'Contacted';
  return 'New';
}

const LEAD_FIELDS =
  'id,name,business_name,category,niche_label,city,country,address,phone,phone_e164,email,website,website_quality,rating,reviews_count,status,section,outreach_state,outreach_stage,call_status,call_attempts,call_connected,has_replied,last_inbound_at,last_outbound_at,last_contacted_at,follow_up_at,next_action_at,do_not_contact,outreach_opt_out,notes,lead_tier,potential_score,product,created_at,updated_at,read_at';

export interface NomiaLeadFilters {
  search?: string;
  swedenOnly?: boolean;
  hasEmail?: boolean;
  hasPhone?: boolean;
  outreachState?: string;
  stage?: PipelineStage | 'all';
  includeDnc?: boolean;
}

/** Every query is product-scoped. Never combine workspaces. */
export async function fetchWorkspaceLeads(product: Workspace, filters: NomiaLeadFilters = {}, limit = 500) {
  let q = supabase
    .from('leads')
    .select(LEAD_FIELDS)
    .eq('product', product)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (filters.search) {
    const s = filters.search.replace(/[%,]/g, '');
    q = q.or(`name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%,city.ilike.%${s}%`);
  }
  if (filters.swedenOnly) q = q.or('country.is.null,country.eq.SE');
  if (filters.hasEmail) q = q.not('email', 'is', null);
  if (filters.hasPhone) q = q.not('phone', 'is', null);
  if (filters.outreachState && filters.outreachState !== 'all') q = q.eq('outreach_state', filters.outreachState);
  if (!filters.includeDnc) q = q.or('do_not_contact.is.null,do_not_contact.eq.false');

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchWorkspaceCounts(product: Workspace) {
  const head = (build: (q: any) => any) =>
    build(supabase.from('leads').select('id', { count: 'exact', head: true }).eq('product', product));

  const [total, withEmail, withPhone, replied, dnc] = await Promise.all([
    head((q: any) => q),
    head((q: any) => q.not('email', 'is', null)),
    head((q: any) => q.not('phone', 'is', null)),
    head((q: any) => q.eq('has_replied', true)),
    head((q: any) => q.eq('do_not_contact', true)),
  ]);

  return {
    total: total.count || 0,
    withEmail: withEmail.count || 0,
    withPhone: withPhone.count || 0,
    replied: replied.count || 0,
    doNotContact: dnc.count || 0,
  };
}

/** Leads that already have an appointment (used for the computed pipeline). */
export async function fetchAppointmentLeadIds(leadIds: string[]) {
  if (!leadIds.length) return new Set<string>();
  const ids = new Set<string>();
  for (let i = 0; i < leadIds.length; i += 200) {
    const { data } = await supabase
      .from('lead_appointments')
      .select('lead_id,status')
      .in('lead_id', leadIds.slice(i, i + 200));
    (data || []).forEach((r: any) => {
      if (r.status !== 'cancelled') ids.add(r.lead_id);
    });
  }
  return ids;
}

/** Backend eligibility + lock. Must be called immediately before exposing a dialer / sending. */
export async function acquireOutreachLock(leadId: string, method: 'email' | 'sms' | 'call' | 'ai_call') {
  const { data, error } = await (supabase as any).functions.invoke('outreach-guard', {
    body: { lead_id: leadId, method },
  });
  if (error) throw error;
  return data as { allowed: boolean; reason?: string; identity_kind?: string; conflict_lead_name?: string };
}

export async function unlockOutreachIdentity(leadId: string, method: string, reason: string) {
  const { data, error } = await (supabase as any).rpc('unlock_outreach_identity', {
    p_lead_id: leadId,
    p_method: method,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}

export async function fetchSettings(keys: string[]) {
  const { data } = await supabase.from('settings').select('key,value').in('key', keys);
  const map: Record<string, string> = {};
  (data || []).forEach((r: any) => { map[r.key] = r.value; });
  return map;
}

export async function isOutreachPaused() {
  const s = await fetchSettings(['outreach_master_paused', 'nomia_gmail_paused', 'nomia_ai_calls_paused', 'nomia_sms_paused']);
  return {
    master: s.outreach_master_paused === 'true',
    gmail: s.nomia_gmail_paused === 'true',
    aiCalls: s.nomia_ai_calls_paused === 'true',
    sms: s.nomia_sms_paused === 'true',
  };
}

export const NOMIA_GMAIL_CAP = 10;
export const NOMIA_AI_CALL_CAP = 5;
