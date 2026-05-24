import type { Lead } from './supabase';

export type NicheKey =
  | 'plumber' | 'roofer' | 'electrician' | 'hvac' | 'locksmith' | 'water_damage'
  | 'dental' | 'healthcare' | 'cosmetic' | 'law'
  | 'car_repair' | 'towing' | 'car_dealer' | 'car_detailer'
  | 'cleaning' | 'moving'
  | 'real_estate' | 'construction'
  | 'low_value' | 'unknown';

export type LeadTier = 'S' | 'A+' | 'A' | 'B' | 'C' | 'D';

const HIGH_VALUE_NICHES: NicheKey[] = [
  'plumber','roofer','electrician','hvac','locksmith','water_damage',
  'dental','healthcare','cosmetic','law',
  'car_repair','towing','car_dealer','car_detailer',
  'cleaning','moving','real_estate','construction',
];

// Niches where phone is the dominant booking channel and a missed call = lost job
const PHONE_FIRST_NICHES: NicheKey[] = [
  'plumber','roofer','electrician','hvac','locksmith','water_damage',
  'car_repair','towing','cleaning','moving','dental','healthcare','law',
];

interface NicheProfile {
  label: string;
  keywords: string[];
  highValue: boolean;
  urgent: boolean;
  defaultEmergency: boolean;
  phoneFirst: boolean;
  lowValue?: boolean;
  estValue: 'High' | 'Medium' | 'Low';
}

export const NICHE_PROFILES: Record<NicheKey, NicheProfile> = {
  plumber:      { label: 'Plumber',           keywords: ['rörmokare','vvs','rör jour','plumber','plumbing','rörjour'], highValue: true, urgent: true, defaultEmergency: true, phoneFirst: true, estValue: 'High' },
  roofer:       { label: 'Roofer',            keywords: ['takläggare','takfirma','roof','roofer','roofing'], highValue: true, urgent: true, defaultEmergency: false, phoneFirst: true, estValue: 'High' },
  electrician:  { label: 'Electrician',       keywords: ['elektriker','el-firma','elinstallation','electrician','electric'], highValue: true, urgent: true, defaultEmergency: true, phoneFirst: true, estValue: 'High' },
  hvac:         { label: 'HVAC',              keywords: ['värmepump','ventilation','luftkonditionering','klimat','hvac','ac repair','heating','cooling'], highValue: true, urgent: true, defaultEmergency: true, phoneFirst: true, estValue: 'High' },
  locksmith:    { label: 'Locksmith',         keywords: ['låssmed','lås','locksmith'], highValue: true, urgent: true, defaultEmergency: true, phoneFirst: true, estValue: 'Medium' },
  water_damage: { label: 'Water damage',      keywords: ['vattenskada','fuktskada','water damage','sanering','restoration'], highValue: true, urgent: true, defaultEmergency: true, phoneFirst: true, estValue: 'High' },
  dental:       { label: 'Dental clinic',     keywords: ['tandläkare','tandvård','tandimplantat','dental','dentist','dental implant'], highValue: true, urgent: true, defaultEmergency: true, phoneFirst: true, estValue: 'High' },
  healthcare:   { label: 'Private clinic',    keywords: ['privatläkare','klinik','vårdcentral','specialist','läkarmottagning','private clinic','private doctor','medical clinic'], highValue: true, urgent: true, defaultEmergency: false, phoneFirst: true, estValue: 'High' },
  cosmetic:     { label: 'Cosmetic clinic',   keywords: ['skönhetsklinik','estetisk','botox','filler','fillers','laserbehandling','hudklinik','aesthetic','cosmetic clinic'], highValue: true, urgent: false, defaultEmergency: false, phoneFirst: false, estValue: 'High' },
  law:          { label: 'Law firm',          keywords: ['advokat','advokatbyrå','jurist','familjerätt','migrationsadvokat','brottmål','affärsjuridik','law firm','attorney','lawyer'], highValue: true, urgent: false, defaultEmergency: false, phoneFirst: true, estValue: 'High' },
  car_repair:   { label: 'Auto repair',       keywords: ['bilverkstad','mekaniker','bilreparation','auto repair','mechanic','car repair','autoshop'], highValue: true, urgent: true, defaultEmergency: false, phoneFirst: true, estValue: 'High' },
  towing:       { label: 'Towing',            keywords: ['bärgning','bärgare','towing','tow truck'], highValue: true, urgent: true, defaultEmergency: true, phoneFirst: true, estValue: 'Medium' },
  car_dealer:   { label: 'Car dealership',    keywords: ['bilhandlare','bilhall','bilfirma','car dealer','auto dealer'], highValue: true, urgent: false, defaultEmergency: false, phoneFirst: false, estValue: 'High' },
  car_detailer: { label: 'Car detailing',     keywords: ['bilrekond','lackskydd','keramisk coating','detailing','bilvård'], highValue: true, urgent: false, defaultEmergency: false, phoneFirst: false, estValue: 'Medium' },
  cleaning:     { label: 'Cleaning company',  keywords: ['städfirma','städ','flyttstäd','cleaning','cleaning company','cleaners'], highValue: true, urgent: false, defaultEmergency: false, phoneFirst: true, estValue: 'Medium' },
  moving:       { label: 'Moving company',    keywords: ['flyttfirma','flytt','moving company','movers','removal'], highValue: true, urgent: false, defaultEmergency: false, phoneFirst: true, estValue: 'High' },
  real_estate:  { label: 'Real estate',       keywords: ['fastighetsmäklare','mäklare','real estate','realtor'], highValue: true, urgent: false, defaultEmergency: false, phoneFirst: false, estValue: 'High' },
  construction: { label: 'Construction',      keywords: ['byggföretag','byggfirma','renovering','construction','contractor'], highValue: true, urgent: false, defaultEmergency: false, phoneFirst: true, estValue: 'High' },
  low_value:    { label: 'Low-value niche',   keywords: ['barber','barbershop','frisör','nail salon','nagelsalong','café','cafe','restaurant','restaurang','kiosk','pizzeria','bar ','pub'], highValue: false, urgent: false, defaultEmergency: false, phoneFirst: false, lowValue: true, estValue: 'Low' },
  unknown:      { label: 'Unknown',           keywords: [], highValue: false, urgent: false, defaultEmergency: false, phoneFirst: false, estValue: 'Medium' },
};

export function detectNiche(lead: Pick<Lead, 'name' | 'category' | 'niche_label'>): NicheKey {
  const hay = `${lead.name ?? ''} ${lead.category ?? ''} ${lead.niche_label ?? ''}`.toLowerCase();
  if (!hay.trim()) return 'unknown';
  const order: NicheKey[] = ['water_damage','plumber','roofer','electrician','hvac','locksmith','dental','healthcare','cosmetic','law','towing','car_repair','car_dealer','car_detailer','cleaning','moving','real_estate','construction','low_value'];
  for (const k of order) {
    if (NICHE_PROFILES[k].keywords.some(kw => hay.includes(kw))) return k;
  }
  return 'unknown';
}

export type WebsiteQuality = 'none' | 'weak' | 'decent' | 'strong';

export function assessWebsiteQuality(lead: Pick<Lead, 'website'>): WebsiteQuality {
  const w = (lead.website || '').toLowerCase().trim();
  if (!w) return 'none';
  if (/facebook\.com|instagram\.com|wix\.com|sites\.google|wordpress\.com|blogspot|simplesite|hemsida24|linktr\.ee/.test(w)) return 'weak';
  if (w.startsWith('https://')) return 'decent';
  if (w.startsWith('http://')) return 'weak';
  return 'decent';
}

export interface ScoreResult {
  score: number;
  tier: LeadTier;
  niche: NicheKey;
  nicheLabel: string;
  estimatedValue: 'High' | 'Medium' | 'Low';
  websiteQuality: WebsiteQuality;
  hasEmergency: boolean;
  reasons: { label: string; delta: number }[];
  badges: string[];
}

export function calculateScore(lead: Lead): ScoreResult {
  const niche = detectNiche(lead);
  const profile = NICHE_PROFILES[niche];
  const websiteQuality = assessWebsiteQuality(lead);
  const hasPhone = !!(lead.phone && lead.phone.trim());
  const hasEmail = !!(lead.email && lead.email.trim());
  const reviews = lead.reviews_count ?? 0;
  const rating = lead.rating ?? 0;
  const hasEmergency = lead.has_emergency ?? profile.defaultEmergency;
  const hasBooking = lead.has_booking;
  const hasReceptionist = lead.has_receptionist;
  const phoneFirst = profile.phoneFirst || PHONE_FIRST_NICHES.includes(niche);

  let score = 25;
  const reasons: { label: string; delta: number }[] = [];
  const add = (label: string, delta: number) => { score += delta; reasons.push({ label, delta }); };

  // 1. Niche value
  if (profile.highValue && profile.estValue === 'High') add('High-value niche', +22);
  else if (profile.highValue) add('Mid-value niche', +14);
  if (profile.lowValue) add('Low-value niche', -25);
  if (niche === 'unknown') add('Unknown niche', -10);

  // 2-3. Reviews + rating (volume = call volume signal)
  if (reviews >= 200) add('200+ reviews (high call volume)', +14);
  else if (reviews >= 100) add('100+ reviews', +10);
  else if (reviews >= 50) add('50+ reviews', +6);
  else if (reviews >= 15) add('15+ reviews', +3);
  else if (reviews < 5) add('Very few reviews', -8);

  if (rating >= 4.5) add('Rating ≥ 4.5', +8);
  else if (rating >= 4.0) add('Rating ≥ 4.0', +4);
  else if (rating > 0 && rating < 3.5) add('Bad rating (<3.5)', -15);

  // 4-7. Contact info
  if (hasPhone) add('Phone visible', +8); else add('No phone number', -25);
  if (hasEmail) add('Email available', +4);
  if (websiteQuality === 'none') add('No website', +6);
  else if (websiteQuality === 'weak') add('Weak website', +8);

  // 8. After-hours / emergency
  if (hasEmergency) add('Emergency / after-hours service', +10);

  // 9. Booking / receptionist gap (missed-call problem signals)
  if (hasBooking === false) add('No online booking', +10);
  if (hasReceptionist === false) add('No receptionist', +12);
  if (hasBooking === true) add('Has online booking', -8);
  if (hasReceptionist === true) add('Has receptionist / call center', -18);

  // 10. Phone-first niche = missed call = lost revenue
  if (phoneFirst && hasPhone && reviews >= 30) add('Phone-first service with traction', +10);

  // Negative: big chain
  if (/\b(group|gruppen|chain|kedja|elgiganten|ikea|volvo|mercedes|bmw|circle k|7[- ]?eleven|mcdonalds|max)\b/i.test(lead.name || '')) {
    add('Likely large chain', -20);
  }

  score = Math.max(0, Math.min(100, score));

  // Tier assignment
  const isHV = HIGH_VALUE_NICHES.includes(niche);
  const strongSignals =
    (reviews >= 50 ? 1 : 0) +
    (rating >= 4.3 ? 1 : 0) +
    (hasPhone ? 1 : 0) +
    (phoneFirst ? 1 : 0) +
    ((hasBooking === false || hasReceptionist === false || websiteQuality === 'weak' || websiteQuality === 'none') ? 1 : 0);

  let tier: LeadTier;
  if (isHV && profile.estValue === 'High' && hasPhone && reviews >= 80 && rating >= 4.3 && phoneFirst && score >= 85) {
    tier = 'S';
  } else if (isHV && hasPhone && strongSignals >= 4 && score >= 75) {
    tier = 'A+';
  } else if (isHV && hasPhone && score >= 60) {
    tier = 'A';
  } else if (score >= 45) {
    tier = 'B';
  } else if (score >= 28) {
    tier = 'C';
  } else {
    tier = 'D';
  }

  const badges: string[] = [];
  if (tier === 'S') badges.push('S Tier');
  if (tier === 'A+') badges.push('A+ Hot Lead');
  if (profile.estValue === 'High' && profile.highValue) badges.push('High Ticket');
  if (hasEmergency) badges.push('Urgent Calls');
  if (hasBooking === false) badges.push('No Booking');
  if (websiteQuality === 'weak' || websiteQuality === 'none') badges.push('Weak Website');
  badges.push(hasEmail ? 'Email Found' : 'No Email Found');
  if (phoneFirst && hasPhone) badges.push('Call First');

  return {
    score, tier, niche, nicheLabel: profile.label,
    estimatedValue: profile.estValue,
    websiteQuality, hasEmergency,
    reasons, badges,
  };
}

/** One short English sentence explaining the score, matching the requested format. */
export function generateWhyGoodLead(lead: Lead, result: ScoreResult): string {
  const profile = NICHE_PROFILES[result.niche];
  const reviews = lead.reviews_count ?? 0;
  const rating = lead.rating ?? 0;
  const bits: string[] = [];

  if (reviews > 0) bits.push(`${reviews} reviews`);
  if (rating > 0) bits.push(`${rating.toFixed(1)} stars`);
  if (profile.phoneFirst) bits.push('phone-first service');
  if (result.hasEmergency) bits.push('after-hours demand');
  if (lead.has_booking === false) bits.push('weak booking system');
  if (result.websiteQuality === 'weak' || result.websiteQuality === 'none') bits.push('poor website');
  if (lead.has_receptionist === false) bits.push('no receptionist');
  if (!lead.phone) bits.push('no public phone');
  if (profile.lowValue) bits.push('low-value niche');

  const tierWord =
    result.tier === 'S' ? 'S-tier' :
    result.tier === 'A+' ? 'A+ tier' :
    result.tier === 'A' ? 'A-tier' :
    result.tier === 'B' ? 'B-tier' :
    result.tier === 'C' ? 'C-tier' : 'D-tier';

  const subject = profile.label.toLowerCase();
  const reason = bits.length ? bits.slice(0, 4).join(', ') : 'limited signals available';
  return `${tierWord} because it is a ${subject} with ${reason}.`;
}

export function generateOutreachMessage(lead: Lead, niche: NicheKey = detectNiche(lead)): string {
  const profile = NICHE_PROFILES[niche];
  const isEmergency = profile.defaultEmergency || profile.urgent;
  const name = lead.name || 'där';
  const intro = `Hej${lead.name ? ` ${name}` : ''}! Snabb fråga — `;
  if (isEmergency) {
    return `${intro}missar ni ibland samtal när ni är ute på jobb? Jag har byggt en AI-telefonassistent som svarar direkt, tar kundens namn, nummer och ärende, och skickar leadet till er på sekunden. För jourjobb kan ett missat samtal bli en förlorad kund direkt. Vill du se en kort demo?`;
  }
  if (niche === 'cosmetic' || niche === 'dental' || niche === 'healthcare') {
    return `${intro}missar ni ibland samtal när ni är upptagna med kunder/patienter? Jag har byggt en AI-telefonassistent som svarar, tar namn, nummer och vad personen söker hjälp med, sen skickas leadet direkt till er. För en klinik kan ett missat samtal vara värt flera tusen kronor. Vill du testa en kort demo?`;
  }
  if (niche === 'law') {
    return `${intro}missar ni ibland samtal från nya klienter? Jag har byggt en AI-telefonassistent som svarar professionellt, tar ärendetyp och kontaktuppgifter, och skickar leadet direkt till er. För en advokatbyrå kan ett missat samtal vara värt tiotusentals kronor. Vill du se en demo?`;
  }
  if (niche === 'real_estate') {
    return `${intro}missar ni ibland samtal från spekulanter? Jag har byggt en AI-telefonassistent som svarar, kvalificerar och skickar leadet till er direkt. För en mäklare kan ett missat samtal bli en förlorad affär. Vill du se en demo?`;
  }
  if (niche === 'car_dealer' || niche === 'car_detailer' || niche === 'car_repair' || niche === 'towing') {
    return `${intro}missar ni ibland samtal från kunder? Jag har byggt en AI-telefonassistent som svarar, tar namn, nummer och vad kunden är intresserad av, sen skickas leadet direkt till er. Vill du se en kort demo?`;
  }
  return `${intro}missar ni ibland samtal när ni är upptagna? Jag har byggt en AI-telefonassistent som svarar, tar namn, nummer och ärende, och skickar leadet direkt till er. Vill du se en kort demo?`;
}

export async function scoreAndPersist(lead: Lead, supabase: any): Promise<ScoreResult> {
  const result = calculateScore(lead);
  const why = generateWhyGoodLead(lead, result);
  await supabase.from('leads').update({
    potential_score: result.score,
    lead_tier: result.tier,
    detected_niche: result.niche,
    estimated_value: result.estimatedValue,
    website_quality: result.websiteQuality,
    why_good_lead: why,
  }).eq('id', lead.id);
  return result;
}
