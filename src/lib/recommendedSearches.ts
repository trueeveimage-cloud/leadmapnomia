/**
 * Recommended search suggestions based on coverage gaps and city performance.
 */

import { getCitiesByCountry, CityProfile, Country, COUNTRY_DEFAULT_KEYWORDS } from '@/lib/cities';
import { FinderRun } from '@/lib/finder';

export interface SearchRecommendation {
  country: Country;
  cities: CityProfile[];
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Generate recommended searches for each country based on coverage gaps.
 */
export function getRecommendedSearches(
  runs: FinderRun[],
  cityStats: Record<string, { runs: number; leads: number; candidates: number }>
): SearchRecommendation[] {
  const recommendations: SearchRecommendation[] = [];
  
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
    
    // Recommend large unsearched cities
    const largeCities = unsearched.filter(c => c.type === 'METRO' || c.type === 'CITY');
    if (largeCities.length > 0) {
      recommendations.push({
        country,
        cities: largeCities.slice(0, 8),
        reason: `${largeCities.length} major cities not yet searched`,
        priority: 'high',
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
      });
    }
  }
  
  return recommendations.sort((a, b) => {
    const prio = { high: 0, medium: 1, low: 2 };
    return prio[a.priority] - prio[b.priority];
  });
}
