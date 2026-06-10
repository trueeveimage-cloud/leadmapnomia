import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Phone, Search, Play, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface DailyState {
  emailsSent: number;
  emailsCap: number;
  callsConnected: number;
  callsCap: number;
  noAnswerToday: number;
  deadCount: number;
  scrapeAttempts: number;
  scrapedTotal: number;
  emailsFound: number;
  pendingScrape: number;
  costPerLookup: number;
}

const DEFAULTS = {
  emailsSent: 0, emailsCap: 100,
  callsConnected: 0, callsCap: 15,
  noAnswerToday: 0, deadCount: 0,
  scrapeAttempts: 0, scrapedTotal: 0, emailsFound: 0,
  pendingScrape: 0, costPerLookup: 0,
};

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export default function TodayOutreachPanel() {
  const [state, setState] = useState<DailyState>(DEFAULTS);
  const [running, setRunning] = useState<null | 'gmail' | 'calls'>(null);

  async function load() {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const iso = startOfDay.toISOString();

    const [emailsSent, callsToday, noAnsToday, dead, scrapedTotal, pendingScrape, settings] = await Promise.all([
      supabase.from('message_logs').select('id', { count: 'exact', head: true })
        .eq('channel', 'email').eq('direction', 'outbound').eq('status', 'sent').gte('created_at', iso),
      supabase.from('leads').select('id', { count: 'exact', head: true })
        .gte('last_called_at', iso),
      supabase.from('leads').select('id', { count: 'exact', head: true })
        .gte('last_call_attempt_at', iso).is('last_called_at', null),
      supabase.from('leads').select('id', { count: 'exact', head: true })
        .gte('no_answer_count', 3),
      supabase.from('leads').select('id', { count: 'exact', head: true })
        .not('email', 'is', null).neq('email', ''),
      supabase.from('leads').select('id', { count: 'exact', head: true })
        .not('website', 'is', null).neq('website', '')
        .or('email.is.null,email.eq.'),
      supabase.from('settings').select('key, value')
        .in('key', ['gmail_autosend_daily', 'ai_calls_daily_cap', 'email_scrape_cost_per_lookup']),
    ]);

    const cfg: Record<string, string> = {};
    (settings.data || []).forEach((r: any) => { cfg[r.key] = r.value; });

    setState({
      emailsSent: emailsSent.count || 0,
      emailsCap: parseInt(cfg.gmail_autosend_daily || '100', 10),
      callsConnected: callsToday.count || 0,
      callsCap: parseInt(cfg.ai_calls_daily_cap || '15', 10),
      noAnswerToday: noAnsToday.count || 0,
      deadCount: dead.count || 0,
      scrapeAttempts: (scrapedTotal.count || 0) + (pendingScrape.count || 0),
      scrapedTotal: scrapedTotal.count || 0,
      emailsFound: scrapedTotal.count || 0,
      pendingScrape: pendingScrape.count || 0,
      costPerLookup: parseFloat(cfg.email_scrape_cost_per_lookup || '0'),
    });
  }

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, []);

  async function runNow(type: 'gmail' | 'calls') {
    setRunning(type);
    try {
      if (type === 'gmail') {
        await supabase.from('settings').update({ value: 'true', updated_at: new Date().toISOString() } as any).eq('key', 'gmail_autosend_force');
        const { data, error } = await supabase.functions.invoke('auto-send-gmail-daily', { body: {} });
        if (error) throw error;
        toast.success(`Sent ${data?.sent ?? 0} email${data?.sent === 1 ? '' : 's'}`);
      } else {
        const { data, error } = await supabase.functions.invoke('auto-start-ai-calls-daily', { body: { force: true } });
        if (error) throw error;
        toast.success(`Started ${data?.started ?? 0} call${data?.started === 1 ? '' : 's'}`);
      }
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Run failed');
    } finally {
      setRunning(null);
    }
  }

  const hitRate = state.scrapeAttempts > 0 ? (state.emailsFound / state.scrapeAttempts) * 100 : 0;
  const spentTotal = state.scrapeAttempts * state.costPerLookup;
  const projectedNext = state.pendingScrape * state.costPerLookup;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Today's automation</h3>
        <span className="text-xs text-muted-foreground">Auto-runs every 5 min (email) · 10 min (calls)</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Gmail */}
        <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail size={16} className="text-cyan-500" />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Gmail today</span>
            </div>
            <button
              onClick={() => runNow('gmail')}
              disabled={running !== null}
              className="text-xs flex items-center gap-1 text-primary hover:text-primary/80 disabled:opacity-50"
            >
              <Play size={12} /> {running === 'gmail' ? '…' : 'Run now'}
            </button>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-foreground">{state.emailsSent}</span>
              <span className="text-sm text-muted-foreground">/ {state.emailsCap}</span>
            </div>
            <Bar value={state.emailsSent} max={state.emailsCap} color="hsl(192, 91%, 52%)" />
          </div>
          <p className="text-xs text-muted-foreground">{state.emailsCap - state.emailsSent} remaining for today</p>
        </div>

        {/* AI Calls */}
        <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone size={16} className="text-amber-500" />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">AI calls today</span>
            </div>
            <button
              onClick={() => runNow('calls')}
              disabled={running !== null}
              className="text-xs flex items-center gap-1 text-primary hover:text-primary/80 disabled:opacity-50"
            >
              <Play size={12} /> {running === 'calls' ? '…' : 'Run now'}
            </button>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-foreground">{state.callsConnected}</span>
              <span className="text-sm text-muted-foreground">/ {state.callsCap} connected</span>
            </div>
            <Bar value={state.callsConnected} max={state.callsCap} color="hsl(38, 95%, 55%)" />
          </div>
          <p className="text-xs text-muted-foreground">
            {state.noAnswerToday} no-answer (re-queued) · {state.deadCount} dead (3×)
          </p>
        </div>

        {/* Email scrape spend */}
        <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search size={16} className="text-purple-500" />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Email search spend</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">${spentTotal.toFixed(2)}</span>
            <span className="text-xs text-muted-foreground">spent total</span>
          </div>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <div>{state.scrapeAttempts.toLocaleString()} lookups · {state.emailsFound.toLocaleString()} found ({hitRate.toFixed(0)}%)</div>
            <div className="text-foreground/80">
              Next search est. <span className="font-semibold">${projectedNext.toFixed(2)}</span> ({state.pendingScrape.toLocaleString()} pending)
            </div>
          </div>
        </div>
      </div>

      {state.callsConnected === 0 && state.emailsSent === 0 && (
        <div className="flex items-start gap-2 text-xs bg-amber-500/10 border border-amber-500/20 rounded-md p-3">
          <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
          <span className="text-amber-200">
            Nothing has fired yet today. The cron will pick up automatically — hit "Run now" if you want to start immediately.
          </span>
        </div>
      )}
    </div>
  );
}
