export type SupportedCountry = 'SE' | 'NO' | 'DK';

export function detectCountry(address?: string | null, phone?: string | null): SupportedCountry {
  const addr = (address || '').toLowerCase();
  if (addr.includes('norge') || addr.includes('norway') || addr.includes(', no')) return 'NO';
  if (addr.includes('danmark') || addr.includes('denmark') || addr.includes(', dk')) return 'DK';
  if (addr.includes('sverige') || addr.includes('sweden') || addr.includes(', se')) return 'SE';

  if (phone) {
    const clean = phone.replace(/\s|-/g, '');
    if (clean.startsWith('+47') || (clean.startsWith('47') && clean.length >= 10)) return 'NO';
    if (clean.startsWith('+45') || (clean.startsWith('45') && clean.length >= 10)) return 'DK';
    if (clean.startsWith('+46') || (clean.startsWith('46') && clean.length >= 10)) return 'SE';
  }

  return 'SE';
}

export function isSmsEligible(phone: string, address?: string | null): boolean {
  const cleaned = phone.replace(/\s|-/g, '');
  const country = detectCountry(address, phone);

  if (country === 'NO' || country === 'DK') return true;

  return /^(070|072|073|076|079|\+46(70|72|73|76|79)|46(70|72|73|76|79))/.test(cleaned);
}

export function normalizeToE164(phone: string, address?: string | null): string {
  let e164 = phone.replace(/\s|-/g, '');
  const country = detectCountry(address, phone);

  if (country === 'NO') {
    if (/^\d{8}$/.test(e164)) e164 = `+47${e164}`;
    else if (/^47\d{8}$/.test(e164)) e164 = `+${e164}`;
  } else if (country === 'DK') {
    if (/^\d{8}$/.test(e164)) e164 = `+45${e164}`;
    else if (/^45\d{8}$/.test(e164)) e164 = `+${e164}`;
  } else {
    if (e164.startsWith('07')) e164 = `+46${e164.slice(1)}`;
    else if (e164.startsWith('467')) e164 = `+${e164}`;
  }

  if (!e164.startsWith('+')) e164 = `+${e164}`;
  return e164;
}