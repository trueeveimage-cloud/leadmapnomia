import { supabase } from '@/integrations/supabase/client';
import { detectCountry, isCallEligible, isEmailEligible, normalizePhone, validEmail } from '@/lib/outreachEligibility';

export type LeadSupplyStats = {
  total: number;
  readyEmail: number;
  readyCall: number;
  missingEmail: number;
  missingPhone: number;
  alreadyContacted: number;
  doNotContact: number;
  duplicateEmails: number;
  readyEmailByCountry: Record<string, number>;
  readyCallByCountry: Record<string, number>;
  latestLeadAt: string | null;
};

export const EMPTY_LEAD_SUPPLY_STATS: LeadSupplyStats = {
  total: 0,
  readyEmail: 0,
  readyCall: 0,
  missingEmail: 0,
  missingPhone: 0,
  alreadyContacted: 0,
  doNotContact: 0,
  duplicateEmails: 0,
  readyEmailByCountry: {},
  readyCallByCountry: {},
  latestLeadAt: null,
};

const LEAD_SUPPLY_COLUMNS = [
  'id',
  'created_at',
  'email',
  'phone',
  'phone_e164',
  'lead_tier',
  'outreach_stage',
  'outreach_state',
  'outreach_opt_out',
  'do_not_contact',
  'last_called_at',
  'last_contacted_at',
  'last_contact_method',
  'last_message_status',
  'call_attempts',
  'no_answer_count',
  'next_call_after',
  'call_status',
  'call_connected',
  'product',
  'status',
  'potential_score',
  'country',
  'address',
].join(',');

function addBucket(target: Record<string, number>, key: string) {
  target[key] = (target[key] || 0) + 1;
}

export function leadAlreadyContacted(lead: any) {
  return !!lead.last_contacted_at
    || !!lead.last_called_at
    || String(lead.last_contact_method || '').toLowerCase() === 'email'
    || String(lead.last_contact_method || '').toLowerCase() === 'ai call'
    || String(lead.outreach_stage || '').toLowerCase() === 'email_sent'
    || String(lead.outreach_state || '').toLowerCase() === 'email_sent'
    || String(lead.outreach_state || '').toLowerCase() === 'called'
    || lead.call_connected === true;
}

export function buildLeadSupplyStats(leads: any[]): LeadSupplyStats {
  const stats: LeadSupplyStats = {
    ...EMPTY_LEAD_SUPPLY_STATS,
    readyEmailByCountry: {},
    readyCallByCountry: {},
  };
  const seenRawEmails = new Set<string>();
  const seenEligibleEmails = new Set<string>();

  for (const lead of leads) {
    stats.total += 1;
    if (!stats.latestLeadAt || String(lead.created_at || '') > stats.latestLeadAt) {
      stats.latestLeadAt = lead.created_at || stats.latestLeadAt;
    }

    const email = String(lead.email || '').trim().toLowerCase();
    const hasEmail = validEmail(email);
    const hasPhone = !!normalizePhone(lead.phone_e164 || lead.phone);
    const blocked = lead.outreach_opt_out || lead.do_not_contact === true || lead.outreach_state === 'do_not_contact';

    if (!hasEmail) stats.missingEmail += 1;
    if (!hasPhone) stats.missingPhone += 1;
    if (blocked) stats.doNotContact += 1;
    if (leadAlreadyContacted(lead)) stats.alreadyContacted += 1;
    if (hasEmail && seenRawEmails.has(email)) stats.duplicateEmails += 1;
    if (hasEmail) seenRawEmails.add(email);

    if (isEmailEligible(lead, seenEligibleEmails)) {
      stats.readyEmail += 1;
      addBucket(stats.readyEmailByCountry, detectCountry(lead));
    }

    if (isCallEligible(lead, { product: 'leadmap', countries: ['SE'] })) {
      stats.readyCall += 1;
      addBucket(stats.readyCallByCountry, detectCountry(lead));
    }
  }

  return stats;
}

export async function loadLeadmapSupplyStats(): Promise<LeadSupplyStats> {
  const sb = supabase as any;
  const pageSize = 1000;
  const leads: any[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from('leads')
      .select(LEAD_SUPPLY_COLUMNS)
      .eq('product', 'leadmap')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    leads.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return buildLeadSupplyStats(leads);
}
