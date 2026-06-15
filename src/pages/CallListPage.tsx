import React, { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Lead } from '@/lib/supabase';
import { AlertCircle, Bot, CheckCircle2, Clock, FileText, Phone, RefreshCw, Search, SlidersHorizontal, Target, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const statusTone: Record<string, string> = {
  Calling: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  Answered: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',
  'Demo requested': 'border-green-500/30 bg-green-500/10 text-green-400',
  'Meeting requested': 'border-green-500/30 bg-green-500/10 text-green-400',
  Interested: 'border-green-500/30 bg-green-500/10 text-green-400',
  'No answer': 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  'Not interested': 'border-red-500/30 bg-red-500/10 text-red-400',
  'Do not contact': 'border-red-500/30 bg-red-500/10 text-red-400',
  Error: 'border-red-500/30 bg-red-500/10 text-red-400',
};

const statusGroups = [
  { key: 'all', label: 'All' },
  { key: 'demo', label: 'Demo / meeting' },
  { key: 'interested', label: 'Interested' },
  { key: 'answered', label: 'Answered review' },
  { key: 'not_interested', label: 'Not interested' },
  { key: 'do_not_contact', label: 'Do not contact' },
  { key: 'no_answer', label: 'No answer' },
  { key: 'error', label: 'Failed / error' },
  { key: 'active', label: 'Active now' },
  { key: 'summary', label: 'Has summary' },
] as const;

type StatusGroup = typeof statusGroups[number]['key'];
type SortMode = 'newest' | 'oldest' | 'status' | 'attempts';

function dateLabel(value?: string | null) {
  if (!value) return 'Not called yet';
  return format(new Date(value), 'MMM d, yyyy h:mma');
}

function hasAiCallResult(lead: Lead) {
  return (
    !!(lead.retell_call_id || lead.last_called_at || lead.last_call_attempt_at || lead.call_summary || lead.call_transcript)
    || (!!lead.call_status && lead.call_status !== 'New')
  );
}

function normalizedStatus(lead: Lead) {
  return String(lead.call_status || 'New').trim();
}

function statusBucket(lead: Lead): StatusGroup {
  const status = normalizedStatus(lead).toLowerCase();
  const leadStatus = String(lead.status || '').toLowerCase();
  if (status.includes('do not contact') || lead.outreach_state === 'do_not_contact' || lead.do_not_contact) return 'do_not_contact';
  if (status.includes('not interested') || leadStatus === 'not_interested') return 'not_interested';
  if (status.includes('demo') || status.includes('meeting')) return 'demo';
  if (leadStatus === 'demo' || leadStatus === 'making_demo') return 'demo';
  if (status.includes('interested') || leadStatus === 'interested' || leadStatus === 'callback') return 'interested';
  if (status.includes('answered') || leadStatus === 'answered') return 'answered';
  if (status.includes('no answer') || status.includes('voicemail') || status.includes('busy')) return 'no_answer';
  if (status.includes('error') || status.includes('failed')) return 'error';
  if (status.includes('calling')) return 'active';
  if (lead.call_summary) return 'summary';
  return 'answered';
}

function statusGroupLabel(key: StatusGroup) {
  return statusGroups.find(group => group.key === key)?.label || 'Other';
}

function sortTime(lead: Lead) {
  return new Date(lead.last_called_at || lead.last_contacted_at || lead.updated_at || lead.created_at || 0).getTime();
}

export default function CallListPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusGroup>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const totalWithSummary = leads.filter((lead) => !!lead.call_summary).length;
  const totalInterested = leads.filter((lead) => ['interested', 'demo'].includes(statusBucket(lead))).length;
  const totalNeedsReview = leads.filter((lead) => ['answered', 'summary'].includes(statusBucket(lead))).length;
  const totalNoAnswer = leads.filter((lead) => statusBucket(lead) === 'no_answer').length;
  const totalBadFit = leads.filter((lead) => ['not_interested', 'do_not_contact'].includes(statusBucket(lead))).length;

  const load = async () => {
    toast.dismiss();
    setLoadError(null);
    setLoading(true);

    try {
      const allLeads: Lead[] = [];
      const pageSize = 1000;
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from('leads')
          .select('*')
          .order('updated_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;

        allLeads.push(...(data as Lead[]));
        if (data.length < pageSize) break;
        from += pageSize;
      }

      const aiCallLeads = allLeads.filter(hasAiCallResult);
      aiCallLeads.sort((a, b) => {
        const aTime = new Date(a.last_called_at || a.updated_at || a.created_at).getTime();
        const bTime = new Date(b.last_called_at || b.updated_at || b.created_at).getTime();
        return bTime - aTime;
      });
      setLeads(aiCallLeads.slice(0, 200));
      setLastLoadedAt(new Date());
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load AI calls';
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
    if (!autoRefresh) return undefined;
    const intervalId = window.setInterval(load, 30_000);
    return () => window.clearInterval(intervalId);
  }, [autoRefresh]);

  const filteredLeads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = leads.filter((lead) => {
      if (statusFilter !== 'all' && statusBucket(lead) !== statusFilter) return false;
      if (!needle) return true;
      const haystack = [
        lead.name,
        lead.phone,
        lead.phone_e164,
        lead.call_status,
        lead.call_outcome,
        lead.call_summary,
        lead.demo_contact_value,
        lead.retell_call_id,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(needle);
    });

    rows.sort((a, b) => {
      if (sortMode === 'oldest') return sortTime(a) - sortTime(b);
      if (sortMode === 'attempts') return (b.call_attempts || 0) - (a.call_attempts || 0) || sortTime(b) - sortTime(a);
      if (sortMode === 'status') return normalizedStatus(a).localeCompare(normalizedStatus(b)) || sortTime(b) - sortTime(a);
      return sortTime(b) - sortTime(a);
    });
    return rows;
  }, [leads, query, sortMode, statusFilter]);

  const groupedLeads = useMemo(() => {
    const order: StatusGroup[] = ['demo', 'interested', 'answered', 'summary', 'active', 'no_answer', 'not_interested', 'do_not_contact', 'error'];
    const groups = new Map<StatusGroup, Lead[]>();
    for (const lead of filteredLeads) {
      const key = statusFilter === 'all' ? statusBucket(lead) : statusFilter;
      groups.set(key, [...(groups.get(key) || []), lead]);
    }
    return order
      .filter(key => groups.has(key))
      .map(key => ({ key, rows: groups.get(key) || [] }));
  }, [filteredLeads, statusFilter]);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-6 pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2">
            <Bot size={20} className="text-primary" />
            <h1 className="text-2xl font-bold text-foreground">AI Calls</h1>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{leads.length}</span>
          </div>
          <div className="flex items-center gap-2">
            {lastLoadedAt && <span className="hidden text-xs text-muted-foreground sm:inline">Updated {format(lastLoadedAt, 'h:mma')}</span>}
            <Button
              variant={autoRefresh ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAutoRefresh(value => !value)}
              className="gap-1.5"
            >
              <Clock size={13} /> Auto
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-5 mb-4">
          <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
            <div className="text-xs text-muted-foreground">AI calls</div>
            <div className="mt-1 text-2xl font-semibold text-foreground">{leads.length}</div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Target size={12} /> Interested/demo</div>
            <div className="mt-1 text-2xl font-semibold text-green-400">{totalInterested}</div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><CheckCircle2 size={12} /> Review answered</div>
            <div className="mt-1 text-2xl font-semibold text-foreground">{totalNeedsReview}</div>
            <div className="mt-1 text-xs text-muted-foreground">{totalWithSummary} with summaries</div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
            <div className="text-xs text-muted-foreground">No answer</div>
            <div className="mt-1 text-2xl font-semibold text-foreground">{totalNoAnswer}</div>
            <div className="mt-1 text-xs text-muted-foreground">Separated from connected calls</div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><XCircle size={12} /> Not a fit</div>
            <div className="mt-1 text-2xl font-semibold text-red-400">{totalBadFit}</div>
            <div className="mt-1 text-xs text-muted-foreground">Not interested / DNC</div>
          </div>
        </div>

        <div className="mb-6 rounded-md border border-border bg-card p-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
            <label className="relative block">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search business, phone, Retell id, summary..."
                className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
              />
            </label>
            <label className="relative block">
              <SlidersHorizontal size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="status">Status A-Z</option>
                <option value="attempts">Most attempts</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {statusGroups.map(group => {
              const count = group.key === 'all'
                ? leads.length
                : leads.filter(lead => statusBucket(lead) === group.key).length;
              return (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => setStatusFilter(group.key)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs transition-colors',
                    statusFilter === group.key
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground',
                  )}
                >
                  {group.label} <span className="ml-1 opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {loadError && (
          <div className="mb-6 rounded-md border border-red-500/30 bg-red-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="text-red-400 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-red-200">Could not load AI calls</div>
                <div className="mt-1 text-xs text-red-100/80">{loadError}</div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="rounded-md border border-border bg-muted/20 py-16 text-center">
            <RefreshCw size={22} className="mx-auto mb-3 animate-spin text-muted-foreground" />
            <div className="text-sm text-muted-foreground">Loading AI calls...</div>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/20 px-6 py-14 text-center">
            <Phone size={34} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No AI calls match this view</p>
            <p className="text-xs text-muted-foreground mt-1">Change the status filter or search term to widen the results.</p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              <Clock size={13} />
              Auto-refresh is optional on this page.
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedLeads.map(group => (
              <section key={group.key} className="rounded-md border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <h2 className="text-sm font-semibold text-foreground">{statusGroupLabel(group.key)}</h2>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{group.rows.length}</span>
                </div>
                <div className="divide-y divide-border">
                  {group.rows.map((lead) => {
                    const callStatus = lead.call_status || 'New';
                    const tone = statusTone[callStatus] || 'border-border bg-muted text-muted-foreground';
                    return (
                      <div key={lead.id} className="px-4 py-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-foreground truncate">{lead.name}</h3>
                            <span className={cn('text-xs px-2 py-0.5 rounded-full border', tone)}>{callStatus}</span>
                            {lead.call_outcome && <span className="text-xs text-muted-foreground">{lead.call_outcome}</span>}
                          </div>

                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {(lead.phone_e164 || lead.phone) && <span>{lead.phone_e164 || lead.phone}</span>}
                            {(lead.last_called_at || lead.last_contacted_at) && <span>{dateLabel(lead.last_called_at || lead.last_contacted_at)}</span>}
                            {lead.retell_call_id && <span className="font-mono truncate">Retell {lead.retell_call_id}</span>}
                          </div>

                          {lead.call_summary && (
                            <p className="mt-3 text-sm text-foreground whitespace-pre-wrap">{lead.call_summary}</p>
                          )}

                          {lead.next_step && (
                            <div className="mt-2 text-sm text-primary">{lead.next_step}</div>
                          )}

                          {lead.call_transcript && (
                            <details className="mt-3">
                              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                                <FileText size={12} /> Transcript
                              </summary>
                              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted p-3 text-xs text-foreground font-sans">
                                {lead.call_transcript}
                              </pre>
                            </details>
                          )}
                        </div>

                        <div className="text-xs text-muted-foreground lg:text-right">
                          <div>Attempts: <span className="text-foreground">{lead.call_attempts || 0}</span></div>
                          <div>Method: <span className="text-foreground">{lead.last_contact_method || 'AI Call'}</span></div>
                          {lead.demo_delivery_method && <div>Demo via: <span className="text-foreground">{lead.demo_delivery_method}</span></div>}
                          {lead.demo_contact_value && <div className="truncate">Contact: <span className="text-foreground">{lead.demo_contact_value}</span></div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
