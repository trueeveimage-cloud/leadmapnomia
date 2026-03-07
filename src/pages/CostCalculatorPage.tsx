import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import InfoTip from '@/components/InfoTip';
import { supabase } from '@/integrations/supabase/client';
import { Calculator, TrendingUp, Search, MapPin, DollarSign, MessageSquare, Wallet, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';

const PRICING = {
  textSearch: 0.032,
  placeDetails: 0.017,
  findPlace: 0.017,
  nearbySearch: 0.032,
};

const SMS_PRICING = {
  outbound: 0.065,
  inbound: 0.0075,
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
  const [smsStats, setSmsStats] = useState({ outbound: 0, inbound: 0 });
  const [twilioBalance, setTwilioBalance] = useState<{ balance: number; currency: string } | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const [runsRes, cacheRes, leadsRes, outboundRes, inboundRes] = await Promise.all([
        supabase.from('finder_runs').select('id, city, keywords, created_at, stats, status').order('created_at', { ascending: false }),
        supabase.from('place_cache').select('place_id', { count: 'exact', head: true }),
        supabase.from('leads').select('id', { count: 'exact', head: true }),
        supabase.from('message_logs').select('id', { count: 'exact', head: true }).eq('direction', 'outbound'),
        supabase.from('message_logs').select('id', { count: 'exact', head: true }).eq('direction', 'inbound'),
      ]);
      setRuns((runsRes.data || []) as RunStats[]);
      setPlaceCache(cacheRes.count || 0);
      setLeadsCount(leadsRes.count || 0);
      setSmsStats({ outbound: outboundRes.count || 0, inbound: inboundRes.count || 0 });
      setLoading(false);
    }
    load();
    fetchBalance();
  }, []);

  async function fetchBalance() {
    setBalanceLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-balance');
      if (!error && data?.balance != null) {
        setTwilioBalance({ balance: data.balance, currency: data.currency || 'USD' });
      }
    } catch {}
    setBalanceLoading(false);
  }

  const runCosts = runs.map(run => {
    const stats = run.stats || {};
    const candidatesFound = stats.candidatesFound || 0;
    const detailsFetched = stats.detailsFetched || 0;
    const keywordsCount = (run.keywords || []).length;
    const stage1Requests = keywordsCount;
    const stage1Cost = stage1Requests * PRICING.textSearch;
    const stage2Cost = detailsFetched * PRICING.placeDetails;
    const totalCost = stage1Cost + stage2Cost;
    return { ...run, stage1Requests, detailsFetched, candidatesFound, totalCost, stage1Cost, stage2Cost };
  });

  const totalSpent = runCosts.reduce((sum, r) => sum + r.totalCost, 0);
  const totalDetails = runCosts.reduce((sum, r) => sum + r.detailsFetched, 0);
  const totalSearches = runCosts.reduce((sum, r) => sum + r.stage1Requests, 0);
  const estimatedSavings = placeCache * PRICING.placeDetails;

  const smsCostOutbound = smsStats.outbound * SMS_PRICING.outbound;
  const smsCostInbound = smsStats.inbound * SMS_PRICING.inbound;
  const smsCostTotal = smsCostOutbound + smsCostInbound;

  const smsRemaining = twilioBalance ? Math.floor(twilioBalance.balance / SMS_PRICING.outbound) : null;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 pb-10">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Calculator size={20} className="text-primary" /> Cost Calculator
            <InfoTip text="Tracks your estimated API and SMS spending." />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Track Google Places API & SMS costs.</p>
        </div>

        {loading ? (
          <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>
        ) : (
          <>
            {/* Twilio Balance */}
            <div className="mb-6 bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Wallet size={14} className="text-primary" /> Twilio Account Balance
                </h2>
                <Button variant="ghost" size="sm" onClick={fetchBalance} disabled={balanceLoading} className="h-7 text-xs gap-1">
                  <RefreshCw size={12} className={balanceLoading ? 'animate-spin' : ''} /> Refresh
                </Button>
              </div>
              {twilioBalance ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Balance</div>
                    <div className="text-2xl font-bold text-foreground">${twilioBalance.balance.toFixed(2)}</div>
                    <div className="text-[10px] text-muted-foreground">{twilioBalance.currency}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">SMS Remaining</div>
                    <div className="text-2xl font-bold text-foreground">{smsRemaining?.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">at ${SMS_PRICING.outbound}/msg</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Total Spent on SMS</div>
                    <div className="text-2xl font-bold text-foreground">${smsCostTotal.toFixed(2)}</div>
                    <div className="text-[10px] text-muted-foreground">{smsStats.outbound + smsStats.inbound} messages</div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{balanceLoading ? 'Loading…' : 'Could not fetch balance — check Twilio config'}</p>
              )}
            </div>

            {/* SMS Cost Section */}
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <MessageSquare size={14} className="text-primary" /> SMS Costs (Twilio)
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="text-xs text-muted-foreground mb-1">Total SMS Cost</div>
                  <div className="text-xl font-bold text-foreground">${smsCostTotal.toFixed(2)}</div>
                </div>
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="text-xs text-muted-foreground mb-1">Outbound SMS</div>
                  <div className="text-xl font-bold text-foreground">{smsStats.outbound}</div>
                  <div className="text-[10px] text-muted-foreground">${smsCostOutbound.toFixed(2)}</div>
                </div>
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="text-xs text-muted-foreground mb-1">Inbound SMS</div>
                  <div className="text-xl font-bold text-foreground">{smsStats.inbound}</div>
                  <div className="text-[10px] text-muted-foreground">${smsCostInbound.toFixed(2)}</div>
                </div>
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="text-xs text-muted-foreground mb-1">Per SMS Cost</div>
                  <div className="text-xl font-bold text-foreground">${SMS_PRICING.outbound.toFixed(3)}</div>
                  <div className="text-[10px] text-muted-foreground">outbound rate</div>
                </div>
              </div>
            </div>

            {/* API Summary cards */}
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Search size={14} className="text-primary" /> Google Places API Costs
              </h2>
            </div>
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

            {/* Combined total */}
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Grand Total (API + SMS)</span>
                <span className="text-xl font-bold text-primary">${(totalSpent + smsCostTotal).toFixed(2)}</span>
              </div>
            </div>

            {/* Pricing reference */}
            <div className="bg-card border border-border rounded-lg p-4 mb-6">
              <h2 className="text-sm font-semibold text-foreground mb-2">Pricing Reference</h2>
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
                  <span>SMS Outbound</span>
                  <span className="font-mono">${SMS_PRICING.outbound.toFixed(4)}/msg</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>SMS Inbound</span>
                  <span className="font-mono">${SMS_PRICING.inbound.toFixed(4)}/msg</span>
                </div>
              </div>
            </div>

            {/* Per-run breakdown */}
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-3">Cost Per Finder Run</h2>
              {runCosts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No finder runs yet.</div>
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
          </>
        )}
      </div>
    </AppLayout>
  );
}
