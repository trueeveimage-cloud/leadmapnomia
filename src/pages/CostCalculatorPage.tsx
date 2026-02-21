import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Calculator, TrendingUp, Search, MapPin, DollarSign } from 'lucide-react';
import { format } from 'date-fns';

// Google Places API pricing (USD per request, as of 2025)
const PRICING = {
  textSearch: 0.032,       // Text Search: $32 per 1000
  placeDetails: 0.017,     // Place Details (Basic+Contact+Atmosphere): $17 per 1000
  findPlace: 0.017,        // Find Place: $17 per 1000
  nearbySearch: 0.032,     // Nearby Search: $32 per 1000
};

interface RunStats {
  id: string;
  city: string;
  keywords: string[];
  created_at: string;
  stats: Record<string, any>;
  status: string;
}

export default function CostCalculatorPage() {
  const [runs, setRuns] = useState<RunStats[]>([]);
  const [placeCache, setPlaceCache] = useState(0);
  const [leadsCount, setLeadsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [runsRes, cacheRes, leadsRes] = await Promise.all([
        supabase.from('finder_runs').select('id, city, keywords, created_at, stats, status').order('created_at', { ascending: false }),
        supabase.from('place_cache').select('place_id', { count: 'exact', head: true }),
        supabase.from('leads').select('id', { count: 'exact', head: true }),
      ]);
      setRuns((runsRes.data || []) as RunStats[]);
      setPlaceCache(cacheRes.count || 0);
      setLeadsCount(leadsRes.count || 0);
      setLoading(false);
    }
    load();
  }, []);

  // Calculate costs per run
  const runCosts = runs.map(run => {
    const stats = run.stats || {};
    const candidatesFound = stats.candidatesFound || 0;
    const detailsFetched = stats.detailsFetched || 0;
    const keywordsCount = (run.keywords || []).length;

    // Stage 1: text searches = roughly keywords * pages (we estimate pages from candidate count)
    const stage1Requests = keywordsCount; // minimum 1 request per keyword
    const stage1Cost = stage1Requests * PRICING.textSearch;

    // Stage 2: detail lookups
    const stage2Cost = detailsFetched * PRICING.placeDetails;

    const totalCost = stage1Cost + stage2Cost;

    return {
      ...run,
      stage1Requests,
      detailsFetched,
      candidatesFound,
      totalCost,
      stage1Cost,
      stage2Cost,
    };
  });

  const totalSpent = runCosts.reduce((sum, r) => sum + r.totalCost, 0);
  const totalDetails = runCosts.reduce((sum, r) => sum + r.detailsFetched, 0);
  const totalSearches = runCosts.reduce((sum, r) => sum + r.stage1Requests, 0);
  // Savings from cache: each cached place_id saves 1 detail lookup
  const estimatedSavings = placeCache * PRICING.placeDetails;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 pb-10">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Calculator size={20} className="text-primary" /> API Cost Calculator
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Track your Google Places API spending across all finder runs and lead lookups.</p>
        </div>

        {loading ? (
          <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><DollarSign size={11} /> Total Spent</div>
                <div className="text-xl font-bold text-foreground">${totalSpent.toFixed(2)}</div>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Search size={11} /> Text Searches</div>
                <div className="text-xl font-bold text-foreground">{totalSearches}</div>
                <div className="text-[10px] text-muted-foreground">${(totalSearches * PRICING.textSearch).toFixed(2)}</div>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><MapPin size={11} /> Detail Lookups</div>
                <div className="text-xl font-bold text-foreground">{totalDetails}</div>
                <div className="text-[10px] text-muted-foreground">${(totalDetails * PRICING.placeDetails).toFixed(2)}</div>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><TrendingUp size={11} /> Cache Savings</div>
                <div className="text-xl font-bold text-green-400">${estimatedSavings.toFixed(2)}</div>
                <div className="text-[10px] text-muted-foreground">{placeCache} cached places</div>
              </div>
            </div>

            {/* Pricing reference */}
            <div className="bg-card border border-border rounded-lg p-4 mb-6">
              <h2 className="text-sm font-semibold text-foreground mb-2">Google Places API Pricing</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Text Search</span>
                  <span className="font-mono">${PRICING.textSearch.toFixed(3)}/req</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Place Details</span>
                  <span className="font-mono">${PRICING.placeDetails.toFixed(3)}/req</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Find Place</span>
                  <span className="font-mono">${PRICING.findPlace.toFixed(3)}/req</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Nearby Search</span>
                  <span className="font-mono">${PRICING.nearbySearch.toFixed(3)}/req</span>
                </div>
              </div>
            </div>

            {/* Per-run breakdown */}
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-3">Cost Per Finder Run</h2>
              {runCosts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No finder runs yet. Run your first search to see costs here.</div>
              ) : (
                <div className="space-y-2">
                  {runCosts.map(r => (
                    <div key={r.id} className="p-3 bg-card border border-border rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm font-medium text-foreground truncate">
                          {r.city} — {(r.keywords || []).slice(0, 3).join(', ')}{(r.keywords || []).length > 3 ? '…' : ''}
                        </div>
                        <span className="text-sm font-bold text-foreground shrink-0 ml-2">${r.totalCost.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span>{format(new Date(r.created_at), 'MMM d, HH:mm')}</span>
                        <span>{r.stage1Requests} searches (${r.stage1Cost.toFixed(2)})</span>
                        <span>{r.detailsFetched} details (${r.stage2Cost.toFixed(2)})</span>
                        <span>{r.candidatesFound} candidates</span>
                        <span className="capitalize">{r.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Manual add leads cost note */}
            <div className="mt-6 bg-card border border-border rounded-lg p-4">
              <h2 className="text-sm font-semibold text-foreground mb-1">Individual Lead Lookups</h2>
              <p className="text-xs text-muted-foreground">
                Each "Add Lead" via Google Maps link costs ~1 Place Details call ($0.017) plus potentially 1 Text/Find search ($0.032) for URL resolution.
                You have <strong className="text-foreground">{leadsCount}</strong> leads — estimated manual lookup cost: <strong className="text-foreground">${(leadsCount * (PRICING.placeDetails + PRICING.textSearch * 0.5)).toFixed(2)}</strong>.
              </p>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
