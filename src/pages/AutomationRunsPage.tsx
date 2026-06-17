import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { fetchNotifications, type AppNotification } from '@/lib/supabase';
import { AlertTriangle, Bot, CheckCircle2, ChevronDown, ChevronRight, Clock, Mail, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type FilterKey = 'all' | 'gmail' | 'ai_calls' | 'errors' | 'skipped';

const FILTERS: { key: FilterKey; label: string; types: string[]; tone: string }[] = [
  { key: 'all', label: 'All runs', types: [], tone: '' },
  { key: 'gmail', label: 'Gmail batches', types: ['gmail_batch_done'], tone: 'text-blue-500' },
  { key: 'ai_calls', label: 'AI call batches', types: ['ai_call_batch_done', 'ai_call_started'], tone: 'text-violet-500' },
  { key: 'errors', label: 'Errors', types: ['system_error'], tone: 'text-rose-500' },
  { key: 'skipped', label: 'Skipped', types: ['outreach_skipped'], tone: 'text-amber-500' },
];

function fmt(ts: string) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function isError(n: AppNotification) {
  return n.type === 'system_error' || /fail|error|401|429|missing/i.test(`${n.title} ${n.message}`);
}

function iconFor(n: AppNotification) {
  if (isError(n)) return <AlertTriangle size={14} className="text-rose-500" />;
  if (n.type === 'gmail_batch_done') return <Mail size={14} className="text-blue-500" />;
  if (n.type === 'ai_call_batch_done' || n.type === 'ai_call_started') return <Bot size={14} className="text-violet-500" />;
  if (n.type === 'outreach_skipped') return <Clock size={14} className="text-amber-500" />;
  return <CheckCircle2 size={14} className="text-muted-foreground" />;
}

function dayKey(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function summary(n: AppNotification) {
  const p = (n.payload || {}) as Record<string, any>;
  const bits: string[] = [];
  if (typeof p.sent === 'number') bits.push(`${p.sent} sent`);
  if (typeof p.started === 'number') bits.push(`${p.started} started`);
  if (typeof p.connected === 'number') bits.push(`${p.connected} connected`);
  if (typeof p.failed === 'number' && p.failed > 0) bits.push(`${p.failed} failed`);
  if (typeof p.skipped === 'number' && p.skipped > 0) bits.push(`${p.skipped} skipped`);
  if (typeof p.sentToday === 'number' && typeof p.dailyCap === 'number') bits.push(`${p.sentToday}/${p.dailyCap} today`);
  if (p.reason) bits.push(`reason: ${p.reason}`);
  if (p.status && !p.reason) bits.push(`HTTP ${p.status}`);
  return bits.join(' · ');
}

export default function AutomationRunsPage() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      const rows = await fetchNotifications(500);
      setItems(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load runs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = window.setInterval(load, 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('automation-runs-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_notifications' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filtered = useMemo(() => {
    const def = FILTERS.find(f => f.key === filter)!;
    if (def.key === 'all') return items;
    if (def.key === 'errors') return items.filter(isError);
    return items.filter(n => def.types.includes(n.type));
  }, [items, filter]);

  const counts = useMemo(() => ({
    all: items.length,
    gmail: items.filter(n => n.type === 'gmail_batch_done').length,
    ai_calls: items.filter(n => n.type === 'ai_call_batch_done' || n.type === 'ai_call_started').length,
    errors: items.filter(isError).length,
    skipped: items.filter(n => n.type === 'outreach_skipped').length,
  }), [items]);

  const grouped = useMemo(() => {
    const map = new Map<string, AppNotification[]>();
    for (const n of filtered) {
      const k = dayKey(n.created_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(n);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-5 sm:py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Leadmap AI</div>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">Automation Run Log</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every cron tick — Gmail batches, AI calls, skips, and errors with full payload. Live-refreshing.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>

        {counts.errors > 0 && (
          <div className="mb-5 rounded-lg border border-rose-500/40 bg-rose-500/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-rose-500">
              <AlertTriangle size={16} />
              {counts.errors} unresolved error{counts.errors === 1 ? '' : 's'} in the last 500 events
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Tap the Errors filter to see the failing payloads (401, missing secrets, rate limits).
            </p>
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-xs font-medium transition',
                filter === f.key
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              {f.label} <span className="ml-1 text-[10px] text-muted-foreground">{counts[f.key]}</span>
            </button>
          ))}
        </div>

        <div className="space-y-5">
          {grouped.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No automation events match this filter yet.
            </div>
          )}
          {grouped.map(([day, rows]) => (
            <section key={day} className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2">
                <div className="text-sm font-semibold text-foreground">{day}</div>
                <div className="text-xs text-muted-foreground">{rows.length} event{rows.length === 1 ? '' : 's'}</div>
              </div>
              <div className="divide-y divide-border/60">
                {rows.map(n => {
                  const isOpen = !!open[n.id];
                  const errored = isError(n);
                  return (
                    <div key={n.id} className={cn('px-4 py-3 text-sm', errored && 'bg-rose-500/5')}>
                      <button
                        onClick={() => setOpen(prev => ({ ...prev, [n.id]: !prev[n.id] }))}
                        className="flex w-full items-start gap-3 text-left"
                      >
                        <div className="mt-0.5 flex items-center gap-2">
                          {isOpen ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                          {iconFor(n)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">{n.title}</span>
                            <Badge variant="outline" className="text-[10px]">{n.type}</Badge>
                            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{fmt(n.created_at)}</span>
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{n.message}</div>
                          {summary(n) && (
                            <div className="mt-1 text-[11px] text-muted-foreground">{summary(n)}</div>
                          )}
                        </div>
                      </button>
                      {isOpen && (
                        <pre className="mt-3 overflow-x-auto rounded bg-background/60 p-3 text-[11px] leading-relaxed text-muted-foreground">
{JSON.stringify(n.payload || {}, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
