import type { Lead } from '@/lib/supabase';
import { OUTREACH_STATE_LABELS, type OutreachState } from '@/lib/sharedCrmContract';

export type OutreachMethod = 'email' | 'sms' | 'call' | 'ai_call';

export const OUTREACH_STATES = Object.keys(OUTREACH_STATE_LABELS) as OutreachState[];

export function normalizeEmail(email?: string | null) {
  return (email || '').trim().toLowerCase();
}

export function normalizePhone(phone?: string | null) {
  return (phone || '').replace(/[^\d+]/g, '');
}

export function normalizeDomain(website?: string | null) {
  if (!website) return '';
  try {
    const withProtocol = website.startsWith('http') ? website : `https://${website}`;
    return new URL(withProtocol).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
  }
}

export function getOutreachState(lead: Lead): OutreachState {
  const raw = ((lead as any).outreach_state || (lead as any).outreach_stage || lead.status || 'not_contacted') as string;
  if (lead.outreach_opt_out || (lead as any).do_not_contact) return 'do_not_contact';
  if (raw === 'email_sent') return 'email_sent';
  if (raw === 'sms_sent') return 'sms_sent';
  if (raw === 'called') return 'called';
  if (raw === 'follow_up') return 'follow_up_needed';
  if (raw === 'closed_won') return 'closed';
  if (raw === 'closed_lost') return 'lost';
  if (OUTREACH_STATES.includes(raw as OutreachState)) return raw as OutreachState;
  return lead.last_contacted_at ? 'called' : 'not_contacted';
}

export function getOutreachBlockReason(lead: Lead, method: OutreachMethod) {
  const state = getOutreachState(lead);
  if (state === 'do_not_contact') return 'This lead is marked Do not contact.';
  if ((method === 'email' && state === 'email_sent') || (method === 'email' && !!lead.last_outbound_at)) {
    return 'Email was already sent to this lead.';
  }
  if (method === 'sms' && state === 'sms_sent') return 'SMS was already sent to this lead.';
  if ((method === 'call' || method === 'ai_call') && state === 'called') return 'This lead was already called.';
  if (method === 'ai_call' && ((lead as any).call_attempts || 0) >= 2) return 'AI call limit reached for this lead.';
  if ((method === 'call' || method === 'ai_call') && !lead.phone) return 'This lead has no phone number.';
  if (method === 'email' && !lead.email) return 'This lead has no email address.';
  if (method === 'sms' && !lead.phone) return 'This lead has no phone number.';
  return null;
}

export function assertOutreachAllowed(lead: Lead, method: OutreachMethod) {
  const reason = getOutreachBlockReason(lead, method);
  if (reason) throw new Error(reason);
}
