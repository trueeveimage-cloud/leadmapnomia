import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Mail, Phone, Play, Search } from "lucide-react";
import { toast } from "sonner";

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
  latestGmailIssue: string;
}

const DEFAULTS: DailyState = {
  emailsSent: 0,
  emailsCap: 100,
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
  latestGmailIssue: "",
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

function validEmail(value?: string | null) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function normalizePhone(value?: string | null) {
  const compact = String(value || "").trim().replace(/[^\d+]/g, "");
  if (!compact) return null;
  if (compact.startsWith("+")) return compact;
  if (compact.startsWith("00")) return `+${compact.slice(2)}`;
  if (compact.startsWith("0")) return `+46${compact.slice(1)}`;
  return compact.startsWith("46") ? `+${compact}` : compact;
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
      settings,
      gmailNotifications,
    ] = await Promise.all([
      supabase.from("message_logs").select("id", { count: "exact", head: true })
        .eq("channel", "email").eq("direction", "outbound").eq("status", "sent").gte("created_at", iso),
      supabase.from("leads").select("id, call_status")
        .eq("last_contact_method", "AI Call").gte("last_contacted_at", iso).limit(1000),
      supabase.from("leads").select("id, call_status")
        .gte("last_call_attempt_at", iso).limit(1000),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .gte("no_answer_count", 3),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("call_status", "Calling"),
      supabase.from("leads").select("id, email, lead_tier, outreach_stage, outreach_state, outreach_opt_out, do_not_contact, last_called_at, last_contact_method, call_attempts")
        .not("email", "is", null).neq("email", "").limit(5000),
      supabase.from("leads").select("id, phone, phone_e164, product, status, call_attempts, no_answer_count, next_call_after, call_status, outreach_opt_out, do_not_contact, potential_score, last_contacted_at, outreach_state")
        .or("phone.not.is.null,phone_e164.not.is.null").limit(5000),
      supabase.from("finder_runs").select("id, stats"),
      supabase.from("settings").select("key, value")
        .in("key", ["gmail_autosend_daily", "ai_calls_daily", "finder_spend_cap_usd"]),
      supabase.from("app_notifications").select("title, message, payload, created_at")
        .eq("type", "gmail_batch_done").order("created_at", { ascending: false }).limit(3),
    ]);

    const cfg: Record<string, string> = {};
    (settings.data || []).forEach((row: any) => { cfg[row.key] = row.value; });

    const connectedCalls = (connectedCallRows.data || []).filter((lead: any) => {
      const status = String(lead.call_status || "").toLowerCase();
      return status && !["no answer", "calling", "error", "dead (3x no answer)"].includes(status);
    }).length;
    const noAnswerToday = (attemptedCallRows.data || []).filter((lead: any) => {
      const status = String(lead.call_status || "").toLowerCase();
      return status.includes("no answer") || status.includes("dead");
    }).length;

    const seenEmails = new Set<string>();
    const emailsEligible = (emailRows.data || []).filter((lead: any) => {
      const email = String(lead.email || "").trim().toLowerCase();
      if (!validEmail(email) || seenEmails.has(email)) return false;
      seenEmails.add(email);
      if (lead.outreach_opt_out || lead.do_not_contact) return false;
      if (lead.outreach_stage === "email_sent" || lead.outreach_state === "email_sent") return false;
      if (lead.outreach_state === "do_not_contact") return false;
      if (!["S", "A+", "A"].includes(String(lead.lead_tier || ""))) return false;
      if (lead.last_called_at || (lead.call_attempts || 0) > 0 || lead.last_contact_method === "AI Call") return false;
      return true;
    }).length;

    const nowIso = new Date().toISOString();
    const callsEligible = (callRows.data || []).filter((lead: any) => {
      const status = String(lead.call_status || "").toLowerCase();
      const isNoAnswer = status.includes("no answer");
      if (lead.product !== "leadmap") return false;
      if (lead.outreach_opt_out || lead.do_not_contact || lead.outreach_state === "do_not_contact") return false;
      if (lead.call_status === "Calling") return false;
      if ((lead.last_contacted_at || lead.outreach_state === "called") && !isNoAnswer) return false;
      if (Number(lead.call_attempts || 0) >= 2 || Number(lead.no_answer_count || 0) >= 3) return false;
      if (lead.next_call_after && String(lead.next_call_after) > nowIso) return false;
      return !!normalizePhone(lead.phone_e164 || lead.phone);
    }).length;

    const latestIssue = (gmailNotifications.data || []).find((row: any) => {
      const payload = row.payload || {};
      return Number(payload.failed || 0) > 0 || String(row.message || "").toLowerCase().includes("failed");
    });

    const spend = (finderRuns.data || []).reduce((sum: number, run: any) => sum + runCost(run.stats), 0);

    setState({
      emailsSent: emailsSent.count || 0,
      emailsCap: parseInt(cfg.gmail_autosend_daily || "100", 10),
      emailsEligible,
      callsConnected: connectedCalls,
      callsCap: parseInt(cfg.ai_calls_daily || "15", 10),
      callsEligible,
      activeCalls: activeCalls.count || 0,
      noAnswerToday,
      deadCount: dead.count || 0,
      finderSpend: spend,
      finderCap: parseFloat(cfg.finder_spend_cap_usd || "280"),
      finderRuns: finderRuns.data?.length || 0,
      latestGmailIssue: latestIssue ? String(latestIssue.message || latestIssue.title || "") : "",
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

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
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
          <p className="text-xs text-muted-foreground">{state.finderRuns.toLocaleString()} Lead Finder runs tracked</p>
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
