import React, { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Loader2, Flame, RefreshCcw, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchLeads, updateLead, type Lead, type LeadTier } from '@/lib/supabase';
import { calculateScore, detectNiche, generateWhyGoodLead, NICHE_PROFILES, type NicheKey } from '@/lib/leadScoring';
import { TierBadge, ScoreRing, MetaBadge } from '@/components/LeadScoreBadge';
import LeadQuickActions from '@/components/LeadQuickActions';
import { toast } from 'sonner';

type SortKey = 'score' | 'reviews' | 'rating' | 'worst_site' | 'no_booking' | 'emergency' | 'recent' | 'not_contacted';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'score', label: 'Highest potential' },
  { key: 'reviews', label: 'Most reviews' },
  { key: 'rating', label: 'Highest rating' },
  { key: 'worst_site', label: 'Worst website first' },
  { key: 'no_booking', label: 'No booking first' },
  { key: 'emergency', label: 'Emergency first' },
  { key: 'recent', label: 'Recently added' },
  { key: 'not_contacted', label: 'Not contacted yet' },
];

interface Scored {
  lead: Lead;
  score: number;
  tier: LeadTier;
  niche: NicheKey;
  nicheLabel: string;
  badges: string[];
  why: string;
  hasEmergency: boolean;
  websiteQuality: string;
}

export default function HotLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescoring, setRescoring] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState({ done: 0, total: 0, found: 0 });
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState<'all' | LeadTier>('all');
  const [niche, setNiche] = useState<'all' | NicheKey>('all');
  const [city, setCity] = useState('');
  const [minScore, setMinScore] = useState<number>(0);
  const [minReviews, setMinReviews] = useState<number>(0);
  const [requirePhone, setRequirePhone] = useState(false);
  const [requireEmail, setRequireEmail] = useState(false);
  const [excludeOptOut, setExcludeOptOut] = useState(true);
  const [excludeContacted, setExcludeContacted] = useState(false);
  const [sort, setSort] = useState<SortKey>('score');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchLeads();
      setLeads(data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const scored: Scored[] = useMemo(() => {
    return leads.map((lead) => {
      let result;
      if (typeof lead.potential_score === 'number' && lead.lead_tier) {
        result = calculateScore(lead);
        result.score = lead.potential_score;
        result.tier = lead.lead_tier as LeadTier;
      } else {
        result = calculateScore(lead);
      }
      return {
        lead,
        score: result.score,
        tier: result.tier,
        niche: result.niche,
        nicheLabel: result.nicheLabel,
        badges: result.badges,
        why: lead.why_good_lead || generateWhyGoodLead(lead, result),
        hasEmergency: result.hasEmergency,
        websiteQuality: result.websiteQuality,
      };
    });
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cityQ = city.trim().toLowerCase();
    let arr = scored.filter((s) => {
      if (excludeOptOut && s.lead.outreach_opt_out) return false;
      if (excludeContacted && s.lead.status !== 'not_contacted') return false;
      if (requirePhone && !s.lead.phone) return false;
      if (requireEmail && !s.lead.email) return false;
      if (tier !== 'all' && s.tier !== tier) return false;
      if (niche !== 'all' && s.niche !== niche) return false;
      if (s.score < minScore) return false;
      if ((s.lead.reviews_count ?? 0) < minReviews) return false;
      if (cityQ && !(s.lead.address || '').toLowerCase().includes(cityQ)) return false;
      if (q) {
        const hay = `${s.lead.name} ${s.lead.address ?? ''} ${s.lead.category ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    switch (sort) {
      case 'score': arr.sort((a, b) => b.score - a.score); break;
      case 'reviews': arr.sort((a, b) => (b.lead.reviews_count ?? 0) - (a.lead.reviews_count ?? 0)); break;
      case 'rating': arr.sort((a, b) => (b.lead.rating ?? 0) - (a.lead.rating ?? 0)); break;
      case 'worst_site': arr.sort((a, b) => {
        const rank = (q: string) => q === 'none' ? 4 : q === 'weak' ? 3 : q === 'decent' ? 2 : 1;
        return rank(b.websiteQuality) - rank(a.websiteQuality);
      }); break;
      case 'no_booking': arr.sort((a, b) => Number(a.lead.has_booking === true) - Number(b.lead.has_booking === true) || b.score - a.score); break;
      case 'emergency': arr.sort((a, b) => Number(b.hasEmergency) - Number(a.hasEmergency) || b.score - a.score); break;
      case 'recent': arr.sort((a, b) => new Date(b.lead.created_at).getTime() - new Date(a.lead.created_at).getTime()); break;
      case 'not_contacted': arr.sort((a, b) => Number(a.lead.status !== 'not_contacted') - Number(b.lead.status !== 'not_contacted') || b.score - a.score); break;
    }
    return arr;
  }, [scored, search, city, tier, niche, minScore, minReviews, requirePhone, requireEmail, excludeOptOut, excludeContacted, sort]);

  const rescoreAll = async () => {
    setRescoring(true);
    try {
      const BATCH = 200;
      for (let i = 0; i < scored.length; i += BATCH) {
        const slice = scored.slice(i, i + BATCH);
        await Promise.all(slice.map(async (s) => {
          const r = calculateScore(s.lead);
          const why = generateWhyGoodLead(s.lead, r);
          await supabase.from('leads').update({
            potential_score: r.score,
            lead_tier: r.tier,
            detected_niche: r.niche,
            estimated_value: r.estimatedValue,
            website_quality: r.websiteQuality,
            why_good_lead: why,
          } as any).eq('id', s.lead.id);
        }));
      }
      toast.success(`Recomputed ${scored.length} leads`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Rescore failed');
    } finally { setRescoring(false); }
  };
  const scrapeFilteredEmails = async () => {
    const targets = filtered
      .map((s) => s.lead)
      .filter((l) => l.website && !l.email);
    if (targets.length === 0) {
      toast.info('No filtered leads need email scraping');
      return;
    }
    setScraping(true);
    setScrapeProgress({ done: 0, total: targets.length, found: 0 });
    let found = 0;
    try {
      for (let i = 0; i < targets.length; i += 5) {
        const batch = targets.slice(i, i + 5).map((l) => ({ leadId: l.id, website: l.website! }));
        try {
          const { data } = await supabase.functions.invoke('scrape-emails', { body: { urls: batch } });
          if (data?.success && data.results) {
            for (const r of data.results) {
              const email = r.email || r.emails?.[0];
              if (email) {
                await supabase.from('leads').update({ email, email_source: r.source || 'homepage' } as any).eq('id', r.leadId);
                found++;
              }
            }
          }
        } catch (e) { console.error('scrape batch', e); }
        setScrapeProgress({ done: Math.min(i + 5, targets.length), total: targets.length, found });
      }
      toast.success(`Found emails for ${found} / ${targets.length} leads`);
      await load();
    } finally { setScraping(false); }
  };

  const tiers: { key: 'all' | LeadTier; label: string }[] = [
    { key: 'all', label: 'All tiers' },
    { key: 'A+', label: 'A+ Hot' },
    { key: 'A', label: 'A' },
    { key: 'B', label: 'B' },
    { key: 'C', label: 'C' },
  ];

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto">
        <div className="px-6 py-5 max-w-[1400px] mx-auto space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Flame className="h-6 w-6 text-rose-500" /> Hot Leads
              </h1>
              <p className="text-sm text-muted-foreground">Highest-potential AI receptionist prospects, sorted by score.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={scrapeFilteredEmails} disabled={scraping || loading} variant="outline">
                {scraping ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Search className="h-4 w-4 mr-1.5" />}
                {scraping ? `Finding emails… ${scrapeProgress.found}/${scrapeProgress.done} of ${scrapeProgress.total}` : 'Find emails (filtered)'}
              </Button>
              <Button onClick={rescoreAll} disabled={rescoring || loading} variant="outline">
                {rescoring ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-1.5" />}
                Recompute scores
              </Button>
            </div>
          </div>

          <Card className="p-3 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              <Input placeholder="Search name / category" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9" />
              <Input placeholder="City (in address)" value={city} onChange={(e) => setCity(e.target.value)} className="h-9" />
              <Select value={tier} onValueChange={(v) => setTier(v as any)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Tier" /></SelectTrigger>
                <SelectContent>{tiers.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={niche} onValueChange={(v) => setNiche(v as any)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Niche" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All niches</SelectItem>
                  {(Object.keys(NICHE_PROFILES) as NicheKey[]).map((k) => (
                    <SelectItem key={k} value={k}>{NICHE_PROFILES[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(minScore)} onValueChange={(v) => setMinScore(parseInt(v, 10))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Min score" /></SelectTrigger>
                <SelectContent>
                  {[0, 50, 60, 70, 80, 85, 90].map((n) => <SelectItem key={n} value={String(n)}>Score ≥ {n}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(minReviews)} onValueChange={(v) => setMinReviews(parseInt(v, 10))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Min reviews" /></SelectTrigger>
                <SelectContent>
                  {[0, 10, 30, 50, 100, 200].map((n) => <SelectItem key={n} value={String(n)}>Reviews ≥ {n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={requirePhone} onChange={(e) => setRequirePhone(e.target.checked)} /> Has phone</label>
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={requireEmail} onChange={(e) => setRequireEmail(e.target.checked)} /> Has email</label>
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={excludeOptOut} onChange={(e) => setExcludeOptOut(e.target.checked)} /> Exclude opt-out</label>
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={excludeContacted} onChange={(e) => setExcludeContacted(e.target.checked)} /> Not contacted only</label>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-muted-foreground">Sort:</span>
                <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                  <SelectTrigger className="h-8 w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{SORTS.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">{filtered.length.toLocaleString()} of {scored.length.toLocaleString()} leads</div>
          </Card>

          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-2">
              {filtered.slice(0, 200).map((s) => {
                const isOpen = openId === s.lead.id;
                return (
                  <Card key={s.lead.id} className="p-3 hover:border-primary/40 transition-colors">
                    <div className="flex items-start gap-4">
                      <ScoreRing score={s.score} />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-semibold text-base truncate">{s.lead.name}</h3>
                          <TierBadge tier={s.tier} />
                          <span className="text-xs text-muted-foreground">{s.nicheLabel}</span>
                          {s.lead.rating && <span className="text-xs text-amber-500">★ {s.lead.rating} ({s.lead.reviews_count ?? 0})</span>}
                        </div>
                        {s.lead.address && <div className="text-xs text-muted-foreground truncate mb-1.5">{s.lead.address}</div>}
                        <div className="flex flex-wrap gap-1 mb-2">
                          {s.badges.map((b) => <MetaBadge key={b} label={b} />)}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{s.why}</p>
                      </div>
                      <button onClick={() => setOpenId(isOpen ? null : s.lead.id)} className="shrink-0 p-1.5 rounded-md hover:bg-accent text-muted-foreground">
                        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                    {isOpen && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <LeadQuickActions lead={s.lead} onUpdated={load} />
                      </div>
                    )}
                  </Card>
                );
              })}
              {filtered.length === 0 && (
                <Card className="p-10 text-center text-sm text-muted-foreground">
                  No leads match these filters. Try lowering the score threshold or recompute scores.
                </Card>
              )}
              {filtered.length > 200 && (
                <div className="text-xs text-muted-foreground text-center py-2">Showing top 200 of {filtered.length}. Tighten filters to see more.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
