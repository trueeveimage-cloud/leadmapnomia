import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import InfoTip from '@/components/InfoTip';
import { fetchFinderRun, fetchFinderCandidates, stopFinderRun, candidatesToCsv, refetchFailedCandidates, resumeFinderRun, FinderRun, FinderCandidate } from '@/lib/finder';
import { addLead, createNotification, determineSection, updateLead } from '@/lib/supabase';
import { supabase } from '@/integrations/supabase/client';
import { useCRM } from '@/context/CRMContext';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Loader2, CheckCircle, XCircle, Square, Phone, Globe,
  Plus, Download, MapPin, Star, ExternalLink, Mail, Bug, ChevronDown, ChevronUp, RefreshCw, Play, Search
} from 'lucide-react';

type Tab = 'no_website_phone' | 'no_website_no_phone' | 'unfetched' | 'duplicates' | 'skipped' | 'all';

export default function FinderRunPage() {
  const { id } = useParams<{ id: string }>();
  const { refreshCounts } = useCRM();
  const [run, setRun] = useState<FinderRun | null>(null);
  const [candidates, setCandidates] = useState<FinderCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('no_website_phone');
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [bulkAdding, setBulkAdding] = useState(false);
  const [showDiag, setShowDiag] = useState(false);
  const [refetching, setRefetching] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [scrapingEmails, setScrapingEmails] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState<{ done: number; total: number; found: number } | null>(null);
  const autoAddedRef = React.useRef(false);
  const autoResumeRef = React.useRef(false);
  const notifiedRunRef = React.useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [r, c] = await Promise.all([fetchFinderRun(id), fetchFinderCandidates(id)]);
      setRun(r);
      setCandidates(c);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (run?.status === 'running' || run?.status === 'pending') load();
    }, 3000);
    return () => clearInterval(interval);
  }, [load, run?.status]);

  useEffect(() => {
    if (!run || !['done', 'stopped', 'error'].includes(run.status)) return;
    if (notifiedRunRef.current === `${run.id}:${run.status}`) return;
    const storageKey = `crm.notifiedFinderRun.${run.id}.${run.status}`;
    if (localStorage.getItem(storageKey)) return;
    notifiedRunRef.current = `${run.id}:${run.status}`;
    createNotification({
      type: 'lead_find_done',
      title: run.status === 'done' ? 'Lead finder run finished' : `Lead finder run ${run.status}`,
      message: `${run.city} finished with ${candidates.length} candidates.`,
      payload: {
        runId: run.id,
        city: run.city,
        status: run.status,
        candidates: candidates.length,
        batch: run.batch_label || '',
      },
    }).then(() => localStorage.setItem(storageKey, 'true')).catch(() => {});
  }, [run?.id, run?.status, candidates.length]);

  // Auto-add qualifying candidates to CRM when run finishes
  useEffect(() => {
    if (!run || run.status !== 'done' && run.status !== 'stopped') return;
    if (autoAddedRef.current || bulkAdding) return;
    const qualifying = candidates.filter(c =>
      (c.outcome === 'no_website_phone' || c.outcome === 'no_website_no_phone' || c.outcome === 'no_website') && !addedIds.has(c.id)
    );
    if (qualifying.length === 0) return;
    autoAddedRef.current = true;
    (async () => {
      setBulkAdding(true);
      let added = 0;
      for (const c of qualifying) {
        try {
          const leadData = {
            place_id: c.place_id, maps_url: c.maps_url, name: c.name,
            category: c.category, niche_label: c.category?.split(',')[0]?.trim() || null,
            rating: c.rating, reviews_count: c.reviews_count,
            phone: c.phone, email: c.email || null, address: c.address, website: c.website,
            status: 'not_contacted' as const,
            call_outcome_last: null, next_action_at: null, notes: null, tags: [],
          };
          const section = determineSection(leadData);
          const { lead, duplicate, error } = await addLead({ ...leadData, section });
          if (!duplicate && !error) {
            setAddedIds(s => new Set(s).add(c.id));
            added++;
          }
        } catch {}
      }
      refreshCounts();
      setBulkAdding(false);
      if (added > 0) toast.success(`Auto-added ${added} leads to CRM`);
    })();
  }, [run?.status, candidates.length]);

  const handleStop = async () => {
    if (!id) return;
    await stopFinderRun(id);
    toast.info('Stopping run…');
    setTimeout(load, 1000);
  };

  const handleRefetch = async () => {
    if (!id) return;
    setRefetching(true);
    try {
      toast.info('Re-fetching failed candidates… this may take a few minutes.');
      const result = await refetchFailedCandidates(id);
      toast.success(`Re-fetched ${result?.refetched || 0} candidates. Check updated tabs.`);
      await load();
    } catch (e: any) {
      toast.error(`Refetch failed: ${e.message}`);
    } finally {
      setRefetching(false);
    }
  };

  const handleResume = async () => {
    if (!id || resuming) return;
    setResuming(true);
    try {
      toast.info('Resuming detail fetching…');
      const result = await resumeFinderRun(id);
      if (result?.remaining > 0) {
        toast.info(`Fetched ${result.resumed} more details. ${result.remaining} still pending — resuming again…`);
        // Auto-resume again after a short delay
        setTimeout(() => handleResume(), 2000);
        await load();
        return;
      }
      toast.success(`Resume complete! Fetched ${result?.resumed || 0} details.`);
      await load();
    } catch (e: any) {
      toast.error(`Resume failed: ${e.message}`);
    } finally {
      setResuming(false);
    }
  };

  // Auto-resume stuck runs (status=running but no progress for 30s)
  useEffect(() => {
    if (!run || autoResumeRef.current || resuming) return;
    if (run.status !== 'running') return;
    // If the run has pending candidates and stats haven't updated (stuck), auto-resume
    const pendingCount = candidates.filter(c => c.outcome === 'pending').length;
    if (pendingCount === 0) return;
    
    // Check if stats are stale (updated_at hasn't changed in 30s)
    const updatedAt = new Date(run.updated_at).getTime();
    const staleSince = Date.now() - updatedAt;
    if (staleSince > 30000) {
      autoResumeRef.current = true;
      toast.info('Run appears stuck — auto-resuming…');
      handleResume();
    }
  }, [run?.status, run?.updated_at, candidates.length]);

  // Scrape emails from leads that have websites but no email
  const handleScrapeEmails = async () => {
    const { data: leads } = await supabase.from('leads').select('id, website, email').not('website', 'is', null);
    const leadsWithWebsite = (leads || []).filter(l => l.website && !l.email);
    if (leadsWithWebsite.length === 0) {
      toast.info('No leads with websites missing emails');
      return;
    }
    setScrapingEmails(true);
    setScrapeProgress({ done: 0, total: leadsWithWebsite.length, found: 0 });
    let totalFound = 0;
    for (let i = 0; i < leadsWithWebsite.length; i += 4) {
      const batch = leadsWithWebsite.slice(i, i + 4).map(l => ({ leadId: l.id, website: l.website! }));
      try {
        const { data, error } = await supabase.functions.invoke('scrape-emails', { body: { urls: batch } });
        if (!error && data?.results) {
          for (const r of data.results) {
            if (r.emails && r.emails.length > 0) {
              const email = r.emails[0];
              const { data: lead } = await supabase.from('leads').select('phone, email').eq('id', r.leadId).single();
              const newSection = determineSection({ ...lead, email } as any);
              await supabase.from('leads').update({ email, section: newSection }).eq('id', r.leadId);
              totalFound++;
            }
          }
        }
      } catch (e) {
        console.error('Scrape batch error:', e);
      }
      setScrapeProgress({ done: Math.min(i + 4, leadsWithWebsite.length), total: leadsWithWebsite.length, found: totalFound });
    }
    setScrapingEmails(false);
    setScrapeProgress(null);
    refreshCounts();
    await createNotification({
      type: 'email_scrape_done',
      title: 'Finder email scrape finished',
      message: `Found ${totalFound} emails from ${leadsWithWebsite.length} lead websites.`,
      payload: { found: totalFound, checked: leadsWithWebsite.length, runId: id || '' },
    });
    if (totalFound > 0) toast.success(`Found ${totalFound} emails from websites!`);
    else toast.info('No emails found on any websites');
  };

  const addToCrm = async (candidate: FinderCandidate) => {
    setAddingIds(s => new Set(s).add(candidate.id));
    try {
      const { lead, duplicate, error } = await addLead({
        place_id: candidate.place_id,
        maps_url: candidate.maps_url,
        name: candidate.name,
        category: candidate.category,
        niche_label: candidate.category?.split(',')[0]?.trim() || null,
        rating: candidate.rating,
        reviews_count: candidate.reviews_count,
        phone: candidate.phone,
        email: candidate.email || null,
        address: candidate.address,
        website: candidate.website,
        section: 'unsorted',
        status: 'not_contacted',
        call_outcome_last: null,
        next_action_at: null,
        notes: null,
        tags: [],
      });
      if (duplicate) {
        toast.warning(`${candidate.name} already exists`);
      } else if (error) {
        toast.error(error);
      } else {
        setAddedIds(s => new Set(s).add(candidate.id));
        toast.success(`Added ${candidate.name}`);
        refreshCounts();
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddingIds(s => { const n = new Set(s); n.delete(candidate.id); return n; });
    }
  };

  const bulkAddNoWebsitePhone = async () => {
    const targets = filtered.filter(c => !addedIds.has(c.id));
    if (targets.length === 0) return;
    setBulkAdding(true);
    let added = 0;
    for (const c of targets) {
      try {
        const { lead, duplicate, error } = await addLead({
          place_id: c.place_id, maps_url: c.maps_url, name: c.name,
          category: c.category, niche_label: c.category?.split(',')[0]?.trim() || null,
          rating: c.rating, reviews_count: c.reviews_count,
          phone: c.phone, email: c.email || null, address: c.address, website: c.website,
          section: 'unsorted', status: 'not_contacted',
          call_outcome_last: null, next_action_at: null, notes: null, tags: [],
        });
        if (!duplicate && !error) {
          setAddedIds(s => new Set(s).add(c.id));
          added++;
        }
      } catch {}
    }
    refreshCounts();
    setBulkAdding(false);
    toast.success(`Added ${added} leads to CRM`);
  };

  const exportCsv = () => {
    const csv = candidatesToCsv(filtered);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finder-${run?.city}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Updated filters matching new outcome values
  const noWebsitePhone = candidates.filter(c => 
    c.outcome === 'no_website_phone' || (c.outcome === 'no_website' && c.has_phone === true)
  );
  const noWebsiteNoPhone = candidates.filter(c => 
    c.outcome === 'no_website_no_phone' || (c.outcome === 'no_website' && c.has_phone === false)
  );
  const unfetched = candidates.filter(c => c.outcome === 'pending' || (!c.last_fetched_at && c.outcome !== 'duplicate'));
  const duplicates = candidates.filter(c => c.outcome === 'duplicate');
  const other = candidates.filter(c => 
    c.outcome === 'skipped' || c.outcome === 'failed' || c.outcome === 'has_website'
  );

  const filtered = tab === 'no_website_phone' ? noWebsitePhone
    : tab === 'no_website_no_phone' ? noWebsiteNoPhone
    : tab === 'unfetched' ? unfetched
    : tab === 'duplicates' ? duplicates
    : tab === 'skipped' ? other
    : candidates;

  const tabs: { key: Tab; label: string; count: number; color?: string; tip: string }[] = [
    { key: 'no_website_phone', label: 'No Website + Phone', count: noWebsitePhone.length, color: 'text-green', tip: 'Businesses without a real website but WITH a phone number. Best leads for cold outreach.' },
    { key: 'no_website_no_phone', label: 'No Website Only', count: noWebsiteNoPhone.length, tip: 'Businesses without a website and no phone listed.' },
    { key: 'unfetched', label: 'Unfetched', count: unfetched.length, color: 'text-amber', tip: 'Candidates whose details have not been fetched yet.' },
    { key: 'duplicates', label: 'In CRM', count: duplicates.length, tip: 'Already in your CRM.' },
    { key: 'skipped', label: 'Other', count: other.length, tip: 'Has a real website, skipped, or failed to fetch details.' },
    { key: 'all', label: 'All', count: candidates.length, tip: 'All candidates from this run.' },
  ];

  // Diagnostics: sample 5 candidates with details fetched
  const diagSample = candidates
    .filter(c => c.last_fetched_at)
    .slice(0, 5);

  // Live progress
  const totalFound = candidates.length;
  const detailsFetched = candidates.filter(c => c.last_fetched_at).length;
  const pendingCount = candidates.filter(c => c.outcome === 'pending').length;

  if (loading) {
    return <AppLayout><div className="flex items-center justify-center pt-20"><Loader2 className="animate-spin text-primary" size={24} /></div></AppLayout>;
  }

  if (!run) {
    return <AppLayout><div className="text-center pt-20 text-muted-foreground">Run not found</div></AppLayout>;
  }

  const isAddable = (c: FinderCandidate) => 
    (c.outcome === 'no_website_phone' || c.outcome === 'no_website_no_phone' || c.outcome === 'no_website') && !addedIds.has(c.id);

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 pb-10">
        {/* Header */}
        <div className="flex items-start gap-3 mb-5">
          <Link to="/finder" className="mt-1">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><ArrowLeft size={14} /></Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-foreground truncate flex items-center gap-1.5">
              {run.city} — Finder Run
              <InfoTip text="Results organized by outcome. Social media profiles (Facebook, Instagram, TikTok) are NOT counted as real websites." />
            </h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
              {run.status === 'running' && <span className="flex items-center gap-1 text-primary"><Loader2 size={11} className="animate-spin" /> Running…</span>}
              {run.status === 'done' && <span className="flex items-center gap-1 text-green-400"><CheckCircle size={11} /> Done</span>}
              {run.status === 'stopped' && <span className="flex items-center gap-1 text-amber-400"><Square size={11} /> Stopped</span>}
              {run.status === 'failed' && <span className="flex items-center gap-1 text-red-400"><XCircle size={11} /> Failed</span>}
              <span>·</span>
              <span>{(run.keywords || []).length} keywords</span>
              <span>·</span>
              <span>{totalFound} found</span>
              <span>·</span>
              <span>{detailsFetched} details</span>
              {pendingCount > 0 && <><span>·</span><span className="text-amber-400">{pendingCount} pending</span></>}
            </div>
          </div>
          {(run.status === 'running' || run.status === 'pending') && !resuming && (
            <Button variant="destructive" size="sm" onClick={handleStop} className="gap-1.5 shrink-0">
              <Square size={12} /> Stop
            </Button>
          )}
          {resuming && (
            <Button variant="outline" size="sm" disabled className="gap-1.5 shrink-0">
              <Loader2 size={12} className="animate-spin" /> Resuming…
            </Button>
          )}
          {(run.status === 'running' || run.status === 'done' || run.status === 'stopped') && pendingCount > 0 && !resuming && (
            <Button variant="default" size="sm" onClick={handleResume} className="gap-1.5 shrink-0">
              <Play size={12} /> Resume ({pendingCount})
            </Button>
          )}
          {run.status === 'done' && candidates.some(c => c.outcome === 'failed') && (
            <Button variant="outline" size="sm" onClick={handleRefetch} disabled={refetching} className="gap-1.5 shrink-0">
              {refetching ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Re-fetch Failed ({candidates.filter(c => c.outcome === 'failed').length})
            </Button>
          )}
        </div>

        {/* Live progress bar */}
        {(run.status === 'running' || run.status === 'pending') && run.stats?.detailsFetched != null && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Details: {run.stats.detailsFetched || 0}</span>
              <span>Stage: {run.stats.stage || 'starting'}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, ((run.stats.detailsFetched || 0) / (run.max_details || 100)) * 100)}%` }} />
            </div>
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

        {/* Diagnostics panel */}
        <button
          onClick={() => setShowDiag(!showDiag)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors"
        >
          <Bug size={12} />
          Diagnostics
          {showDiag ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {showDiag && (
          <div className="mb-4 p-3 bg-muted/50 border border-border rounded-lg text-xs space-y-2">
            <div className="font-medium text-foreground">Sample raw fields (5 fetched candidates):</div>
            {diagSample.length === 0 ? (
              <div className="text-muted-foreground">No detail-fetched candidates yet.</div>
            ) : (
              <div className="space-y-1.5">
                {diagSample.map(c => (
                  <div key={c.id} className="p-2 bg-card rounded border border-border">
                    <div className="font-medium text-foreground">{c.name}</div>
                    <div className="text-muted-foreground space-y-0.5 mt-1">
                      <div>website: <code className="text-foreground">{c.website || 'null'}</code></div>
                      <div>phone: <code className="text-foreground">{c.phone || 'null'}</code></div>
                      <div>hasWebsite: <code className={c.has_website ? 'text-green-400' : 'text-red-400'}>{String(c.has_website)}</code></div>
                      <div>hasPhone: <code className={c.has_phone ? 'text-green-400' : 'text-red-400'}>{String(c.has_phone)}</code></div>
                      <div>outcome: <code className="text-primary">{c.outcome}</code></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Email scraping */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <Button size="sm" variant="outline" onClick={handleScrapeEmails} disabled={scrapingEmails} className="gap-1.5">
            {scrapingEmails ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            {scrapingEmails ? `Scraping emails… ${scrapeProgress?.found || 0} found` : 'Scrape Emails from Websites'}
          </Button>
          {scrapeProgress && (
            <span className="text-xs text-muted-foreground self-center">
              {scrapeProgress.done}/{scrapeProgress.total} checked
            </span>
          )}
        </div>

        {/* Actions */}
        {tab === 'no_website_phone' && noWebsitePhone.length > 0 && (
          <div className="flex gap-2 mb-4 flex-wrap">
            <Button size="sm" onClick={bulkAddNoWebsitePhone} disabled={bulkAdding} className="gap-1.5">
              {bulkAdding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Add All to CRM ({noWebsitePhone.filter(c => !addedIds.has(c.id)).length})
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv} className="gap-1.5">
              <Download size={12} /> Export CSV
            </Button>
          </div>
        )}

        {tab !== 'no_website_phone' && filtered.length > 0 && (
          <div className="flex gap-2 mb-4">
            <Button size="sm" variant="outline" onClick={exportCsv} className="gap-1.5">
              <Download size={12} /> Export CSV
            </Button>
          </div>
        )}

        {/* Results */}
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {run.status === 'running' ? 'Searching… results will appear here.' : 'No results in this category.'}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(c => (
              <div key={c.id} className="p-3 bg-card border border-border rounded-lg flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-foreground truncate">{c.name}</div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                    {c.rating && <span className="flex items-center gap-0.5"><Star size={10} className="text-amber-400" /> {c.rating}</span>}
                    {c.reviews_count != null && <span>{c.reviews_count} reviews</span>}
                    {c.category && <span className="truncate max-w-[150px]">{c.category}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs flex-wrap">
                    {c.phone && <span className="text-green-400 flex items-center gap-0.5"><Phone size={10} /> {c.phone}</span>}
                    {c.email && <span className="text-blue-400 flex items-center gap-0.5"><Mail size={10} /> {c.email}</span>}
                    {c.has_website === false && <span className="text-red-400 flex items-center gap-0.5"><Globe size={10} /> No website</span>}
                    {c.has_website === true && <span className="text-muted-foreground flex items-center gap-0.5"><Globe size={10} /> Has website</span>}
                    {c.website && c.has_website === false && (
                      <span className="text-amber-400 text-[10px]">(social: {c.website.replace(/https?:\/\/(www\.)?/, '').split('/')[0]})</span>
                    )}
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
                    <Button
                      size="sm"
                      onClick={() => addToCrm(c)}
                      disabled={addingIds.has(c.id)}
                      className="h-7 px-2 text-xs gap-1"
                    >
                      {addingIds.has(c.id) ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                      Add
                    </Button>
                  )}
                  {addedIds.has(c.id) && (
                    <span className="text-xs text-green-400 flex items-center gap-0.5"><CheckCircle size={10} /> Added</span>
                  )}
                  {c.outcome === 'duplicate' && (
                    <span className="text-xs text-amber-400">In CRM</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
