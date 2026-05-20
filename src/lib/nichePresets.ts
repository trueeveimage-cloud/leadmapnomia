import type { NicheKey } from './leadScoring';

export interface NichePreset {
  key: string;
  label: string;
  description: string;
  niche: NicheKey;
  keywords: string[];
  defaultCity: string;
}

export const NICHE_PRESETS: NichePreset[] = [
  {
    key: 'cosmetic_clinics',
    label: 'Cosmetic Clinics',
    description: 'Skönhetskliniker, hudkliniker, botox/fillers — höga ordervärden, många samtal.',
    niche: 'cosmetic',
    keywords: ['skönhetsklinik','estetisk klinik','fillers','botox','laserbehandling','hudklinik'],
    defaultCity: 'Göteborg',
  },
  {
    key: 'dental_high_ticket',
    label: 'Dental High Ticket',
    description: 'Privata tandläkare, tandimplantat, estetisk tandvård, akut tandvård.',
    niche: 'dental',
    keywords: ['tandimplantat','privat tandläkare','estetisk tandvård','akut tandläkare'],
    defaultCity: 'Göteborg',
  },
  {
    key: 'lawyers',
    label: 'Lawyers',
    description: 'Advokatbyråer — varje missat samtal kan vara värt tiotusentals kronor.',
    niche: 'law',
    keywords: ['advokatbyrå','familjerätt','migrationsadvokat','brottmålsadvokat','affärsjuridik'],
    defaultCity: 'Göteborg',
  },
  {
    key: 'emergency_trades',
    label: 'Emergency Trades',
    description: 'Jour-rörmokare, jour-elektriker, låssmed, vattenskada, takläggare.',
    niche: 'plumber',
    keywords: ['rörmokare jour','elektriker jour','låssmed jour','vattenskada','takläggare'],
    defaultCity: 'Göteborg',
  },
  {
    key: 'real_estate',
    label: 'Real Estate / Property',
    description: 'Mäklare, fastighetsförvaltning, byggföretag, renoveringsfirmor.',
    niche: 'real_estate',
    keywords: ['fastighetsmäklare','fastighetsförvaltning','byggföretag','renoveringsfirma'],
    defaultCity: 'Göteborg',
  },
  {
    key: 'car_high_ticket',
    label: 'Car High Ticket',
    description: 'Bilhandlare, exklusiva bilar, lackskydd, keramisk coating.',
    niche: 'car_dealer',
    keywords: ['bilhandlare','exklusiva bilar','bilrekond','lackskydd','keramisk coating'],
    defaultCity: 'Göteborg',
  },
];
