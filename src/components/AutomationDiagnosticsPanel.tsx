import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, CalendarClock, Pause, Play, ShieldOff } from 'lucide-react';

type CronJob = { jobname: string; schedule: string; active: boolean };
type SkipReason = { reason: string; count: number };

function nextRunFromCron(schedule: string): Date | null {
  // Supports "*/N * * * *" and "M H * * *" and "* * * * *"
  const now = new Date();
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [m, h] = parts;
  const next = new Date(now);
  next.setSeconds(0, 0);

  if (m === '*') {
    next.setMinutes(now.getMinutes() + 1);
    return next;
  }
  if (m.startsWith('*/')) {
    const step = parseInt(m.slice(2), 10);
    if (!step) return null;
    const nextMin = Math.ceil((now.getMinutes() + 1) / step) * step;
    if (nextMin >= 60) {
      next.setHours(now.getHours() + 1);
      next.setMinutes(0);
    } else {
      next.setMinutes(nextMin);
    }
    return next;
  }
  const minVal = parseInt(m, 10);
  const hourVal = h === '*' ? now.getHours() : parseInt(h, 10);
  if (!Number.isFinite(minVal) || !Number.isFinite(hourVal)) return null;
  next.setHours(hourVal, minVal, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

function fmtIn(target: Date | null): string {
  if (!target) return '—';
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return 'due';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `in ${min}m`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return `in ${h}h ${rem}m`;
}

export default function AutomationDiagnosticsPanel() {
  const [jobs, setJobs] = useState<CronJob[] | null>(null);
  const [enabled, setEnabled] = useState<{ gmail: boolean; calls: boolean }>({ gmail: false, calls: false });
  const [skips, setSkips] = useState<{ email: SkipReason[]; call: SkipReason[]; totalEmail: number; totalCall: number }>({
    email: [], call: [], totalEmail: 0, totalCall: 0,
  });
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [settingsRes, emailPool, callPool] = await Promise.all([
      supabase.from('settings').select('key, value').in('key', ['gmail_autosend_enabled', 'ai_calls_enabled']),
      supabase.from('leads').select('id, email, lead_tier, outreach_state, outreach_opt_out, do_not_contact, last_contact_method, call_connected, last_called_at, call_attempts').limit(5000),
      supabase.from('leads').select('id, phone, phone_e164, call_status, call_connected, call_attempts, no_answer_count, outreach_state, outreach_opt_out, do_not_contact, next_call_after, last_contacted_at, status').limit(5000),
    ]);

    const cfg: Record<string, string> = {};
    (settingsRes.data || []).forEach((r: any) => (cfg[r.key] = r.value));
    setEnabled({
      gmail: cfg.gmail_autosend_enabled === 'true',
      calls: cfg.ai_calls_enabled === 'true',
    });

    // Try to read cron.job via a hidden endpoint isn't available client-side; assume unscheduled if settings off.
    // We fall back to showing scheduled cadence hints below.
    setJobs([]);

    const emailReasons: Record<string, number> = {};
    let totalEmail = 0;
    for (const l of emailPool.data || []) {
      totalEmail++;
      const e = String(l.email || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { emailReasons['no valid email'] = (emailReasons['no valid email'] || 0) + 1; continue; }
      if (l.do_not_contact || l.outreach_opt_out || l.outreach_state === 'do_not_contact') { emailReasons['opted out / DNC'] = (emailReasons['opted out / DNC'] || 0) + 1; continue; }
      if (l.outreach_state === 'email_sent' || l.last_contact_method === 'Email') { emailReasons['already emailed'] = (emailReasons['already emailed'] || 0) + 1; continue; }
      if (!['S', 'A+', 'A'].includes(String(l.lead_tier || ''))) { emailReasons['tier below A'] = (emailReasons['tier below A'] || 0) + 1; continue; }
      if (l.call_connected === true || l.last_called_at || l.last_contact_method === 'AI Call' || Number(l.call_attempts || 0) > 0) { emailReasons['already called'] = (emailReasons['already called'] || 0) + 1; continue; }
    }

    const callReasons: Record<string, number> = {};
    let totalCall = 0;
    const finalStatuses = ['interested', 'not_interested', 'callback', 'closed_won', 'closed_lost'];
    for (const l of callPool.data || []) {
      totalCall++;
      const phone = String(l.phone_e164 || l.phone || '').replace(/[^\d+]/g, '');
      if (!phone) { callReasons['no phone'] = (callReasons['no phone'] || 0) + 1; continue; }
      if (l.do_not_contact || l.outreach_opt_out || l.outreach_state === 'do_not_contact') { callReasons['opted out / DNC'] = (callReasons['opted out / DNC'] || 0) + 1; continue; }
      if (l.call_status === 'Calling') { callReasons['call in progress'] = (callReasons['call in progress'] || 0) + 1; continue; }
      const isNoAnswer = String(l.call_status || '').toLowerCase().includes('no answer');
      if ((l.call_connected === true || l.outreach_state === 'called' || l.last_contacted_at) && !isNoAnswer) { callReasons['already called'] = (callReasons['already called'] || 0) + 1; continue; }
      if (Number(l.call_attempts || 0) >= 3 || Number(l.no_answer_count || 0) >= 3) { callReasons['3+ attempts'] = (callReasons['3+ attempts'] || 0) + 1; continue; }
      if (finalStatuses.includes(String(l.status || ''))) { callReasons['final status'] = (callReasons['final status'] || 0) + 1; continue; }
      if (l.next_call_after && String(l.next_call_after) > new Date().toISOString()) { callReasons['scheduled for later'] = (callReasons['scheduled for later'] || 0) + 1; continue; }
    }

    const toSorted = (rec: Record<string, number>): SkipReason[] =>
      Object.entries(rec).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);

    setSkips({ email: toSorted(emailReasons), call: toSorted(callReasons), totalEmail, totalCall });
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const outreachPaused = !enabled.gmail && !enabled.calls;

  const scheduled = [
    { name: 'Gmail auto-send loop', schedule: '*/5 * * * *', enabled: enabled.gmail },
    { name: 'AI calls loop', schedule: '*/10 * * * *', enabled: enabled.calls },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CalendarClock size={16} className="text-primary" />
            Automation diagnostics
          </h3>
          <p className="text-xs text-muted-foreground">Next scheduled runs and why leads are being skipped.</p>
        </div>
        {outreachPaused && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/30 px-2.5 py-1 text-[11px] font-medium text-red-300">
            <ShieldOff size={12} /> Outreach paused
          </span>
        )}
      </div>

      {outreachPaused && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>All cron jobs unscheduled and both channels disabled in settings. No emails or calls will be sent until re-enabled.</span>
        </div>
      )}

      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Scheduled runs</div>
        <div className="divide-y divide-border/60 rounded-md border border-border">
          {scheduled.map((s) => {
            const next = s.enabled ? nextRunFromCron(s.schedule) : null;
            return (
              <div key={s.name} className="flex items-center justify-between px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  {s.enabled ? <Play size={12} className="text-green-500" /> : <Pause size={12} className="text-muted-foreground" />}
                  <div>
                    <div className="font-medium text-foreground">{s.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{s.schedule}</div>
                  </div>
                </div>
                <div className="text-right">
                  {s.enabled ? (
                    <>
                      <div className="font-semibold text-foreground">{fmtIn(next)}</div>
                      <div className="text-[10px] text-muted-foreground">{next ? next.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">unscheduled</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SkipList title="Email skip reasons" total={skips.totalEmail} rows={skips.email} loading={loading} />
        <SkipList title="Call skip reasons" total={skips.totalCall} rows={skips.call} loading={loading} />
      </div>
    </div>
  );
}

function SkipList({ title, total, rows, loading }: { title: string; total: number; rows: SkipReason[]; loading: boolean }) {
  const skipped = rows.reduce((s, r) => s + r.count, 0);
  const eligible = Math.max(0, total - skipped);
  return (
    <div className="rounded-md border border-border bg-secondary/20 p-3">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</div>
        <div className="text-[11px] text-muted-foreground">
          <span className="text-green-500 font-semibold">{eligible.toLocaleString()}</span> eligible / {total.toLocaleString()} scanned
        </div>
      </div>
      {loading && rows.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">No skips detected.</div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.reason} className="flex items-center justify-between text-xs">
              <span className="text-foreground">{r.reason}</span>
              <span className="font-mono text-muted-foreground">{r.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
