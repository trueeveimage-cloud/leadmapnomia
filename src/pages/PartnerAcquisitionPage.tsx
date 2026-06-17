import { useEffect, useMemo, useState, type ReactNode } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { COUNTRY_LABELS, Country, getCitiesByCountry } from '@/lib/cities';
import { createFinderRun, fetchFinderCandidates, FinderCandidate, runFinderSearch } from '@/lib/finder';
import {
  buildPartnerEmail,
  fetchPartnerLogs,
  fetchPartnerProspects,
  partnerWebsiteHref,
  partnerTypeLabel,
  PARTNER_SEARCH_PRESETS,
  PARTNER_STATUSES,
  PartnerProspect,
  PartnerOutreachLog,
  PartnerStatus,
  PartnerType,
  savePartnerCandidates,
  updatePartnerProspect,
} from '@/lib/partners';
import {
  BriefcaseBusiness,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

const COUNTRIES: Country[] = ['SE', 'NO', 'DK', 'UK', 'ES'];
const PARTNER_BATCH_LIMIT = 100;
const PARTNER_BATCH_DELAY_MS = 2000;

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function statusTone(status: PartnerStatus) {
  if (['qualified', 'partner_call_booked'].includes(status)) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
  if (['replied', 'contacted'].includes(status)) return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400';
  if (['not_fit', 'do_not_contact'].includes(status)) return 'border-red-500/30 bg-red-500/10 text-red-400';
  return 'border-border bg-muted text-muted-foreground';
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ');
}

export default function PartnerAcquisitionPage() {
  const [activeTab, setActiveTab] = useState<'search' | 'contact'>('search');
  const [country, setCountry] = useState<Country>('SE');
  const [city, setCity] = useState('Stockholm');
  const [selectedTypes, setSelectedTypes] = useState<PartnerType[]>(PARTNER_SEARCH_PRESETS.map(item => item.type));
  const [prospects, setProspects] = useState<PartnerProspect[]>([]);
  const [logs, setLogs] = useState<PartnerOutreachLog[]>([]);
  const [logCount, setLogCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [emailScraping, setEmailScraping] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [batchSending, setBatchSending] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    total: number;
    sent: number;
    skipped: number;
    failed: number;
    current?: string;
    error?: string;
  } | null>(null);
  const [query, setQuery] = useState('');
  const [activeStatus, setActiveStatus] = useState<'all' | PartnerStatus>('all');
  const [searchProgress, setSearchProgress] = useState<{
    step: string;
    detail: string;
    percent: number;
    runId?: string;
    error?: string;
  } | null>(null);

  const cities = useMemo(() => getCitiesByCountry(country).slice(0, 24), [country]);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [nextProspects, nextLogs] = await Promise.all([fetchPartnerProspects(), fetchPartnerLogs()]);
      setProspects(nextProspects);
      setLogs(nextLogs);
      setLogCount(nextLogs.filter(log => log.status === 'sent').length);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load partners';
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const first = getCitiesByCountry(country)[0]?.name;
    if (first) setCity(first);
  }, [country]);

  const metrics = useMemo(() => {
    const ready = prospects.filter(item => item.status === 'ready_to_contact').length;
    const contacted = prospects.filter(item => item.status === 'contacted').length;
    const replied = prospects.filter(item => item.status === 'replied').length;
    const calls = prospects.filter(item => item.status === 'partner_call_booked').length;
    const qualified = prospects.filter(item => item.status === 'qualified').length;
    return { ready, contacted, replied, calls, qualified };
  }, [prospects]);

  const sentPartnerIds = useMemo(() => new Set(
    logs
      .filter(log => log.status === 'sent' && log.partner_prospect_id)
      .map(log => log.partner_prospect_id as string),
  ), [logs]);

  const sentPartnerEmails = useMemo(() => new Set(
    logs
      .filter(log => log.status === 'sent' && log.to_email)
      .map(log => String(log.to_email).trim().toLowerCase()),
  ), [logs]);

  const contactablePartners = useMemo(() => prospects
    .filter(prospect => {
      const email = String(prospect.email || '').trim().toLowerCase();
      if (!email || prospect.do_not_contact) return false;
      if (['contacted', 'replied', 'partner_call_booked', 'qualified', 'not_fit', 'do_not_contact'].includes(prospect.status)) return false;
      if (sentPartnerIds.has(prospect.id) || sentPartnerEmails.has(email)) return false;
      return true;
    })
    .sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0)), [prospects, sentPartnerEmails, sentPartnerIds]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return prospects.filter(item => {
      if (activeStatus !== 'all' && item.status !== activeStatus) return false;
      if (!needle) return true;
      return [item.name, item.email, item.website, item.city, item.country, item.partner_type, item.fit_reason]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [activeStatus, prospects, query]);

  const toggleType = (type: PartnerType) => {
    setSelectedTypes(prev => prev.includes(type) ? prev.filter(item => item !== type) : [...prev, type]);
  };

  const runPartnerFinder = async () => {
    const targets = PARTNER_SEARCH_PRESETS.filter(item => selectedTypes.includes(item.type));
    if (!targets.length) {
      toast.error('Choose at least one partner type');
      return;
    }
    setRunning(true);
    setSearchProgress({
      step: 'Preparing partner search',
      detail: `${targets.length} partner types selected in ${city}, ${COUNTRY_LABELS[country]}.`,
      percent: 8,
    });
    try {
      const keywords = unique(targets.flatMap(item => item.keywords[country] || item.keywords.SE)).slice(0, 18);
      setSearchProgress({
        step: 'Creating finder run',
        detail: `${keywords.length} search phrases ready. Saving run before calling Maps.`,
        percent: 16,
      });
      const run = await createFinderRun({
        city,
        mode: 'partner_acquisition',
        keywords,
        radius: 7000,
        maxPages: 2,
        maxCandidates: 260,
        maxDetails: 120,
        minRating: 3,
        minReviews: 0,
        requirePhone: false,
        batchLabel: `Partner Finder - ${COUNTRY_LABELS[country]} - ${city}`,
      });
      setSearchProgress({
        step: 'Searching Google Maps',
        detail: 'Fetching partner companies and place details. This can take 1-3 minutes on larger searches.',
        percent: 34,
        runId: run.id,
      });
      await runFinderSearch(run.id, {
        city,
        keywords,
        radius: 7000,
        maxPages: 2,
        maxCandidates: 260,
        maxDetails: 120,
        minRating: 3,
        minReviews: 0,
        requirePhone: false,
      });
      setSearchProgress({
        step: 'Loading candidates',
        detail: 'Maps search finished. Reading candidate companies from the finder run.',
        percent: 58,
        runId: run.id,
      });
      let candidates = await fetchFinderCandidates(run.id);
      setSearchProgress({
        step: 'Saving partner prospects',
        detail: `${candidates.length} candidates found. Saving names, websites, phone numbers and partner types.`,
        percent: 70,
        runId: run.id,
      });
      const firstPass = await savePartnerCandidates(candidates, { city, country });
      setSearchProgress({
        step: 'Finding public emails',
        detail: 'Checking saved partner websites for public business emails in small batches.',
        percent: 82,
        runId: run.id,
      });
      candidates = await scrapePartnerEmails(candidates);
      setSearchProgress({
        step: 'Final enrichment save',
        detail: 'Saving discovered emails and moving reachable partners into the contact queue.',
        percent: 92,
        runId: run.id,
      });
      const secondPass = await savePartnerCandidates(candidates, { city, country });
      const totalCreated = firstPass.saved + secondPass.saved;
      const totalUpdated = firstPass.updated + secondPass.updated;
      setSearchProgress({
        step: 'Partner search complete',
        detail: `Saved ${totalCreated} new partners and updated ${totalUpdated}.`,
        percent: 100,
        runId: run.id,
      });
      toast.success(`Saved ${totalCreated} new partners and updated ${totalUpdated} existing prospects`);
      setActiveTab('contact');
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Partner Finder failed';
      setSearchProgress(prev => ({
        step: 'Partner search stopped',
        detail: message,
        percent: prev?.percent || 0,
        runId: prev?.runId,
        error: message,
      }));
      toast.error(message);
    } finally {
      setRunning(false);
    }
  };

  const scrapePartnerEmails = async (candidates: FinderCandidate[]) => {
    const targets = candidates.filter(candidate => candidate.website && !candidate.email);
    let found = 0;
    for (let i = 0; i < targets.length; i += 4) {
      const slice = targets.slice(i, i + 4);
      setSearchProgress(prev => prev ? {
        ...prev,
        step: 'Finding public emails',
        detail: `Checked ${Math.min(i, targets.length)} of ${targets.length} partner websites. Found ${found} email${found === 1 ? '' : 's'} so far.`,
        percent: Math.min(88, 82 + Math.round((i / Math.max(1, targets.length)) * 6)),
      } : prev);
      const { data, error } = await supabase.functions.invoke('scrape-emails', {
        body: {
          urls: slice.map(candidate => ({
            leadId: candidate.id,
            website: candidate.website,
            businessName: candidate.name,
          })),
        },
      });
      if (error) throw error;
      for (const result of data?.results || []) {
        const email = result?.email || result?.emails?.[0];
        if (!email) continue;
        const candidate = candidates.find(item => item.id === result.leadId);
        if (!candidate) continue;
        candidate.email = email;
        found += 1;
        await supabase.from('finder_candidates').update({ email } as never).eq('id', candidate.id);
      }
    }
    return candidates;
  };

  const scrapeSavedPartnerEmails = async () => {
    const targets = visible.filter(prospect => prospect.website && !prospect.email).slice(0, 24);
    if (!targets.length) {
      toast.message('No saved partner websites need email scraping');
      return;
    }
    setEmailScraping(true);
    try {
      let found = 0;
      for (let i = 0; i < targets.length; i += 4) {
        const slice = targets.slice(i, i + 4);
        const { data, error } = await supabase.functions.invoke('scrape-emails', {
          body: {
            urls: slice.map(prospect => ({
              leadId: prospect.id,
              website: prospect.website,
              businessName: prospect.name,
            })),
          },
        });
        if (error) throw error;
        for (const result of data?.results || []) {
          const email = result?.email || result?.emails?.[0];
          if (!email) continue;
          found += 1;
          await updatePartnerProspect(result.leadId, {
            email,
            status: 'ready_to_contact',
          });
        }
      }
      toast.success(found ? `Found ${found} new partner email${found === 1 ? '' : 's'}` : 'No public partner emails found');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Partner email scrape failed');
    } finally {
      setEmailScraping(false);
    }
  };

  const sendPartnerEmailRequest = async (prospect: PartnerProspect, skipCooldown = true) => {
    const email = buildPartnerEmail(prospect);
    const { data, error } = await supabase.functions.invoke('send-gmail', {
      body: {
        partnerProspectId: prospect.id,
        to: prospect.email,
        subject: email.subject,
        body: email.body,
        skipCooldown,
      },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message || 'Send failed');
    return data;
  };

  const sendPartnerEmail = async (prospect: PartnerProspect) => {
    if (!prospect.email) {
      toast.error('This partner has no email yet');
      return;
    }
    setSendingId(prospect.id);
    try {
      const data = await sendPartnerEmailRequest(prospect, true);
      toast.success(data?.skipped ? `Partner email skipped: ${data.reason || 'not eligible'}` : 'Partner email sent');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Partner email failed');
    } finally {
      setSendingId(null);
    }
  };

  const sendPartnerBatch = async () => {
    const batch = contactablePartners.slice(0, PARTNER_BATCH_LIMIT);
    if (!batch.length) {
      toast.message('No ready partners with unsent emails');
      return;
    }
    const confirmed = window.confirm(`Send partner outreach to ${batch.length} ready partners now? This skips already-contacted, do-not-contact and duplicate email records.`);
    if (!confirmed) return;
    setBatchSending(true);
    setBatchProgress({ total: batch.length, sent: 0, skipped: 0, failed: 0 });
    try {
      for (let i = 0; i < batch.length; i += 1) {
        const prospect = batch[i];
        setBatchProgress(prev => prev ? { ...prev, current: prospect.name } : prev);
        try {
          const data = await sendPartnerEmailRequest(prospect, true);
          setBatchProgress(prev => prev ? {
            ...prev,
            sent: prev.sent + (data?.skipped ? 0 : 1),
            skipped: prev.skipped + (data?.skipped ? 1 : 0),
          } : prev);
        } catch (error) {
          setBatchProgress(prev => prev ? {
            ...prev,
            failed: prev.failed + 1,
            error: error instanceof Error ? error.message : 'Partner email failed',
          } : prev);
        }
        if (i < batch.length - 1) await sleep(PARTNER_BATCH_DELAY_MS);
      }
      toast.success('Partner batch finished');
      await load();
    } finally {
      setBatchSending(false);
      setBatchProgress(prev => prev ? { ...prev, current: undefined } : prev);
    }
  };

  const setStatus = async (prospect: PartnerProspect, status: PartnerStatus) => {
    try {
      await updatePartnerProspect(prospect.id, {
        status,
        do_not_contact: status === 'do_not_contact',
      });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update partner');
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Leadmap growth</div>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-foreground">
              <BriefcaseBusiness size={22} className="text-primary" /> Partner Acquisition
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Find telecom, PBX, agency, installer and consultant partners without mixing them into normal customer outreach.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
        </div>

        <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Metric icon={<Users size={15} />} label="Prospects" value={prospects.length} />
          <Metric icon={<Mail size={15} />} label="Ready" value={metrics.ready} />
          <Metric icon={<Send size={15} />} label="Contactable" value={contactablePartners.length} />
          <Metric icon={<Send size={15} />} label="Sent" value={logCount} />
          <Metric icon={<Mail size={15} />} label="Replied" value={metrics.replied} tone="good" />
          <Metric icon={<CheckCircle2 size={15} />} label="Partner calls" value={metrics.calls} tone="good" />
          <Metric icon={<ShieldCheck size={15} />} label="Qualified" value={metrics.qualified} tone="good" />
        </section>

        <section className="mb-5 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('search')}
              className={cn(
                'rounded-full border px-4 py-2 text-sm transition-colors',
                activeTab === 'search'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              Search partners
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('contact')}
              className={cn(
                'rounded-full border px-4 py-2 text-sm transition-colors',
                activeTab === 'contact'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              Contact partners
            </button>
          </div>

          {activeTab === 'search' ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
              <div>
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                  <Search size={16} className="text-primary" /> Search for partner prospects
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-muted-foreground">
                    Country
                    <select
                      value={country}
                      onChange={event => setCountry(event.target.value as Country)}
                      className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    >
                      {COUNTRIES.map(item => <option key={item} value={item}>{COUNTRY_LABELS[item]}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    City
                    <select
                      value={city}
                      onChange={event => setCity(event.target.value)}
                      className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    >
                      {cities.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
                    </select>
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {PARTNER_SEARCH_PRESETS.map(item => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => toggleType(item.type)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs transition-colors',
                        selectedTypes.includes(item.type)
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={runPartnerFinder} disabled={running} className="gap-2">
                    {running ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    {running ? 'Searching partners...' : 'Run partner search'}
                  </Button>
                  <Button variant="outline" onClick={scrapeSavedPartnerEmails} disabled={emailScraping} className="gap-2">
                    {emailScraping ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                    {emailScraping ? 'Finding emails...' : 'Find emails for saved partners'}
                  </Button>
                </div>
                {searchProgress && (
                  <div className={cn(
                    'mt-4 rounded-md border p-4',
                    searchProgress.error
                      ? 'border-red-500/30 bg-red-500/10'
                      : searchProgress.percent >= 100
                        ? 'border-emerald-500/30 bg-emerald-500/10'
                        : 'border-border bg-background/50',
                  )}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-foreground">{searchProgress.step}</div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{searchProgress.detail}</p>
                        {searchProgress.runId && (
                          <a
                            href={`/finder/runs/${searchProgress.runId}`}
                            className="mt-2 inline-flex text-xs font-medium text-primary hover:underline"
                          >
                            Open finder run history
                          </a>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-foreground">{searchProgress.percent}%</div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          searchProgress.error ? 'bg-red-500' : 'bg-primary',
                        )}
                        style={{ width: `${Math.max(4, searchProgress.percent)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded-md border border-border bg-background/40 p-4">
                <div className="text-sm font-medium text-foreground">What this search saves</div>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                  <div className="rounded-md border border-border bg-card/60 px-3 py-2">Company name, website, phone, city, country and partner type</div>
                  <div className="rounded-md border border-border bg-card/60 px-3 py-2">Emails get scraped after the search and moved into the contact queue</div>
                  <div className="rounded-md border border-border bg-card/60 px-3 py-2">Saved prospects stay separate from customer leads, AI calls and Gmail rotation</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_300px]">
              <div className="rounded-md border border-border bg-background/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">Contact partners</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {contactablePartners.length} ready partner{contactablePartners.length === 1 ? '' : 's'} can be contacted now. Already-sent emails and do-not-contact records are skipped.
                    </p>
                  </div>
                  <Button onClick={sendPartnerBatch} disabled={batchSending || contactablePartners.length === 0} className="gap-2">
                    {batchSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Contact up to 100
                  </Button>
                </div>
                {batchProgress && (
                  <div className="mt-4 rounded-md border border-border bg-card/70 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-foreground">
                        Batch progress: {batchProgress.sent + batchProgress.skipped + batchProgress.failed}/{batchProgress.total}
                      </span>
                      <span className="text-muted-foreground">
                        Sent {batchProgress.sent} / Skipped {batchProgress.skipped} / Failed {batchProgress.failed}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.round(((batchProgress.sent + batchProgress.skipped + batchProgress.failed) / Math.max(1, batchProgress.total)) * 100)}%` }}
                      />
                    </div>
                    {batchProgress.current && <div className="mt-2 text-xs text-muted-foreground">Sending: {batchProgress.current}</div>}
                    {batchProgress.error && <div className="mt-2 text-xs text-red-400">Last error: {batchProgress.error}</div>}
                  </div>
                )}
                <div className="mt-5 text-sm font-medium text-foreground">Partner pitch default</div>
                <Textarea
                  readOnly
                  value={buildPartnerEmail({
                    id: 'preview',
                    name: 'Partner Company',
                    website: null,
                    email: null,
                    phone: null,
                    country,
                    city,
                    address: null,
                    partner_type: 'telecom',
                    status: 'ready_to_contact',
                    fit_score: 70,
                    fit_reason: null,
                    source_url: null,
                    source: 'preview',
                    notes: null,
                    do_not_contact: false,
                    last_contacted_at: null,
                    last_reply_at: null,
                    created_at: '',
                    updated_at: '',
                  }).body}
                  className="mt-3 min-h-48 resize-none font-mono text-xs"
                />
              </div>
              <div className="rounded-md border border-border bg-background/40 p-4">
                <div className="text-sm font-medium text-foreground">Recent partner outreach</div>
                <div className="mt-3 space-y-2">
                  {logs.slice(0, 6).map(log => (
                    <div key={log.id} className="rounded-md border border-border bg-card/60 px-3 py-2">
                      <div className="text-xs font-medium text-foreground">{log.subject || log.status}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {log.to_email || 'No recipient'} • {new Date(log.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                  {!logs.length && <div className="text-xs text-muted-foreground">No partner messages logged yet.</div>}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-semibold text-foreground">{activeTab === 'search' ? 'Saved partner prospects' : 'Partner pipeline'}</h2>
                <p className="text-sm text-muted-foreground">
                  {activeTab === 'search'
                    ? 'Freshly found prospects land here after each run, before you move them into outreach.'
                    : 'Separate from customer leads, AI calls and normal Gmail automation.'}
                </p>
              </div>
              <Input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search partners..."
                className="max-w-sm"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(['all', ...PARTNER_STATUSES] as const).map(status => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setActiveStatus(status)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs transition-colors',
                    activeStatus === status
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground',
                  )}
                >
                  {status === 'all' ? 'All' : statusLabel(status)}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Loading partners...</div>
          ) : loadError ? (
            <div className="px-6 py-16 text-center">
              <p className="text-sm font-medium text-red-400">Failed to load partners</p>
              <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
              <Button className="mt-4" variant="outline" size="sm" onClick={load}>Try again</Button>
            </div>
          ) : visible.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <BriefcaseBusiness size={34} className="mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">No partner prospects in this view</p>
              <p className="mt-1 text-xs text-muted-foreground">Run a partner search or change filters.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(activeTab === 'search' ? visible.slice(0, 12) : visible).map(prospect => (
                <div key={prospect.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_220px_210px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate font-semibold text-foreground">{prospect.name}</div>
                      <Badge variant="outline">{partnerTypeLabel(prospect.partner_type)}</Badge>
                      <span className={cn('rounded-full border px-2 py-0.5 text-xs capitalize', statusTone(prospect.status))}>
                        {statusLabel(prospect.status)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {prospect.email && <span>{prospect.email}</span>}
                      {prospect.phone && <span>{prospect.phone}</span>}
                      {prospect.city && <span>{prospect.city}</span>}
                      {prospect.country && <span>{prospect.country}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {prospect.website && (
                        <a href={partnerWebsiteHref(prospect.website) || '#'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                          Website <ExternalLink size={11} />
                        </a>
                      )}
                      {prospect.source_url && (
                        <a href={prospect.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                          Source <ExternalLink size={11} />
                        </a>
                      )}
                      <span className="text-muted-foreground">Score {prospect.fit_score}</span>
                    </div>
                    {prospect.fit_reason && <p className="mt-2 text-sm text-muted-foreground">{prospect.fit_reason}</p>}
                  </div>
                  <div>
                    <select
                      value={prospect.status}
                      onChange={event => setStatus(prospect, event.target.value as PartnerStatus)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    >
                      {PARTNER_STATUSES.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}
                    </select>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Last contact: {prospect.last_contacted_at ? new Date(prospect.last_contacted_at).toLocaleString() : 'Never'}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {activeTab === 'contact' ? (
                      <>
                        <Button
                          size="sm"
                          className="gap-2"
                          disabled={!prospect.email || sendingId === prospect.id || prospect.do_not_contact}
                          onClick={() => sendPartnerEmail(prospect)}
                        >
                          {sendingId === prospect.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                          Send partner email
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setStatus(prospect, 'partner_call_booked')}
                        >
                          Mark call booked
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={activeTab !== 'search'}
                        onClick={() => setActiveTab('contact')}
                      >
                        Move to contact tab
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}

function Metric({ icon, label, value, tone = 'normal' }: { icon: ReactNode; label: string; value: ReactNode; tone?: 'normal' | 'good' }) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <div className={cn('mt-1 text-2xl font-semibold text-foreground', tone === 'good' && 'text-emerald-400')}>{value}</div>
    </div>
  );
}
