export const NORMAL_GMAIL_DAILY_TARGET = 120;
export const TUESDAY_GMAIL_DAILY_TARGET = 240;

export const FINAL_CALL_STATUSES = ['interested', 'not_interested', 'callback', 'closed_won', 'closed_lost'];

export function validEmail(value?: string | null) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export function normalizePhone(value?: string | null) {
  const compact = String(value || '').trim().replace(/[^\d+]/g, '');
  if (!compact) return null;
  if (compact.startsWith('+')) return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
  if (compact.startsWith('00')) {
    const next = `+${compact.slice(2)}`;
    return /^\+[1-9]\d{7,14}$/.test(next) ? next : null;
  }
  if (compact.startsWith('0')) {
    const next = `+46${compact.slice(1)}`;
    return /^\+[1-9]\d{7,14}$/.test(next) ? next : null;
  }
  if (compact.startsWith('46')) {
    const next = `+${compact}`;
    return /^\+[1-9]\d{7,14}$/.test(next) ? next : null;
  }
  return null;
}

export function detectCountry(lead: any) {
  const explicit = String(lead?.country || '').trim().toUpperCase();
  if (explicit) return explicit;
  const phone = String(lead?.phone_e164 || lead?.phone || '');
  const address = String(lead?.address || '').toLowerCase();
  if (phone.startsWith('+47') || address.includes('norway') || address.includes('norge')) return 'NO';
  if (phone.startsWith('+45') || address.includes('denmark') || address.includes('danmark')) return 'DK';
  if (phone.startsWith('+44') || address.includes('united kingdom') || address.includes(' uk')) return 'UK';
  if (phone.startsWith('+34') || address.includes('spain') || address.includes('espana') || address.includes('espa')) return 'ES';
  return 'SE';
}

export function connectedCallStatus(status?: string | null) {
  const value = String(status || '').toLowerCase();
  return !!value && !['no answer', 'calling', 'error', 'dead (3x no answer)', 'failed', 'busy'].includes(value);
}

export function isEmailEligible(lead: any, seenEmails?: Set<string>) {
  const email = String(lead?.email || '').trim().toLowerCase();
  if (!validEmail(email)) return false;
  if (seenEmails?.has(email)) return false;
  seenEmails?.add(email);
  if (lead.outreach_opt_out || lead.do_not_contact === true || lead.outreach_state === 'do_not_contact') return false;
  if (lead.outreach_stage === 'email_sent' || lead.outreach_state === 'email_sent') return false;
  if (lead.last_message_status === 'sent' || lead.last_contact_method === 'Email') return false;
  if (!['S', 'A+', 'A'].includes(String(lead.lead_tier || ''))) return false;
  if (lead.call_connected === true || lead.last_called_at || lead.last_contact_method === 'AI Call' || Number(lead.call_attempts || 0) > 0) return false;
  return true;
}

export function isCallEligible(lead: any, input?: { product?: string; minScore?: number; countries?: string[] }) {
  const product = input?.product || 'leadmap';
  const minScore = Number(input?.minScore || 0);
  const countries = input?.countries?.length ? input.countries : ['SE'];
  const callStatus = String(lead?.call_status || '').toLowerCase();
  const isNoAnswer = callStatus.includes('no answer');
  if (product !== 'all' && lead.product !== product) return false;
  if (minScore > 0 && Number(lead.potential_score || 0) < minScore) return false;
  if (!countries.includes(detectCountry(lead))) return false;
  if (lead.outreach_opt_out || lead.do_not_contact === true || lead.outreach_state === 'do_not_contact') return false;
  if (lead.call_status === 'Calling') return false;
  if ((lead.call_connected === true || lead.last_contacted_at || lead.outreach_state === 'called') && !isNoAnswer) return false;
  if (FINAL_CALL_STATUSES.includes(String(lead.status || ''))) return false;
  if (Number(lead.call_attempts || 0) >= 3 || Number(lead.no_answer_count || 0) >= 3) return false;
  if (lead.next_call_after && String(lead.next_call_after) > new Date().toISOString()) return false;
  return !!normalizePhone(lead.phone_e164 || lead.phone);
}

export function gmailTargetForToday(baseDaily?: number) {
  const normal = Math.max(NORMAL_GMAIL_DAILY_TARGET, Number(baseDaily || 0));
  return new Date().getDay() === 2 ? Math.max(TUESDAY_GMAIL_DAILY_TARGET, normal * 2) : normal;
}
