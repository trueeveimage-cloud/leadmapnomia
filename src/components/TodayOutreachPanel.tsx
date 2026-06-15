import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Mail, Phone, Play, Search, CalendarOff } from "lucide-react";
import { toast } from "sonner";
import { connectedCallStatus, gmailTargetForToday, isCallEligible, isEmailEligible, NORMAL_GMAIL_DAILY_TARGET } from "@/lib/outreachEligibility";

interface DailyState {
  emailsSent: number;
  emailsCap: number;
  emailsEligible: number;
  callsConnected: number;
  callsCap: number;
  callsEligible: number;
  activeCalls: number;
  noAnswerToday: number;
  deadCount: number;
  finderSpend: number;
  finderCap: number;
  finderRuns: number;
  finderIgnoredRuns: number;
  finderIgnoredSpend: number;
  finderBudgetStartDate: string;
  latestGmailIssue: string;
  dailyOutreach: DailyOutreachRow[];
}

type DailyOutreachRow = {
  date: string;
  gmailSent: number;
  callsStarted: number;
  callsConnected: number;
};

const DEFAULTS: DailyState = {
  emailsSent: 0,
  emailsCap: NORMAL_GMAIL_DAILY_TARGET,
  emailsEligible: 0,
  callsConnected: 0,
  callsCap: 15,
  callsEligible: 0,
  activeCalls: 0,
  noAnswerToday: 0,
  deadCount: 0,
  finderSpend: 0,
  finderCap: 280,
  finderRuns: 0,
  finderIgnoredRuns: 0,
  finderIgnoredSpend: 0,
  finderBudgetStartDate: "2026-06-01",
  latestGmailIssue: "",
  dailyOutreach: [],
};

const TEXT_SEARCH_COST = 0.032;
const DETAIL_COST = 0.017;

function runCost(stats: any) {
  const stored = Number(stats?.runCostUsd);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const searches = Number(stats?.runTextSearchRequests || stats?.textSearchRequests || 0);
  const details = Number(stats?.runDetailRequests || stats?.detailsFetched || 0);
  return (searches * TEXT_SEARCH_COST) + (details * DETAIL_COST);
}

function dayKey(value: string | Date) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shortDayLabel(value: string) {
  const today = dayKey(new Date());
  if (value === today) return "Today";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function startOfDaysAgoIso(days: number) {
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

function dateInputToStartIso(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return startOfDaysAgoIso(0);
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? startOfDaysAgoIso(0) : date.toISOString();
}

function makeDailyBuckets(days = 7) {
  const rows = new Map<string, DailyOutreachRow>();
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    date.setHours(0, 0, 0, 0);
    rows.set(dayKey(date), {
      date: dayKey(date),
      gmailSent: 0,
      callsStarted: 0,
      callsConnected: 0,
    });
  }
  return rows;
}

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
  const [running, setRunning] = useState<null | "gmail" | "calls">(null);

  async function load() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const iso = startOfDay.toISOString();

    const [
      emailsSent,
      connectedCallRows,
      attemptedCallRows,
      dead,
      activeCalls,
      emailRows,
      callRows,
      finderRuns,
      recentEmails,
      aiStartedRows,
      recentConnectedCalls,
      settings,
      gmailNotifications,
    ] = await Promise.all([
      supabase.from("message_logs").select("id", { count: "exact", head: true })
        .eq("channel", "email").eq("direction", "outbound").eq("status", "sent").gte("created_at", iso),
      supabase.from("leads").select("id, call_status, call_connected")
        .eq("last_contact_method", "AI Call").gte("last_contacted_at", iso).limit(1000),
      supabase.from("leads").select("id, call_status")
        .gte("last_call_attempt_at", iso).limit(1000),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .gte("no_answer_count", 3),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("call_status", "Calling"),
      supabase.from("leads").select("id, email, lead_tier, outreach_stage, outreach_state, outreach_opt_out, do_not_contact, last_called_at, last_contact_method, call_attempts, call_connected")
        .not("email", "is", null).neq("email", "").limit(5000),
      supabase.from("leads").select("id, phone, phone_e164, address, country, product, status, call_attempts, no_answer_count, next_call_after, call_status, call_connected, outreach_opt_out, do_not_contact, potential_score, last_contacted_at, outreach_state")
        .or("phone.not.is.null,phone_e164.not.is.null").limit(5000),
      supabase.from("finder_runs").select("id, stats, created_at"),
      supabase.from("message_logs").select("id, created_at")
        .eq("channel", "email").eq("direction", "outbound").eq("status", "sent").gte("created_at", startOfDaysAgoIso(6)).limit(5000),
      (supabase as any).from("activities").select("id, created_at")
        .eq("type", "ai_call_started").gte("created_at", startOfDaysAgoIso(6)).limit(5000),
      supabase.from("leads").select("id, last_contacted_at, call_status, call_connected")
        .eq("last_contact_method", "AI Call").gte("last_contacted_at", startOfDaysAgoIso(6)).limit(5000),
      supabase.from("settings").select("key, value")
        .in("key", ["gmail_autosend_daily", "ai_calls_daily", "ai_calls_daily_connected_cap", "finder_spend_cap_usd", "finder_budget_start_date"]),
      supabase.from("app_notifications").select("title, message, payload, created_at")
        .eq("type", "gmail_batch_done").order("created_at", { ascending: false }).limit(3),
    ]);

    const cfg: Record<string, string> = {};
    (settings.data || []).forEach((row: any) => { cfg[row.key] = row.value; });

    const connectedCalls = (connectedCallRows.data || []).filter((lead: any) => lead.call_connected === true || connectedCallStatus(lead.call_status)).length;
    const noAnswerToday = (attemptedCallRows.data || []).filter((lead: any) => {
      const status = String(lead.call_status || "").toLowerCase();
      return status.includes("no answer") || status.includes("dead");
    }).length;

    const seenEmails = new Set<string>();
    const emailsEligible = (emailRows.data || []).filter((lead: any) => isEmailEligible(lead, seenEmails)).length;
    const callsEligible = (callRows.data || []).filter((lead: any) => isCallEligible(lead, { product: "leadmap", countries: ["SE"] })).length;

    const latestIssue = (gmailNotifications.data || []).find((row: any) => {
      const payload = row.payload || {};
      return Number(payload.failed || 0) > 0 || String(row.message || "").toLowerCase().includes("failed");
    });

    const budgetStartDate = cfg.finder_budget_start_date || DEFAULTS.finderBudgetStartDate;
    const budgetStartIso = dateInputToStartIso(budgetStartDate);
    const allFinderRuns = finderRuns.data || [];
    const billableFinderRuns = allFinderRuns.filter((run: any) => new Date(run.created_at).getTime() >= new Date(budgetStartIso).getTime());
    const ignoredFinderRuns = allFinderRuns.filter((run: any) => new Date(run.created_at).getTime() < new Date(budgetStartIso).getTime());
    const spend = billableFinderRuns.reduce((sum: number, run: any) => sum + runCost(run.stats), 0);
    const ignoredSpend = ignoredFinderRuns.reduce((sum: number, run: any) => sum + runCost(run.stats), 0);

    const dailyBuckets = makeDailyBuckets(7);
    for (const row of recentEmails.data || []) {
      const bucket = dailyBuckets.get(dayKey(row.created_at));
      if (bucket) bucket.gmailSent += 1;
    }
    for (const row of aiStartedRows.data || []) {
      const bucket = dailyBuckets.get(dayKey(row.created_at));
      if (bucket) bucket.callsStarted += 1;
    }
    for (const row of recentConnectedCalls.data || []) {
      if (row.call_connected !== true && !connectedCallStatus(row.call_status)) continue;
      const bucket = dailyBuckets.get(dayKey(row.last_contacted_at));
      if (bucket) bucket.callsConnected += 1;
    }

    setState({
      emailsSent: emailsSent.count || 0,
      emailsCap: gmailTargetForToday(parseInt(cfg.gmail_autosend_daily || "120", 10)),
      emailsEligible,
      callsConnected: connectedCalls,
      callsCap: parseInt(cfg.ai_calls_daily_connected_cap || cfg.ai_calls_daily || "15", 10),
      callsEligible,
      activeCalls: activeCalls.count || 0,
      noAnswerToday,
      deadCount: dead.count || 0,
      finderSpend: spend,
      finderCap: parseFloat(cfg.finder_spend_cap_usd || "280"),
      finderRuns: billableFinderRuns.length,
      finderIgnoredRuns: ignoredFinderRuns.length,
      finderIgnoredSpend: ignoredSpend,
      finderBudgetStartDate: budgetStartDate,
      latestGmailIssue: latestIssue ? String(latestIssue.message || latestIssue.title || "") : "",
      dailyOutreach: Array.from(dailyBuckets.values()).reverse(),
    });
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  async function runNow(type: "gmail" | "calls") {
    setRunning(type);
    try {
      if (type === "gmail") {
        await supabase.from("settings").update({ value: "true", updated_at: new Date().toISOString() } as any).eq("key", "gmail_autosend_force");
        const { data, error } = await supabase.functions.invoke("auto-send-gmail-daily", { body: {} });
        if (error) throw error;
        toast.success(`Sent ${data?.sent ?? 0} email${data?.sent === 1 ? "" : "s"}`);
      } else {
        const { data, error } = await supabase.functions.invoke("auto-start-ai-calls-daily", { body: { force: true } });
        if (error) throw error;
        toast.success(`Started ${data?.started ?? 0} call${data?.started === 1 ? "" : "s"}`);
      }
      load();
    } catch (e: any) {
      toast.error(e?.message || "Run failed");
    } finally {
      setRunning(null);
    }
  }

  const finderPct = state.finderCap > 0 ? Math.min(100, (state.finderSpend / state.finderCap) * 100) : 0;

  const today = new Date();
  const isWeekend = today.getDay() === 0 || today.getDay() === 6;
  const daysUntilMonday = today.getDay() === 0 ? 1 : today.getDay() === 6 ? 2 : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      {isWeekend && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <CalendarOff size={22} className="text-amber-500 shrink-0" />
          <div>
            <div className="text-sm font-semibold text-amber-200">Weekend pause</div>
            <div className="text-xs text-amber-200/80">
              No emails or calls are sent on weekends. Automation resumes Monday{daysUntilMonday === 1 ? " (tomorrow)" : daysUntilMonday === 2 ? " (in 2 days)" : ""}.
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-foreground">Today's automation</h3>
        <span className="text-xs text-muted-foreground">Runs automatically during the weekday window. Calls stay one-by-one.</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail size={16} className="text-cyan-500" />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Gmail today</span>
            </div>
            <button onClick={() => runNow("gmail")} disabled={running !== null} className="text-xs flex items-center gap-1 text-primary hover:text-primary/80 disabled:opacity-50">
              <Play size={12} /> {running === "gmail" ? "..." : "Run now"}
            </button>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-foreground">{state.emailsSent}</span>
              <span className="text-sm text-muted-foreground">/ {state.emailsCap}</span>
            </div>
            <Bar value={state.emailsSent} max={state.emailsCap} color="hsl(192, 91%, 52%)" />
          </div>
          <p className="text-xs text-muted-foreground">{state.emailsEligible.toLocaleString()} eligible emails waiting</p>
        </div>

        <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone size={16} className="text-amber-500" />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Connected calls</span>
            </div>
            <button onClick={() => runNow("calls")} disabled={running !== null} className="text-xs flex items-center gap-1 text-primary hover:text-primary/80 disabled:opacity-50">
              <Play size={12} /> {running === "calls" ? "..." : "Run now"}
            </button>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-foreground">{state.callsConnected}</span>
              <span className="text-sm text-muted-foreground">/ {state.callsCap}</span>
            </div>
            <Bar value={state.callsConnected} max={state.callsCap} color="hsl(38, 95%, 55%)" />
          </div>
          <p className="text-xs text-muted-foreground">
            {state.callsEligible.toLocaleString()} eligible, {state.activeCalls} active, {state.noAnswerToday} no-answer retries
          </p>
        </div>

        <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-purple-500" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Finder spend</span>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-foreground">${state.finderSpend.toFixed(2)}</span>
              <span className="text-sm text-muted-foreground">/ ${state.finderCap.toFixed(0)}</span>
            </div>
            <Bar value={state.finderSpend} max={state.finderCap} color={finderPct > 85 ? "hsl(0, 72%, 55%)" : "hsl(262, 83%, 65%)"} />
          </div>
          <p className="text-xs text-muted-foreground">
            {state.finderRuns.toLocaleString()} runs since {state.finderBudgetStartDate}
            {state.finderIgnoredRuns > 0 && (
              <> · ignoring ${state.finderIgnoredSpend.toFixed(2)} old spend</>
            )}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-secondary/20 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div>
            <div className="text-sm font-medium text-foreground">Outreach by date</div>
            <div className="text-[11px] text-muted-foreground">Gmails sent and AI calls started. No-answer does not count as connected.</div>
          </div>
          <span className="text-xs text-muted-foreground">7 days</span>
        </div>
        <div className="divide-y divide-border/60">
          {state.dailyOutreach.map(row => (
            <div key={row.date} className="grid grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr] items-center gap-2 px-3 py-2 text-xs">
              <div>
                <div className="font-medium text-foreground">{shortDayLabel(row.date)}</div>
                <div className="text-[10px] text-muted-foreground">{row.date}</div>
              </div>
              <div>
                <div className="font-semibold text-foreground">{row.gmailSent}</div>
                <div className="text-[10px] text-muted-foreground">Gmails</div>
              </div>
              <div>
                <div className="font-semibold text-foreground">{row.callsStarted}</div>
                <div className="text-[10px] text-muted-foreground">Calls sent</div>
              </div>
              <div>
                <div className="font-semibold text-foreground">{row.callsConnected}</div>
                <div className="text-[10px] text-muted-foreground">Connected</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {(state.latestGmailIssue || (state.callsConnected === 0 && state.emailsSent === 0)) && (
        <div className="flex items-start gap-2 text-xs bg-amber-500/10 border border-amber-500/20 rounded-md p-3">
          <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
          <span className="text-amber-200">
            {state.latestGmailIssue || "Nothing has completed yet today. Calls may be attempted, but only answered/finished calls count toward the daily call cap."}
          </span>
        </div>
      )}
    </div>
  );
}
