import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2, Mail, MessageSquareReply, RefreshCw, Search, Target, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { toast } from 'sonner';

type EmailLead = {
  id: string;
  name: string;
  email: string | null;
  status: string | null;
  country: string | null;
  city: string | null;
  category: string | null;
  niche_label: string | null;
  last_message_preview: string | null;
  last_inbound_at: string | null;
};

type EmailRow = {
  leadId: string;
  lead: EmailLead | null;
  sent: number;
  failed: number;
  replies: number;
  lastSentAt: string | null;
  lastReplyAt: string | null;
  lastError: string | null;
  lastBody: string | null;
};

const filters = [
  { key: 'all', label: 'All' },
  { key: 'interested', label: 'Interested' },
  { key: 'demo', label: 'Demo / meeting' },
  { key: 'replied', label: 'Replied' },
  { key: 'not_interested', label: 'Not interested' },
  { key: 'failed', label: 'Failed' },
] as const;

type FilterKey = typeof filters[number]['key'];

function outcome(row: EmailRow): FilterKey {
  const status = String(row.lead?.status || '').toLowerCase();
  if (status.includes('demo') || status.includes('meeting') || status.includes('making_demo')) return 'demo';
  if (status.includes('not_interested') || status.includes('not interested')) return 'not_interested';
  if (status.includes('interested') || status.includes('callback')) return 'interested';
  if (row.replies > 0) return 'replied';
  if (row.failed > 0 && row.sent === 0) return 'failed';
  return 'all';
}

function pct(value: number, total: number) {
  if (total <= 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

function dateLabel(value?: string | null) {
  if (!value) return 'Never';
  return format(new Date(value), 'MMM d, h:mma');
}

export default function EmailResultsPage() {
  const [rows, setRows] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await (supabase as any)
        .from('message_logs')
        .select('id, lead_id, created_at, direction, status, body, error_message, leads(id, name, email, status, country, city, category, niche_label, last_message_preview, last_inbound_at)')
        .eq('channel', 'email')
        .order('created_at', { ascending: false })
        .limit(5000);

      if (error) throw new Error(error.message);

      const byLead = new Map<string, EmailRow>();
      for (const log of data || []) {
        const leadId = String(log.lead_id || '');
        if (!leadId) continue;
        const current = byLead.get(leadId) || {
          leadId,
          lead: log.leads || null,
          sent: 0,
          failed: 0,
          replies: 0,
          lastSentAt: null,
          lastReplyAt: null,
          lastError: null,
          lastBody: null,
        };
        if (log.leads) current.lead = log.leads;
        if (log.direction === 'outbound' && log.status === 'sent') {
          current.sent += 1;
          if (!current.lastSentAt || log.created_at > current.lastSentAt) current.lastSentAt = log.created_at;
          if (!current.lastBody && log.body) current.lastBody = log.body;
        }
        if (log.direction === 'outbound' && log.status === 'failed') {
          current.failed += 1;
          current.lastError = log.error_message || 'Send failed';
        }
        if (log.direction === 'inbound') {
          current.replies += 1;
          if (!current.lastReplyAt || log.created_at > current.lastReplyAt) current.lastReplyAt = log.created_at;
          if (log.body) current.lastBody = log.body;
        }
        byLead.set(leadId, current);
      }

      const next = Array.from(byLead.values())
        .filter(row => row.sent > 0 || row.failed > 0 || row.replies > 0)
        .sort((a, b) => new Date(b.lastReplyAt || b.lastSentAt || 0).getTime() - new Date(a.lastReplyAt || a.lastSentAt || 0).getTime());
      setRows(next);
      setLastLoadedAt(new Date());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load email results';
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const sentLeads = rows.filter(row => row.sent > 0).length;
    const replied = rows.filter(row => row.replies > 0).length;
    const interested = rows.filter(row => ['interested', 'demo'].includes(outcome(row))).length;
    const demos = rows.filter(row => outcome(row) === 'demo').length;
    const failed = rows.reduce((sum, row) => sum + row.failed, 0);
    return { sentLeads, replied, interested, demos, failed };
  }, [rows]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(row => {
      const rowOutcome = outcome(row);
      if (filter !== 'all') {
        if (filter === 'replied' && row.replies === 0) return false;
        else if (filter === 'failed' && row.failed === 0) return false;
        else if (!['replied', 'failed'].includes(filter) && rowOutcome !== filter) return false;
      }
      if (!needle) return true;
      const haystack = [
        row.lead?.name,
        row.lead?.email,
        row.lead?.status,
        row.lead?.country,
        row.lead?.city,
        row.lead?.category,
        row.lead?.niche_label,
        row.lastBody,
        row.lastError,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [filter, query, rows]);

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Leadmap AI</div>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-foreground">
              <Mail size={21} className="text-primary" /> Email Results
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Gmail outcomes by lead: sent, replies, interested, demo/meeting, and failures.</p>
          </div>
          <div className="flex items-center gap-2">
            {lastLoadedAt && <span className="hidden text-xs text-muted-foreground sm:inline">Updated {format(lastLoadedAt, 'h:mma')}</span>}
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </Button>
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric icon={<Mail size={15} />} label="Emailed leads" value={stats.sentLeads} />
          <Metric icon={<MessageSquareReply size={15} />} label="Replies" value={stats.replied} sub={`${pct(stats.replied, stats.sentLeads)} reply rate`} />
          <Metric icon={<Target size={15} />} label="Interested" value={stats.interested} sub={`${pct(stats.interested, stats.sentLeads)} of emailed`} tone="good" />
          <Metric icon={<CheckCircle2 size={15} />} label="Demo / meeting" value={stats.demos} tone="good" />
          <Metric icon={<XCircle size={15} />} label="Failed sends" value={stats.failed} tone={stats.failed > 0 ? 'bad' : 'normal'} />
        </div>

        <div className="mb-5 rounded-md border border-border bg-card p-3">
          <label className="relative block">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search business, email, niche, status, reply..."
              className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {filters.map(item => {
              const count = item.key === 'all'
                ? rows.length
                : rows.filter(row => item.key === 'replied' ? row.replies > 0 : item.key === 'failed' ? row.failed > 0 : outcome(row) === item.key).length;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs transition-colors',
                    filter === item.key
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item.label} <span className="ml-1 opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {loadError && (
          <div className="mb-5 rounded-md border border-red-500/30 bg-red-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="mt-0.5 text-red-400" />
              <div>
                <div className="text-sm font-medium text-red-200">Could not load email results</div>
                <div className="mt-1 text-xs text-red-100/80">{loadError}</div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="rounded-md border border-border bg-muted/20 py-16 text-center">
            <RefreshCw size={22} className="mx-auto mb-3 animate-spin text-muted-foreground" />
            <div className="text-sm text-muted-foreground">Loading email results...</div>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/20 px-6 py-14 text-center">
            <Mail size={34} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No Gmail results logged in this Supabase project yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Manual or automated Gmail sends will appear here after `send-gmail` writes to message_logs.
            </p>
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/20 px-6 py-14 text-center">
            <Mail size={34} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No email results match this view</p>
            <p className="mt-1 text-xs text-muted-foreground">Try another filter or search term.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border bg-card">
            <div className="grid grid-cols-[minmax(0,1fr)_120px_120px] gap-3 border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground max-md:hidden">
              <div>Lead</div>
              <div>Outcome</div>
              <div>Last activity</div>
            </div>
            <div className="divide-y divide-border">
              {visibleRows.map(row => {
                const rowOutcome = outcome(row);
                const badgeClass = rowOutcome === 'demo' || rowOutcome === 'interested'
                  ? 'border-green-500/30 bg-green-500/10 text-green-400'
                  : rowOutcome === 'not_interested' || rowOutcome === 'failed'
                    ? 'border-red-500/30 bg-red-500/10 text-red-400'
                    : row.replies > 0
                      ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400'
                      : 'border-border bg-muted text-muted-foreground';
                return (
                  <div key={row.leadId} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_120px_120px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate font-semibold text-foreground">{row.lead?.name || 'Unknown lead'}</div>
                        {row.lead?.email && <span className="text-xs text-muted-foreground">{row.lead.email}</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {row.lead?.niche_label && <span>{row.lead.niche_label}</span>}
                        {row.lead?.country && <span>{row.lead.country}</span>}
                        {row.sent > 0 && <span>{row.sent} sent</span>}
                        {row.replies > 0 && <span className="text-cyan-400">{row.replies} replied</span>}
                        {row.failed > 0 && <span className="text-red-400">{row.failed} failed</span>}
                      </div>
                      {(row.lead?.last_message_preview || row.lastBody || row.lastError) && (
                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{row.lastError || row.lead?.last_message_preview || row.lastBody}</p>
                      )}
                    </div>
                    <div>
                      <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs', badgeClass)}>
                        {rowOutcome === 'all' && row.replies > 0 ? 'Replied' : filters.find(item => item.key === rowOutcome)?.label || 'Sent'}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <div>{dateLabel(row.lastReplyAt || row.lastSentAt)}</div>
                      {row.lastReplyAt && <div className="mt-1 text-cyan-400">latest reply</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function Metric({ icon, label, value, sub, tone = 'normal' }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; tone?: 'normal' | 'good' | 'bad' }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <div className={cn('mt-1 text-2xl font-semibold text-foreground', tone === 'good' && 'text-green-400', tone === 'bad' && 'text-red-400')}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
