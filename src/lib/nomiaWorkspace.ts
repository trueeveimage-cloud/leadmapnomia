/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Lead } from '@/lib/supabase';
import { supabase } from '@/integrations/supabase/client';

export type NomiaPipelineStage =
  | 'new'
  | 'contacted'
  | 'replied'
  | 'interested'
  | 'meeting_booked'
  | 'proposal'
  | 'won'
  | 'lost';

export const NOMIA_PIPELINE_LABELS: Record<NomiaPipelineStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  replied: 'Replied',
  interested: 'Interested',
  meeting_booked: 'Meeting booked',
  proposal: 'Demo / proposal',
  won: 'Won',
  lost: 'Lost',
};

export function isSwedishLead(lead: Partial<Lead>) {
  const country = String(lead.country || '').toUpperCase();
  if (country) return country === 'SE';
  const phone = String(lead.phone_e164 || lead.phone || '').replace(/[\s-]/g, '');
  const address = String(lead.address || '').toLowerCase();
  return phone.startsWith('+46') || phone.startsWith('0') || address.includes('sweden') || address.includes('sverige');
}

export function isDoNotContact(lead: Partial<Lead>) {
  return lead.do_not_contact === true
    || lead.outreach_opt_out === true
    || lead.outreach_state === 'do_not_contact'
    || lead.call_status === 'Do not contact';
}

export function getNomiaPipelineStage(lead: Partial<Lead>, hasMeeting = false): NomiaPipelineStage {
  if (lead.status === 'closed_won' || lead.outreach_state === 'closed') return 'won';
  if (lead.status === 'closed_lost' || lead.status === 'not_interested' || lead.outreach_state === 'lost' || isDoNotContact(lead)) return 'lost';
  if (lead.status === 'demo' || lead.status === 'making_demo' || lead.call_status === 'Demo sent' || lead.call_status === 'Demo requested') return 'proposal';
  if (hasMeeting) return 'meeting_booked';
  if (lead.status === 'interested' || lead.call_status === 'Interested' || lead.call_status === 'Meeting requested') return 'interested';
  if (lead.has_replied || lead.outreach_state === 'replied' || lead.status === 'answered') return 'replied';
  if (lead.outreach_state === 'email_sent' || lead.outreach_state === 'called' || lead.status === 'contacted' || (lead.call_attempts || 0) > 0) return 'contacted';
  return 'new';
}

export function renderNomiaTemplate(template: string, lead: Partial<Lead>) {
  const values: Record<string, string> = {
    business_name: lead.name || '',
    name: lead.name || '',
    owner_name: lead.owner_name || 'there',
    city: lead.city || '',
    niche: lead.niche_label || lead.category || 'business',
  };
  return template.replace(/{{(business_name|name|owner_name|city|niche)}}/g, (_, key: string) => values[key] || '');
}

export type NomiaAppointment = {
  id: string;
  lead_id: string;
  title: string;
  scheduled_at: string;
  status: string | null;
};

export type NomiaCampaignSummary = {
  id: string;
  name: string;
  channel: string;
  approval_status: string;
  status: string;
  created_at: string;
};

export type NomiaMessageSummary = {
  id: string;
  lead_id: string;
  direction: string;
  channel: string;
  status: string;
  created_at: string;
};

export async function fetchNomiaWorkspaceSnapshot() {
  const client = supabase as any;
  const [leadsResult, appointmentsResult, campaignsResult, messagesResult] = await Promise.all([
    client.from('leads').select('*').eq('product', 'nomia').order('created_at', { ascending: false }).limit(6000),
    client.from('lead_appointments').select('id,lead_id,title,scheduled_at,status,leads!inner(product)').eq('leads.product', 'nomia').order('scheduled_at', { ascending: true }).limit(1000),
    client.from('campaigns').select('id,name,channel,approval_status,status,created_at').eq('product', 'nomia').order('created_at', { ascending: false }).limit(500),
    client.from('message_logs').select('id,lead_id,direction,channel,status,created_at').eq('product', 'nomia').order('created_at', { ascending: false }).limit(5000),
  ]);
  const error = leadsResult.error || appointmentsResult.error || campaignsResult.error || messagesResult.error;
  if (error) throw error;
  return {
    leads: (leadsResult.data || []) as Lead[],
    appointments: (appointmentsResult.data || []) as NomiaAppointment[],
    campaigns: (campaignsResult.data || []) as NomiaCampaignSummary[],
    messages: (messagesResult.data || []) as NomiaMessageSummary[],
  };
}
