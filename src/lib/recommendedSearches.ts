/**
 * Recommended search suggestions based on coverage gaps, city performance,
 * and campaign reply rates per niche/area.
 */

import { getCitiesByCountry, CityProfile, Country, COUNTRY_DEFAULT_KEYWORDS } from '@/lib/cities';
import { FinderRun } from '@/lib/finder';

export interface SearchRecommendation {
  country: Country;
  cities: CityProfile[];
  reason: string;
  priority: 'high' | 'medium' | 'low';
  /** Optional: suggested niches based on reply data */
  suggestedNiches?: string[];
  /** Estimated leads per city based on historical avg */
  estimatedLeadsPerCity?: number;
  /** Action label for the button */
  actionLabel?: string;
}

export interface CampaignPerformance {
  /** category/niche → reply count */
  nicheReplies: Record<string, number>;
  /** category/niche → sent count */
  nicheSent: Record<string, number>;
  /** city name → reply count */
  cityReplies: Record<string, number>;
  /** city name → sent count */
  citySent: Record<string, number>;
}

/**
 * Build campaign performance data from leads + message_logs.
 */
export function buildCampaignPerformance(
  leads: Array<{ id: string; category?: string | null; address?: string | null; has_replied?: boolean }>,
  messageLogs: Array<{ lead_id: string; direction: string; status: string }>
): CampaignPerformance {
  const perf: CampaignPerformance = { nicheReplies: {}, nicheSent: {}, cityReplies: {}, citySent: {} };

  const leadMap = new Map(leads.map(l => [l.id, l]));

  for (const msg of messageLogs) {
    if (msg.direction !== 'outbound') continue;
    const lead = leadMap.get(msg.lead_id);
    if (!lead) continue;

    const niche = (lead.category || 'unknown').toLowerCase();
    perf.nicheSent[niche] = (perf.nicheSent[niche] || 0) + 1;

    const addr = lead.address || '';
    const parts = addr.split(',').map(p => p.trim());
    const city = parts.length >= 2 ? parts[parts.length - 2] : '';
    if (city) {
      perf.citySent[city] = (perf.citySent[city] || 0) + 1;
    }
  }

  for (const lead of leads) {
    if (!lead.has_replied) continue;
    const niche = (lead.category || 'unknown').toLowerCase();
    perf.nicheReplies[niche] = (perf.nicheReplies[niche] || 0) + 1;

    const addr = lead.address || '';
    const parts = addr.split(',').map(p => p.trim());
    const city = parts.length >= 2 ? parts[parts.length - 2] : '';
    if (city) {
      perf.cityReplies[city] = (perf.cityReplies[city] || 0) + 1;
    }
  }

  return perf;
}

/**
 * Get top-performing niches by reply rate (min 3 sent).
 */
export function getTopNiches(perf: CampaignPerformance, minSent = 3): string[] {
  return Object.entries(perf.nicheSent)
    .filter(([, sent]) => sent >= minSent)
    .map(([niche, sent]) => ({ niche, rate: (perf.nicheReplies[niche] || 0) / sent }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5)
    .map(n => n.niche);
}

/**
 * Calculate average leads per run from historical data.
 */
function avgLeadsPerRun(
  cityStats: Record<string, { runs: number; leads: number; candidates: number }>,
  cities: CityProfile[]
): number {
  let totalLeads = 0;
  let totalRuns = 0;
  for (const city of cities) {
    const cs = cityStats[city.name];
    if (cs) {
      totalLeads += cs.leads;
      totalRuns += cs.runs;
    }
  }
  if (totalRuns === 0) return 0;
  return Math.round(totalLeads / totalRuns);
}

/**
 * Generate recommended searches — max 3, focused and actionable.
 */
export function getRecommendedSearches(
  runs: FinderRun[],
  cityStats: Record<string, { runs: number; leads: number; candidates: number }>,
  campaignPerf?: CampaignPerformance
): SearchRecommendation[] {
  const recommendations: SearchRecommendation[] = [];
  const topNiches = campaignPerf ? getTopNiches(campaignPerf) : [];

  for (const country of ['SE', 'NO', 'DK'] as Country[]) {
    const cities = getCitiesByCountry(country);
    const avgLpc = avgLeadsPerRun(cityStats, cities);

    // 1. HIGH PRIORITY: Large unsearched cities (METRO/CITY only, top 5)
    const unsearchedLarge = cities
      .filter(c => !cityStats[c.name] && (c.type === 'METRO' || c.type === 'CITY'))
      .sort((a, b) => b.population - a.population);

    if (unsearchedLarge.length > 0) {
      const pick = unsearchedLarge.slice(0, 5);
      recommendations.push({
        country,
        cities: pick,
        reason: `${pick.length} untapped ${pick.length === 1 ? 'city' : 'cities'} with ${pick.reduce((s, c) => s + c.population, 0).toLocaleString()}+ people`,
        priority: 'high',
        suggestedNiches: topNiches.length > 0 ? topNiches : undefined,
        estimatedLeadsPerCity: avgLpc || undefined,
        actionLabel: `Search ${pick.length} ${pick.length === 1 ? 'city' : 'cities'}`,
      });
    }

    // 2. HIGH PRIORITY: Cities with high SMS reply rates — double down
    if (campaignPerf) {
      const highReplyCities = cities
        .filter(c => {
          const sent = campaignPerf.citySent[c.name] || 0;
          const replies = campaignPerf.cityReplies[c.name] || 0;
          return sent >= 3 && (replies / sent) > 0.05;
        })
        .sort((a, b) => {
          const aRate = (campaignPerf.cityReplies[a.name] || 0) / (campaignPerf.citySent[a.name] || 1);
          const bRate = (campaignPerf.cityReplies[b.name] || 0) / (campaignPerf.citySent[b.name] || 1);
          return bRate - aRate;
        })
        .slice(0, 4);

      if (highReplyCities.length > 0) {
        const topCity = highReplyCities[0];
        const topRate = Math.round(((campaignPerf.cityReplies[topCity.name] || 0) / (campaignPerf.citySent[topCity.name] || 1)) * 100);
        recommendations.push({
          country,
          cities: highReplyCities,
          reason: `${topRate}% reply rate in ${topCity.name} — find more leads in hot areas`,
          priority: 'high',
          suggestedNiches: topNiches.length > 0 ? topNiches : undefined,
          estimatedLeadsPerCity: avgLpc || undefined,
          actionLabel: 'Double down',
        });
      }
    }

    // 3. MEDIUM: High success rate cities that haven't been fully explored
    const highPerformers = cities
      .filter(c => {
        const cs = cityStats[c.name];
        if (!cs || cs.runs < 1) return false;
        const rate = cs.candidates > 0 ? cs.leads / cs.candidates : 0;
        return rate > 0.15 && cs.runs < 3;
      })
      .sort((a, b) => {
        const aRate = cityStats[a.name].candidates > 0 ? cityStats[a.name].leads / cityStats[a.name].candidates : 0;
        const bRate = cityStats[b.name].candidates > 0 ? cityStats[b.name].leads / cityStats[b.name].candidates : 0;
        return bRate - aRate;
      })
      .slice(0, 4);

    if (highPerformers.length > 0) {
      const topCity = highPerformers[0];
      const topRate = Math.round((cityStats[topCity.name].leads / (cityStats[topCity.name].candidates || 1)) * 100);
      recommendations.push({
        country,
        cities: highPerformers,
        reason: `${topRate}% hit rate in ${topCity.name} — room for more runs`,
        priority: 'medium',
        suggestedNiches: topNiches.length > 0 ? topNiches : undefined,
        estimatedLeadsPerCity: Math.round(cityStats[topCity.name].leads / cityStats[topCity.name].runs),
        actionLabel: 'Re-search',
      });
    }
  }

  return recommendations
    .sort((a, b) => {
      const prio = { high: 0, medium: 1, low: 2 };
      return prio[a.priority] - prio[b.priority];
    })
    .slice(0, 6); // max 2 per country
}
