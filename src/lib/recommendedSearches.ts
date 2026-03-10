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
 * Call this from the component and pass it in.
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

    // Extract city from address (last part before country)
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
 * Generate recommended searches for each country based on coverage gaps
 * and optionally campaign reply performance.
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
    
    // Find unsearched cities sorted by population (high first)
    const unsearched = cities
      .filter(c => !cityStats[c.name])
      .sort((a, b) => b.population - a.population);
    
    // Find cities with high success rate that could yield more
    const highPerformers = cities
      .filter(c => {
        const cs = cityStats[c.name];
        if (!cs || cs.runs < 1) return false;
        const rate = cs.candidates > 0 ? cs.leads / cs.candidates : 0;
        return rate > 0.15 && cs.runs < 3; // High success but few runs
      })
      .sort((a, b) => {
        const aRate = cityStats[a.name].candidates > 0 ? cityStats[a.name].leads / cityStats[a.name].candidates : 0;
        const bRate = cityStats[b.name].candidates > 0 ? cityStats[b.name].leads / cityStats[b.name].candidates : 0;
        return bRate - aRate;
      });

    // Find cities with high SMS reply rates
    const highReplyCities = campaignPerf ? cities
      .filter(c => {
        const sent = campaignPerf.citySent[c.name] || 0;
        const replies = campaignPerf.cityReplies[c.name] || 0;
        return sent >= 3 && (replies / sent) > 0.05;
      })
      .sort((a, b) => {
        const aRate = (campaignPerf.cityReplies[a.name] || 0) / (campaignPerf.citySent[a.name] || 1);
        const bRate = (campaignPerf.cityReplies[b.name] || 0) / (campaignPerf.citySent[b.name] || 1);
        return bRate - aRate;
      }) : [];
    
    // Recommend large unsearched cities
    const largeCities = unsearched.filter(c => c.type === 'METRO' || c.type === 'CITY');
    if (largeCities.length > 0) {
      recommendations.push({
        country,
        cities: largeCities.slice(0, 8),
        reason: `${largeCities.length} major cities not yet searched`,
        priority: 'high',
        suggestedNiches: topNiches.length > 0 ? topNiches : undefined,
      });
    }
    
    // Recommend unsearched towns
    const towns = unsearched.filter(c => c.type === 'TOWN');
    if (towns.length > 0) {
      recommendations.push({
        country,
        cities: towns.slice(0, 10),
        reason: `${towns.length} towns not yet covered`,
        priority: unsearched.length === towns.length ? 'medium' : 'low',
      });
    }
    
    // Recommend re-running high performers
    if (highPerformers.length > 0) {
      recommendations.push({
        country,
        cities: highPerformers.slice(0, 5),
        reason: `High success rate cities worth re-searching`,
        priority: 'medium',
        suggestedNiches: topNiches.length > 0 ? topNiches : undefined,
      });
    }

    // Recommend cities with high reply rates for more finder runs
    if (highReplyCities.length > 0) {
      recommendations.push({
        country,
        cities: highReplyCities.slice(0, 5),
        reason: `High SMS reply rate — find more leads here`,
        priority: 'high',
        suggestedNiches: topNiches.length > 0 ? topNiches : undefined,
      });
    }
  }
  
  return recommendations.sort((a, b) => {
    const prio = { high: 0, medium: 1, low: 2 };
    return prio[a.priority] - prio[b.priority];
  });
}
