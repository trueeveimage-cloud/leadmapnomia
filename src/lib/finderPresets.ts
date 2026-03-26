import { AreaType, Density, CityProfile } from './cities';

export type PresetKey = 'high_success' | 'balanced' | 'volume' | 'cleanse';

export interface PresetConfig {
  key: PresetKey;
  label: string;
  description: string;
  icon: string;
  radius: number;
  maxPages: number;
  maxDetails: number;
  maxCandidates: number;
  minRating: number;
  minReviews: number;
  maxReviews: number;
  requirePhone: boolean;
}

interface PresetRanges {
  radius: Record<AreaType, [number, number]>;
  maxDetails: Record<AreaType, [number, number]>;
  maxCandidates: Record<AreaType, [number, number]>;
  maxPages: Record<AreaType, number>;
  minRating: number;
  minReviews: Record<AreaType, [number, number]>;
  maxReviews: number;
  requirePhone: boolean;
}

const PRESET_RANGES: Record<PresetKey, PresetRanges> = {
  high_success: {
    radius: { METRO: [5000, 7000], CITY: [3000, 5000], TOWN: [1500, 3000] },
    maxDetails: { METRO: [150, 250], CITY: [100, 180], TOWN: [60, 120] },
    maxCandidates: { METRO: [400, 800], CITY: [250, 500], TOWN: [150, 300] },
    maxPages: { METRO: 2, CITY: 2, TOWN: 2 },
    minRating: 4.0,
    minReviews: { METRO: [10, 20], CITY: [8, 15], TOWN: [5, 10] },
    maxReviews: 50,
    requirePhone: true,
  },
  balanced: {
    radius: { METRO: [8000, 12000], CITY: [5000, 8000], TOWN: [3000, 5000] },
    maxDetails: { METRO: [250, 400], CITY: [150, 300], TOWN: [100, 180] },
    maxCandidates: { METRO: [800, 1200], CITY: [400, 800], TOWN: [250, 500] },
    maxPages: { METRO: 2, CITY: 2, TOWN: 2 },
    minRating: 3.7,
    minReviews: { METRO: [5, 5], CITY: [5, 5], TOWN: [5, 5] },
    maxReviews: 50,
    requirePhone: true,
  },
  volume: {
    radius: { METRO: [15000, 20000], CITY: [8000, 15000], TOWN: [5000, 8000] },
    maxDetails: { METRO: [400, 700], CITY: [250, 500], TOWN: [150, 300] },
    maxCandidates: { METRO: [1200, 2000], CITY: [800, 1500], TOWN: [400, 900] },
    maxPages: { METRO: 3, CITY: 3, TOWN: 2 },
    minRating: 3.5,
    minReviews: { METRO: [0, 3], CITY: [0, 3], TOWN: [0, 3] },
    maxReviews: 50,
    requirePhone: false,
  },
  cleanse: {
    radius: { METRO: [20000, 25000], CITY: [12000, 18000], TOWN: [8000, 12000] },
    maxDetails: { METRO: [300, 500], CITY: [200, 350], TOWN: [150, 250] },
    maxCandidates: { METRO: [1500, 2500], CITY: [1000, 1800], TOWN: [600, 1200] },
    maxPages: { METRO: 2, CITY: 2, TOWN: 2 },
    minRating: 3.5,
    minReviews: { METRO: [0, 0], CITY: [0, 0], TOWN: [0, 0] },
    maxReviews: 100,
    requirePhone: false,
  },
};

/** Pick value within range based on density */
function pickFromRange(range: [number, number], density: Density): number {
  // HIGH → use upper end, LOW → reduce by 30-50%, MED → mid
  switch (density) {
    case 'HIGH': return Math.round(range[1]);
    case 'MED': return Math.round((range[0] + range[1]) / 2);
    case 'LOW': return Math.round(range[0] * 0.7); // reduce 30%
  }
}

function pickReviews(range: [number, number], density: Density): number {
  switch (density) {
    case 'HIGH': return range[1];
    case 'MED': return Math.round((range[0] + range[1]) / 2);
    case 'LOW': return range[0];
  }
}

export function computePreset(key: PresetKey, profile: CityProfile): PresetConfig {
  const ranges = PRESET_RANGES[key];
  const { type, density } = profile;

  const labels: Record<PresetKey, { label: string; description: string; icon: string }> = {
    high_success: { label: 'High Success', description: 'Call-ready leads with phone numbers, high ratings', icon: '🎯' },
    balanced: { label: 'Balanced', description: 'Daily outreach mix — good reach, good quality', icon: '⚖️' },
    volume: { label: 'Volume', description: 'Big list — maximum coverage, broader filters', icon: '📊' },
  };

  return {
    key,
    ...labels[key],
    radius: pickFromRange(ranges.radius[type], density),
    maxPages: ranges.maxPages[type],
    maxDetails: pickFromRange(ranges.maxDetails[type], density),
    maxCandidates: pickFromRange(ranges.maxCandidates[type], density),
    minRating: ranges.minRating,
    minReviews: pickReviews(ranges.minReviews[type], density),
    maxReviews: ranges.maxReviews,
    requirePhone: ranges.requirePhone,
  };
}

export function computeAllPresets(profile: CityProfile): PresetConfig[] {
  return (['high_success', 'balanced', 'volume'] as PresetKey[]).map(k => computePreset(k, profile));
}

/** Adjust detail lookups based on leads target */
export function adjustForLeadsTarget(preset: PresetConfig, target: number): PresetConfig {
  // Rough conversion: ~30-40% of details become "no website + phone" leads
  const conversionRate = preset.key === 'high_success' ? 0.4 : preset.key === 'balanced' ? 0.35 : 0.25;
  const neededDetails = Math.ceil(target / conversionRate);
  const neededCandidates = Math.ceil(neededDetails * 2.5);

  return {
    ...preset,
    maxDetails: Math.min(neededDetails, preset.maxDetails),
    maxCandidates: Math.min(neededCandidates, preset.maxCandidates),
  };
}

export function estimateCostFromPreset(preset: PresetConfig, keywordCount: number): { stage1: number; stage2: number; totalUsd: string } {
  const stage1 = keywordCount * preset.maxPages;
  const stage2 = preset.maxDetails;
  const cost = stage1 * 0.032 + stage2 * 0.017;
  return { stage1, stage2, totalUsd: `$${cost.toFixed(2)}` };
}
