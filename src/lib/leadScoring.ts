import type { Lead } from './supabase';

export type NicheKey =
  | 'cosmetic' | 'dental' | 'healthcare' | 'law'
  | 'plumber' | 'electrician' | 'locksmith' | 'roofer' | 'water_damage'
  | 'real_estate' | 'construction'
  | 'car_dealer' | 'car_detailer'
  | 'low_value' | 'unknown';

export type LeadTier = 'A+' | 'A' | 'B' | 'C';

interface NicheProfile {
  label: string;
  keywords: string[];
  highValue: boolean;
  urgent: boolean;
  defaultEmergency: boolean;
  lowValue?: boolean;
  estValue: 'High' | 'Medium' | 'Low';
}

export const NICHE_PROFILES: Record<NicheKey, NicheProfile> = {
  cosmetic:     { label: 'Cosmetic clinic', keywords: ['skönhetsklinik','estetisk','botox','filler','fillers','laserbehandling','hudklinik','hudvård','aesthetic','cosmetic clinic'], highValue: true,  urgent: false, defaultEmergency: false, estValue: 'High' },
  dental:       { label: 'Dental clinic',   keywords: ['tandläkare','tandvård','tandimplantat','dental','estetisk tandvård','akut tandläkare','dentist','dental implant'], highValue: true, urgent: true, defaultEmergency: true, estValue: 'High' },
  healthcare:   { label: 'Private healthcare', keywords: ['privatläkare','klinik','vårdcentral','specialist','läkarmottagning','private clinic','private doctor'], highValue: true, urgent: true, defaultEmergency: false, estValue: 'High' },
  law:          { label: 'Law firm',        keywords: ['advokat','advokatbyrå','jurist','familjerätt','migrationsadvokat','brottmål','affärsjuridik','law firm','attorney'], highValue: true, urgent: false, defaultEmergency: false, estValue: 'High' },
  plumber:      { label: 'Plumber',         keywords: ['rörmokare','vvs','rör jour','plumber','plumbing'], highValue: true, urgent: true, defaultEmergency: true, estValue: 'High' },
  electrician:  { label: 'Electrician',     keywords: ['elektriker','el-firma','elinstallation','electrician'], highValue: true, urgent: true, defaultEmergency: true, estValue: 'Medium' },
  locksmith:    { label: 'Locksmith',       keywords: ['låssmed','lås','locksmith'], highValue: true, urgent: true, defaultEmergency: true, estValue: 'Medium' },
  roofer:       { label: 'Roofer',          keywords: ['takläggare','tak','roof','roofer'], highValue: true, urgent: true, defaultEmergency: false, estValue: 'High' },
  water_damage: { label: 'Water damage',    keywords: ['vattenskada','fuktskada','water damage','sanering'], highValue: true, urgent: true, defaultEmergency: true, estValue: 'High' },
  real_estate:  { label: 'Real estate',     keywords: ['fastighetsmäklare','mäklare','fastighetsförvaltning','real estate','realtor'], highValue: true, urgent: false, defaultEmergency: false, estValue: 'High' },
  construction: { label: 'Construction',    keywords: ['byggföretag','byggfirma','renoveringsfirma','renovering','construction','contractor'], highValue: true, urgent: false, defaultEmergency: false, estValue: 'High' },
  car_dealer:   { label: 'Car dealership',  keywords: ['bilhandlare','bilhall','bilfirma','exklusiva bilar','car dealer','auto dealer'], highValue: true, urgent: false, defaultEmergency: false, estValue: 'High' },
  car_detailer: { label: 'Car detailing',   keywords: ['bilrekond','lackskydd','keramisk coating','detailing','bilvård'], highValue: true, urgent: false, defaultEmergency: false, estValue: 'Medium' },
  low_value:    { label: 'Low-value niche', keywords: ['barber','barbershop','frisör','nail salon','nagelsalong','café','cafe','restaurant','restaurang','kiosk','pizzeria'], highValue: false, urgent: false, defaultEmergency: false, lowValue: true, estValue: 'Low' },
  unknown:      { label: 'Unknown',         keywords: [], highValue: false, urgent: false, defaultEmergency: false, estValue: 'Medium' },
};

export function detectNiche(lead: Pick<Lead, 'name' | 'category' | 'niche_label'>): NicheKey {
  const hay = `${lead.name ?? ''} ${lead.category ?? ''} ${lead.niche_label ?? ''}`.toLowerCase();
  if (!hay.trim()) return 'unknown';
  // Check high-value niches before low_value (overlap-safe)
  const order: NicheKey[] = ['cosmetic','dental','healthcare','law','water_damage','plumber','electrician','locksmith','roofer','real_estate','construction','car_dealer','car_detailer','low_value'];
  for (const k of order) {
    const profile = NICHE_PROFILES[k];
    if (profile.keywords.some(kw => hay.includes(kw))) return k;
  }
  return 'unknown';
}

export type WebsiteQuality = 'none' | 'weak' | 'decent' | 'strong';

export function assessWebsiteQuality(lead: Pick<Lead, 'website'>): WebsiteQuality {
  const w = (lead.website || '').toLowerCase().trim();
  if (!w) return 'none';
  // Social-only or generic builders = weak
  if (/facebook\.com|instagram\.com|wix\.com|sites\.google|wordpress\.com|blogspot|simplesite|hemsida24/.test(w)) return 'weak';
  // Has https + own TLD = decent (we don't actually fetch)
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
  const hasBooking = lead.has_booking; // tri-state
  const hasReceptionist = lead.has_receptionist; // tri-state

  let score = 30; // base
  const reasons: { label: string; delta: number }[] = [{ label: 'Base score', delta: 30 }];

  const add = (label: string, delta: number) => { score += delta; reasons.push({ label, delta }); };

  if (profile.highValue)   add('High-value service', +20);
  if (profile.urgent)      add('Urgent service', +15);
  if (hasPhone)            add('Phone visible', +10);
  if (reviews >= 100)      add('100+ Google reviews', +10);
  else if (reviews >= 30)  add('30+ Google reviews', +5);
  if (rating >= 4.3)       add('Rating ≥ 4.3', +8);
  if (websiteQuality === 'weak' || websiteQuality === 'none') add('Weak / missing website', +10);
  if (hasBooking === false) add('No online booking', +10);
  if (hasReceptionist === false) add('No receptionist / call center', +10);
  if (hasEmergency)        add('Emergency / after-hours service', +12);
  if (profile.estValue === 'High') add('Expensive services', +10);
  if (hasEmail && !hasBooking) add('Email available, no booking flow', +8);

  // Negatives
  if (hasBooking === true) add('Has full online booking', -10);
  if (hasReceptionist === true) add('Has 24/7 receptionist', -15);
  if (profile.lowValue)    add('Low-value niche', -20);
  if (!hasPhone)           add('No phone number found', -20);
  if (rating > 0 && rating < 3.8) add('Bad reviews (<3.8)', -10);
  // Big chain heuristic
  if (/\b(ab\b.*koncern|gruppen|group|chain|kedja|elgiganten|ikea|volvo|mercedes|bmw)\b/i.test(lead.name)) {
    add('Likely large chain', -15);
  }

  score = Math.max(0, Math.min(100, score));

  const tier: LeadTier =
    score >= 85 ? 'A+' :
    score >= 70 ? 'A'  :
    score >= 50 ? 'B'  : 'C';

  const badges: string[] = [];
  if (tier === 'A+') badges.push('A+ Hot Lead');
  if (profile.estValue === 'High' && profile.highValue) badges.push('High Ticket');
  if (hasEmergency) badges.push('Urgent Call');
  if (hasBooking === false) badges.push('No Booking');
  if (websiteQuality === 'weak' || websiteQuality === 'none') badges.push('Weak Website');
  if (hasEmail) badges.push('Email Found');
  if (tier === 'A+' || tier === 'A') badges.push('Call First');

  return {
    score, tier, niche, nicheLabel: profile.label,
    estimatedValue: profile.estValue,
    websiteQuality, hasEmergency,
    reasons, badges,
  };
}

export function generateWhyGoodLead(lead: Lead, result: ScoreResult): string {
  const bits: string[] = [];
  const profile = NICHE_PROFILES[result.niche];
  if (profile.highValue) bits.push(`${profile.label.toLowerCase()} med dyra tjänster`);
  if ((lead.reviews_count ?? 0) >= 50) bits.push(`${lead.reviews_count} recensioner visar hög samtalsvolym`);
  if (result.websiteQuality === 'weak' || result.websiteQuality === 'none') bits.push('svag eller saknad hemsida');
  if (lead.has_booking === false) bits.push('inget online-bokningssystem');
  if (result.hasEmergency) bits.push('akut/jour-tjänster');
  if (lead.has_receptionist === false) bits.push('ingen tydlig receptionist');
  if (!bits.length) bits.push('serviceföretag som tar kundsamtal');

  const stake = profile.estValue === 'High'
    ? 'Ett missat samtal kan vara värt flera tusen kronor.'
    : profile.estValue === 'Medium'
      ? 'Missade samtal blir snabbt tappade kunder.'
      : 'Begränsad potential men kan vara värt en demo.';

  return `Den här ${profile.label.toLowerCase()}n är ${result.tier === 'A+' ? 'mycket hög' : result.tier === 'A' ? 'hög' : result.tier === 'B' ? 'okej' : 'låg'} potential — ${bits.join(', ')}. ${stake}`;
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
  if (niche === 'car_dealer' || niche === 'car_detailer') {
    return `${intro}missar ni ibland samtal från kunder? Jag har byggt en AI-telefonassistent som svarar, tar namn, nummer och vad kunden är intresserad av, sen skickas leadet direkt till er. Vill du se en kort demo?`;
  }
  return `${intro}missar ni ibland samtal när ni är upptagna? Jag har byggt en AI-telefonassistent som svarar, tar namn, nummer och ärende, och skickar leadet direkt till er. Vill du se en kort demo?`;
}

/** Compute & persist score for a single lead (call after creating/editing). */
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
