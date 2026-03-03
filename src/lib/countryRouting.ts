/**
 * Country-based lead routing logic.
 * 
 * Sweden: Both SMS (mobile) and Call (landline) routing
 * Norway & Denmark: SMS/messaging only — no call list routing
 */

import { findCity, Country, getCitiesByCountry } from '@/lib/cities';

const SWEDISH_MOBILE_REGEX = /^(070|072|073|076|079|\+46(70|72|73|76|79)|46(70|72|73|76|79))/;

/**
 * Detect the country of a lead based on its address, city, or phone prefix.
 */
export function detectLeadCountry(address?: string | null, phone?: string | null): Country {
  const addr = (address || '').toLowerCase();
  
  // Check address for country indicators
  if (addr.includes('norge') || addr.includes('norway') || addr.includes(', no')) return 'NO';
  if (addr.includes('danmark') || addr.includes('denmark') || addr.includes(', dk')) return 'DK';
  
  // Check phone prefix for Norwegian numbers
  if (phone) {
    const cleanPhone = phone.replace(/\s|-/g, '');
    if (cleanPhone.startsWith('+47') || cleanPhone.startsWith('47') && cleanPhone.length >= 10) return 'NO';
    if (cleanPhone.startsWith('+45') || cleanPhone.startsWith('45') && cleanPhone.length >= 10) return 'DK';
  }
  
  // Try matching city names
  for (const c of getCitiesByCountry('NO')) {
    if (addr.includes(c.name.toLowerCase())) return 'NO';
  }
  for (const c of getCitiesByCountry('DK')) {
    if (addr.includes(c.name.toLowerCase())) return 'DK';
  }
  
  return 'SE'; // Default
}

/**
 * Determine if a lead should go to the call list based on country routing rules.
 * 
 * Sweden: Landlines → call list, mobiles → SMS
 * Norway/Denmark: All leads go to SMS (messaging only), never call list
 */
export function shouldNeedCall(phone: string | null, country: Country): boolean {
  if (!phone) return false;
  
  // Norway & Denmark: never route to call list
  if (country === 'NO' || country === 'DK') return false;
  
  // Sweden: only landlines go to call list
  const cleanPhone = phone.replace(/\s|-/g, '');
  return !SWEDISH_MOBILE_REGEX.test(cleanPhone);
}
