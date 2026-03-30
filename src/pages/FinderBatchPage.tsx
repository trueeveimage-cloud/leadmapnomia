import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import InfoTip from '@/components/InfoTip';
import { fetchFinderRunsByBatch, fetchFinderCandidatesByBatch, stopFinderRun, candidatesToCsv, resumeFinderRun, FinderRun, FinderCandidate } from '@/lib/finder';
import { addLead, determineSection } from '@/lib/supabase';
import { supabase } from '@/integrations/supabase/client';
import { useCRM } from '@/context/CRMContext';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Loader2, CheckCircle, XCircle, Square, Phone, Globe,
  Plus, Download, MapPin, Star, ExternalLink, Mail, ChevronDown, ChevronUp, Play, Search
} from 'lucide-react';
import { format } from 'date-fns';

type Tab = 'no_website_phone' | 'no_website_no_phone' | 'unfetched' | 'duplicates' | 'skipped' | 'all';

export default function FinderBatchPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const { refreshCounts } = useCRM();
  const [runs, setRuns] = useState<FinderRun[]>([]);
  const [candidates, setCandidates] = useState<FinderCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('no_website_phone');
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [bulkAdding, setBulkAdding] = useState(false);
  const [scrapingEmails, setScrapingEmails] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState<{ done: number; total: number; found: number } | null>(null);
  const [expandedCities, setExpandedCities] = useState(true);
  const autoAddedRunIds = useRef<Set<string>>(new Set());


  const load = useCallback(async () => {
    if (!batchId) return;
    try {
      const [r, c] = await Promise.all([fetchFinderRunsByBatch(batchId), fetchFinderCandidatesByBatch(batchId)]);
      setRuns(r);
      setCandidates(c);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      const anyActive = runs.some(r => r.status === 'running' || r.status === 'pending');
      if (anyActive) load();
    }, 3000);
    return () => clearInterval(interval);
  }, [load, runs.length]);

  // Check which candidates already exist in CRM (by place_id)
  useEffect(() => {
    if (candidates.length === 0) return;
    const placeIds = candidates.filter(c => c.place_id).map(c => c.place_id);
    if (placeIds.length === 0) return;
    (async () => {
      // Check in batches of 100
      const existing = new Set<string>();
      for (let i = 0; i < placeIds.length; i += 100) {
        const batch = placeIds.slice(i, i + 100);
        const { data } = await supabase.from('leads').select('place_id').in('place_id', batch);
        if (data) data.forEach((d: any) => existing.add(d.place_id));
      }
      // Mark candidates whose place_id already exists
      const alreadyAdded = new Set<string>();
      candidates.forEach(c => {
        if (existing.has(c.place_id)) alreadyAdded.add(c.id);
      });
      if (alreadyAdded.size > 0) setAddedIds(alreadyAdded);
    })();
  }, [candidates.length]);

  const handleStopAll = async () => {
    const active = runs.filter(r => r.status === 'running' || r.status === 'pending');
    for (const r of active) {
      await stopFinderRun(r.id);
    }
    toast.info(`Stopping ${active.length} runs…`);
    setTimeout(load, 1000);
  };

  const handleResumeAll = async () => {
    const pending = runs.filter(r => {
      const pendingCount = candidates.filter(c => c.run_id === r.id && c.outcome === 'pending').length;
      return pendingCount > 0;
    });
    for (const r of pending) {
      resumeFinderRun(r.id).catch(() => {});
    }
    toast.info(`Resuming ${pending.length} runs…`);
    setTimeout(load, 2000);
  };

  const handleScrapeEmails = async () => {
    const { data: leads } = await supabase.from('leads').select('id, website, email').not('website', 'is', null);
    const leadsWithWebsite = (leads || []).filter(l => l.website && !l.email);
    if (leadsWithWebsite.length === 0) { toast.info('No leads missing emails'); return; }
    setScrapingEmails(true);
    setScrapeProgress({ done: 0, total: leadsWithWebsite.length, found: 0 });
    let totalFound = 0;
    for (let i = 0; i < leadsWithWebsite.length; i += 5) {
      const batch = leadsWithWebsite.slice(i, i + 5).map(l => ({ leadId: l.id, website: l.website! }));
      try {
        const { data, error } = await supabase.functions.invoke('scrape-emails', { body: { urls: batch } });
        if (!error && data?.results) {
          for (const r of data.results) {
            if (r.emails?.length > 0) {
              const email = r.emails[0];
              const { data: lead } = await supabase.from('leads').select('phone, email').eq('id', r.leadId).single();
              const newSection = determineSection({ ...lead, email } as any);
              await supabase.from('leads').update({ email, section: newSection }).eq('id', r.leadId);
              totalFound++;
            }
          }
        }
      } catch {}
      setScrapeProgress({ done: Math.min(i + 5, leadsWithWebsite.length), total: leadsWithWebsite.length, found: totalFound });
    }
    setScrapingEmails(false);
    setScrapeProgress(null);
    refreshCounts();
    if (totalFound > 0) toast.success(`Found ${totalFound} emails!`);
    else toast.info('No emails found');
  };

  const addToCrm = async (candidate: FinderCandidate) => {
    setAddingIds(s => new Set(s).add(candidate.id));
    try {
      const leadData = {
        place_id: candidate.place_id, maps_url: candidate.maps_url, name: candidate.name,
        category: candidate.category, niche_label: candidate.category?.split(',')[0]?.trim() || null,
        rating: candidate.rating, reviews_count: candidate.reviews_count,
        phone: candidate.phone, email: candidate.email || null, address: candidate.address, website: candidate.website,
      };
      const section = determineSection(leadData);
      const { duplicate, error } = await addLead({ ...leadData, section, status: 'not_contacted' });
      if (duplicate) toast.warning(`${candidate.name} already exists`);
      else if (error) toast.error(error);
      else { setAddedIds(s => new Set(s).add(candidate.id)); toast.success(`Added ${candidate.name}`); refreshCounts(); }
    } catch (e: any) { toast.error(e.message); }
    finally { setAddingIds(s => { const n = new Set(s); n.delete(candidate.id); return n; }); }
  };

  const bulkAddFiltered = async () => {
    const targets = candidates.filter(c => isAddable(c));
    if (targets.length === 0) return;
    setBulkAdding(true);
    let added = 0, skipped = 0;
    for (const c of targets) {
      try {
        const leadData = {
          place_id: c.place_id, maps_url: c.maps_url, name: c.name,
          category: c.category, niche_label: c.category?.split(',')[0]?.trim() || null,
          rating: c.rating, reviews_count: c.reviews_count,
          phone: c.phone, email: c.email || null, address: c.address, website: c.website,
        };
        const section = determineSection(leadData);
        const { duplicate, error } = await addLead({ ...leadData, section, status: 'not_contacted' });
        if (!duplicate && !error) { setAddedIds(s => new Set(s).add(c.id)); added++; }
        else skipped++;
      } catch { skipped++; }
    }
    refreshCounts();
    setBulkAdding(false);
    toast.success(`Added ${added} leads to CRM${skipped > 0 ? ` (${skipped} skipped)` : ''}`);
  };

  const exportCsv = () => {
    const csv = candidatesToCsv(filtered);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `finder-batch-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // Filters
  const noWebsitePhone = candidates.filter(c => c.outcome === 'no_website_phone' || (c.outcome === 'no_website' && c.has_phone === true));
  const noWebsiteNoPhone = candidates.filter(c => c.outcome === 'no_website_no_phone' || (c.outcome === 'no_website' && c.has_phone === false));
  const unfetched = candidates.filter(c => c.outcome === 'pending' || (!c.last_fetched_at && c.outcome !== 'duplicate'));
  const duplicates = candidates.filter(c => c.outcome === 'duplicate');
  const other = candidates.filter(c => c.outcome === 'skipped' || c.outcome === 'failed' || c.outcome === 'has_website');

  const filtered = tab === 'no_website_phone' ? noWebsitePhone
    : tab === 'no_website_no_phone' ? noWebsiteNoPhone
    : tab === 'unfetched' ? unfetched
    : tab === 'duplicates' ? duplicates
    : tab === 'skipped' ? other
    : candidates;

  const tabs: { key: Tab; label: string; count: number; color?: string }[] = [
    { key: 'no_website_phone', label: 'No Website + Phone', count: noWebsitePhone.length, color: 'text-green' },
    { key: 'no_website_no_phone', label: 'No Website Only', count: noWebsiteNoPhone.length },
    { key: 'unfetched', label: 'Unfetched', count: unfetched.length, color: 'text-amber' },
    { key: 'duplicates', label: 'In CRM', count: duplicates.length },
    { key: 'skipped', label: 'Other', count: other.length },
    { key: 'all', label: 'All', count: candidates.length },
  ];

  const isAddable = (c: FinderCandidate) =>
    (c.outcome === 'no_website_phone' || c.outcome === 'no_website_no_phone' || c.outcome === 'no_website') && !addedIds.has(c.id);

  if (loading) return <AppLayout><div className="flex items-center justify-center pt-20"><Loader2 className="animate-spin text-primary" size={24} /></div></AppLayout>;
  if (runs.length === 0) return <AppLayout><div className="text-center pt-20 text-muted-foreground">Batch not found</div></AppLayout>;

  const doneCount = runs.filter(r => r.status === 'done').length;
  const runningCount = runs.filter(r => r.status === 'running' || r.status === 'pending').length;
  const totalPending = candidates.filter(c => c.outcome === 'pending').length;
  const cities = runs.map(r => r.city);
  const totalLeads = noWebsitePhone.length + noWebsiteNoPhone.length;

  // Per-city breakdown
  const cityBreakdown = runs.map(r => {
    const cityCandidates = candidates.filter(c => c.run_id === r.id);
    const leads = cityCandidates.filter(c => c.outcome === 'no_website_phone' || c.outcome === 'no_website_no_phone' || c.outcome === 'no_website').length;
    const pending = cityCandidates.filter(c => c.outcome === 'pending').length;
    return { city: r.city, status: r.status, total: cityCandidates.length, leads, pending, runId: r.id };
  });

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 pb-10">
        {/* Header */}
        <div className="flex items-start gap-3 mb-5">
          <Link to="/finder" className="mt-1">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><ArrowLeft size={14} /></Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">
              {cities.length} Cities Batch
            </h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
              {runningCount > 0 && <span className="flex items-center gap-1 text-primary"><Loader2 size={11} className="animate-spin" /> {runningCount} running</span>}
              <span>{doneCount}/{runs.length} done</span>
              <span>·</span>
              <span>{candidates.length} found</span>
              <span>·</span>
              <span className="text-green">{totalLeads} leads</span>
              {totalPending > 0 && <><span>·</span><span className="text-amber">{totalPending} pending</span></>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {runningCount > 0 && (
              <Button variant="destructive" size="sm" onClick={handleStopAll} className="gap-1.5">
                <Square size={12} /> Stop All
              </Button>
            )}
            {totalPending > 0 && runningCount === 0 && (
              <Button variant="default" size="sm" onClick={handleResumeAll} className="gap-1.5">
                <Play size={12} /> Resume ({totalPending})
              </Button>
            )}
            {(() => {
              const allAddable = candidates.filter(c => isAddable(c));
              return allAddable.length > 0 ? (
                <Button
                  size="sm"
                  onClick={bulkAddFiltered}
                  disabled={bulkAdding}
                  className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                >
                  {bulkAdding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Add {allAddable.length} Leads
                </Button>
              ) : null;
            })()}
          </div>
        </div>

        {/* Overall progress */}
        {runningCount > 0 && (
          <div className="mb-4">
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(doneCount / runs.length) * 100}%` }} />
            </div>
          </div>
        )}

        {/* City breakdown */}
        <button
          onClick={() => setExpandedCities(v => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors"
        >
          <MapPin size={12} /> Cities breakdown
          {expandedCities ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {expandedCities && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mb-4">
            {cityBreakdown.map(cb => (
              <Link
                key={cb.runId}
                to={`/finder/runs/${cb.runId}`}
                className="p-2 bg-card border border-border rounded-lg hover:border-primary/30 transition-colors text-xs"
              >
                <div className="flex items-center gap-1.5">
                  {cb.status === 'done' && <CheckCircle size={10} className="text-green shrink-0" />}
                  {cb.status === 'running' && <Loader2 size={10} className="animate-spin text-primary shrink-0" />}
                  {cb.status === 'stopped' && <Square size={10} className="text-amber shrink-0" />}
                  {cb.status === 'failed' && <XCircle size={10} className="text-red shrink-0" />}
                  {cb.status === 'pending' && <Loader2 size={10} className="text-muted-foreground shrink-0" />}
                  <span className="font-medium text-foreground truncate">{cb.city}</span>
                </div>
                <div className="text-muted-foreground mt-0.5">
                  {cb.leads} leads · {cb.total} found{cb.pending > 0 ? ` · ${cb.pending} pending` : ''}
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1 mb-4 -mx-1 px-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                tab === t.key
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className={t.color}>{t.label}</span>
              <span className="ml-1.5 opacity-60">{t.count}</span>
            </button>
          ))}
        </div>

        {/* Big Add All Leads button */}
        {(() => {
          const allAddable = candidates.filter(c => isAddable(c));
          if (allAddable.length > 0) return (
            <Button
              size="lg"
              onClick={async () => {
                setBulkAdding(true);
                let added = 0, dupes = 0;
                const cities = [...new Set(runs.map(r => r.id))];
                for (const runId of cities) {
                  const cityCandidates = allAddable.filter(c => c.run_id === runId);
                  for (const c of cityCandidates) {
                    try {
                      const leadData = {
                        place_id: c.place_id, maps_url: c.maps_url, name: c.name,
                        category: c.category, niche_label: c.category?.split(',')[0]?.trim() || null,
                        rating: c.rating, reviews_count: c.reviews_count,
                        phone: c.phone, email: c.email || null, address: c.address, website: c.website,
                      };
                      const section = determineSection(leadData);
                      const { duplicate, error } = await addLead({ ...leadData, section, status: 'not_contacted' });
                      if (duplicate) { dupes++; setAddedIds(s => new Set(s).add(c.id)); }
                      else if (!error) { setAddedIds(s => new Set(s).add(c.id)); added++; }
                    } catch {}
                  }
                }
                refreshCounts();
                setBulkAdding(false);
                const parts = [];
                if (added > 0) parts.push(`${added} added`);
                if (dupes > 0) parts.push(`${dupes} duplicates`);
                toast.success(parts.join(', ') || 'Done');
              }}
              disabled={bulkAdding}
              className="w-full mb-4 gap-2 text-base"
            >
              {bulkAdding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {bulkAdding ? 'Adding leads…' : `Add All ${allAddable.length} Leads to CRM`}
            </Button>
          );
          return null;
        })()}

        {/* Email scraping + actions */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <Button size="sm" variant="outline" onClick={handleScrapeEmails} disabled={scrapingEmails} className="gap-1.5">
            {scrapingEmails ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            {scrapingEmails ? `Scraping… ${scrapeProgress?.found || 0} found` : 'Scrape Emails'}
          </Button>
          {scrapeProgress && (
            <span className="text-xs text-muted-foreground self-center">{scrapeProgress.done}/{scrapeProgress.total}</span>
          )}
          <Button size="sm" variant="outline" onClick={exportCsv} className="gap-1.5">
            <Download size={12} /> Export CSV
          </Button>
        </div>

        {/* Results */}
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {runningCount > 0 ? 'Searching… results will appear here.' : 'No results in this category.'}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(c => {
              const cityRun = runs.find(r => r.id === c.run_id);
              return (
                <div key={c.id} className="p-3 bg-card border border-border rounded-lg flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-foreground truncate">{c.name}</div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                      {cityRun && <span className="text-primary/70">{cityRun.city}</span>}
                      {c.rating && <span className="flex items-center gap-0.5"><Star size={10} className="text-amber-400" /> {c.rating}</span>}
                      {c.reviews_count != null && <span>{c.reviews_count} reviews</span>}
                      {c.category && <span className="truncate max-w-[150px]">{c.category}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs flex-wrap">
                      {c.phone && <span className="text-green-400 flex items-center gap-0.5"><Phone size={10} /> {c.phone}</span>}
                      {c.email && <span className="text-blue-400 flex items-center gap-0.5"><Mail size={10} /> {c.email}</span>}
                      {c.has_website === false && <span className="text-red-400 flex items-center gap-0.5"><Globe size={10} /> No website</span>}
                      {c.has_website === true && <span className="text-muted-foreground flex items-center gap-0.5"><Globe size={10} /> Has website</span>}
                      {c.address && <span className="text-muted-foreground flex items-center gap-0.5 truncate max-w-[200px]"><MapPin size={10} /> {c.address}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.maps_url && (
                      <a href={c.maps_url} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><ExternalLink size={12} /></Button>
                      </a>
                    )}
                    {isAddable(c) && (
                      <Button size="sm" onClick={() => addToCrm(c)} disabled={addingIds.has(c.id)} className="h-7 px-2 text-xs gap-1">
                        {addingIds.has(c.id) ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />} Add
                      </Button>
                    )}
                    {addedIds.has(c.id) && <span className="text-xs text-green-400 flex items-center gap-0.5"><CheckCircle size={10} /> Added</span>}
                    {c.outcome === 'duplicate' && <span className="text-xs text-amber-400">In CRM</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
