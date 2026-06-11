import AppLayout from "@/components/AppLayout";
import TodayOutreachPanel from "@/components/TodayOutreachPanel";
import { useCRM } from "@/context/CRMContext";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, AreaChart, Area } from "recharts";
import { TrendingUp, Users, Phone, MessageSquare, Target, ArrowUpRight, ArrowDownRight, Globe, Mail, Search, Zap, Clock, CheckCircle } from "lucide-react";
import { findCity, Country, getCitiesByCountry } from "@/lib/cities";
import CountryFlag, { countryLabel } from "@/components/CountryFlag";

const COLORS = {
  primary: "hsl(213, 94%, 58%)",
  green: "hsl(142, 69%, 45%)",
  amber: "hsl(38, 95%, 55%)",
  red: "hsl(0, 72%, 55%)",
  purple: "hsl(262, 83%, 65%)",
  cyan: "hsl(192, 91%, 52%)",
  muted: "hsl(215, 15%, 50%)",
};

const COUNTRY_NAMES: Record<Country, string> = { SE: 'Sweden', NO: 'Norway', DK: 'Denmark', UK: 'United Kingdom', ES: 'Spain' };
const COUNTRIES: Country[] = ['SE', 'NO', 'DK', 'UK', 'ES'];
const TEXT_SEARCH_COST = 0.032;
const DETAIL_COST = 0.017;

function detectDashboardCountry(lead: any): Country {
  const explicit = String(lead.country || '').toUpperCase();
  if (COUNTRIES.includes(explicit as Country)) return explicit as Country;
  const addr = String(lead.address || '').toLowerCase();
  const phone = String(lead.phone || '').trim();
  if (phone.startsWith('+47') || addr.includes('norge') || addr.includes('norway') || addr.includes(', no')) return 'NO';
  if (phone.startsWith('+45') || addr.includes('danmark') || addr.includes('denmark') || addr.includes(', dk')) return 'DK';
  if (phone.startsWith('+44') || addr.includes('united kingdom') || addr.includes('england') || addr.includes(', uk')) return 'UK';
  if (phone.startsWith('+34') || addr.includes('spain') || addr.includes('espana') || addr.includes('españa')) return 'ES';
  for (const c of COUNTRIES) {
    if (getCitiesByCountry(c).some(city => addr.includes(city.name.toLowerCase()))) return c;
  }
  return 'SE';
}

function finderRunCountry(run: any): Country {
  const city = findCity(run.city);
  if (city?.country) return city.country;
  const statsCountry = String(run.stats?.country || '').toUpperCase();
  return COUNTRIES.includes(statsCountry as Country) ? statsCountry as Country : 'SE';
}

function finderRunSpend(stats: any) {
  const stored = Number(stats?.runCostUsd);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const searches = Number(stats?.runTextSearchRequests || stats?.textSearchRequests || 0);
  const details = Number(stats?.runDetailRequests || stats?.detailsFetched || 0);
  return (searches * TEXT_SEARCH_COST) + (details * DETAIL_COST);
}

function isNoAnswerOutcome(value: string) {
  const normalized = value.toLowerCase().replace(/[_-]/g, ' ');
  return normalized.includes('no answer') || normalized.includes('busy') || normalized.includes('failed') || normalized.includes('not connected');
}

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  sub?: string;
}

function StatCard({ label, value, icon, color, sub }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{typeof value === "number" ? value.toLocaleString() : value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <div className="rounded-lg p-2" style={{ background: `${color}20` }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 animate-fade-in">
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const { counts } = useCRM();
  const [msgStats, setMsgStats] = useState({ sent: 0, delivered: 0, failed: 0, undelivered: 0, inbound: 0, queued: 0 });
  const [callStats, setCallStats] = useState<{ outcome: string; count: number }[]>([]);
  const [dailyActivity, setDailyActivity] = useState<{ date: string; gmails: number; callsSent: number; connected: number }[]>([]);
  const [countryLeads, setCountryLeads] = useState<Record<Country, { total: number; phone: number; email: number; smsOnly: number; callOnly: number; contacted: number; replied: number }>>({
    SE: { total: 0, phone: 0, email: 0, smsOnly: 0, callOnly: 0, contacted: 0, replied: 0 },
    NO: { total: 0, phone: 0, email: 0, smsOnly: 0, callOnly: 0, contacted: 0, replied: 0 },
    DK: { total: 0, phone: 0, email: 0, smsOnly: 0, callOnly: 0, contacted: 0, replied: 0 },
    UK: { total: 0, phone: 0, email: 0, smsOnly: 0, callOnly: 0, contacted: 0, replied: 0 },
    ES: { total: 0, phone: 0, email: 0, smsOnly: 0, callOnly: 0, contacted: 0, replied: 0 },
  });
  const [finderStats, setFinderStats] = useState<Record<Country, { runs: number; leads: number; spend: number; cities: number }>>({
    SE: { runs: 0, leads: 0, spend: 0, cities: 0 },
    NO: { runs: 0, leads: 0, spend: 0, cities: 0 },
    DK: { runs: 0, leads: 0, spend: 0, cities: 0 },
    UK: { runs: 0, leads: 0, spend: 0, cities: 0 },
    ES: { runs: 0, leads: 0, spend: 0, cities: 0 },
  });
  const [outreachStages, setOutreachStages] = useState<{ stage: string; count: number }[]>([]);
  const [campaignStats, setCampaignStats] = useState({ total: 0, running: 0, totalRuns: 0, totalSent: 0 });
  const [finderBudgetStartDate, setFinderBudgetStartDate] = useState('2026-06-11');

  function connectedCallStatus(status?: string | null) {
    const value = String(status || '').toLowerCase();
    return !!value && !['no answer', 'calling', 'error', 'dead (3x no answer)'].includes(value);
  }

  function dayKey(value: string | Date) {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function startOfDaysAgoIso(days: number) {
    const start = new Date();
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }

  useEffect(() => {
    // Fetch SMS stats with more detail
    Promise.all([
      supabase.from("message_logs").select("id", { count: "exact", head: true }).eq("direction", "outbound"),
      supabase.from("message_logs").select("id", { count: "exact", head: true }).eq("direction", "outbound").eq("status", "delivered"),
      supabase.from("message_logs").select("id", { count: "exact", head: true }).eq("direction", "outbound").eq("status", "failed"),
      supabase.from("message_logs").select("id", { count: "exact", head: true }).eq("direction", "outbound").eq("status", "undelivered"),
      supabase.from("message_logs").select("id", { count: "exact", head: true }).eq("direction", "inbound"),
      supabase.from("message_logs").select("id", { count: "exact", head: true }).eq("direction", "outbound").in("status", ["queued", "sent"]),
    ]).then(([sent, delivered, failed, undelivered, inbound, queued]) => {
      setMsgStats({
        sent: sent.count || 0,
        delivered: delivered.count || 0,
        failed: failed.count || 0,
        undelivered: undelivered.count || 0,
        inbound: inbound.count || 0,
        queued: queued.count || 0,
      });
    });

    // Fetch call outcomes
    supabase
      .from("leads")
      .select("call_outcome_last")
      .not("call_outcome_last", "is", null)
      .then(({ data }) => {
        const map: Record<string, number> = {};
        (data || []).forEach((l: any) => {
          const o = l.call_outcome_last || "unknown";
          map[o] = (map[o] || 0) + 1;
        });
        setCallStats(Object.entries(map).map(([outcome, count]) => ({ outcome, count })));
      });

    // Fetch outreach stages
    supabase
      .from("leads")
      .select("outreach_stage")
      .then(({ data }) => {
        const map: Record<string, number> = {};
        (data || []).forEach((l: any) => {
          const s = l.outreach_stage || "none";
          map[s] = (map[s] || 0) + 1;
        });
        setOutreachStages(Object.entries(map).map(([stage, count]) => ({ stage, count })).sort((a, b) => b.count - a.count));
      });

    // Fetch campaign stats
    Promise.all([
      supabase.from("campaigns").select("id, status"),
      supabase.from("campaign_runs").select("id, stats"),
    ]).then(([camps, runs]) => {
      const campaigns = camps.data || [];
      const allRuns = runs.data || [];
      let totalSent = 0;
      for (const r of allRuns) {
        const s = r.stats as any;
        totalSent += s?.sent || 0;
      }
      setCampaignStats({
        total: campaigns.length,
        running: campaigns.filter(c => c.status === 'running').length,
        totalRuns: allRuns.length,
        totalSent,
      });
    });

    // Fetch daily Leadmap outreach activity (last 14 days)
    (async () => {
      const since = startOfDaysAgoIso(13);
      const dayMap: Record<string, { date: string; gmails: number; callsSent: number; connected: number }> = {};
      for (let offset = 13; offset >= 0; offset--) {
        const date = new Date();
        date.setDate(date.getDate() - offset);
        const key = dayKey(date);
        dayMap[key] = { date: key.slice(5), gmails: 0, callsSent: 0, connected: 0 };
      }

      const [emails, callStarts, connectedCalls] = await Promise.all([
        supabase
          .from("message_logs")
          .select("created_at")
          .eq("channel", "email")
          .eq("direction", "outbound")
          .eq("status", "sent")
          .gte("created_at", since)
          .limit(5000),
        (supabase as any)
          .from("activities")
          .select("created_at")
          .eq("type", "ai_call_started")
          .gte("created_at", since)
          .limit(5000),
        supabase
          .from("leads")
          .select("last_contacted_at, call_status")
          .eq("last_contact_method", "AI Call")
          .gte("last_contacted_at", since)
          .limit(5000),
      ]);

      (emails.data || []).forEach((row: any) => {
        const key = dayKey(row.created_at);
        if (dayMap[key]) dayMap[key].gmails++;
      });
      (callStarts.data || []).forEach((row: any) => {
        const key = dayKey(row.created_at);
        if (dayMap[key]) dayMap[key].callsSent++;
      });
      (connectedCalls.data || []).forEach((row: any) => {
        if (!connectedCallStatus(row.call_status)) return;
        const key = dayKey(row.last_contacted_at);
        if (dayMap[key]) dayMap[key].connected++;
      });

      setDailyActivity(Object.values(dayMap));
    })();

    // Fetch leads by country
    (async () => {
      const PAGE_SIZE = 1000;
      const allLeads: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase.from('leads').select('address, country, phone, email, section, outreach_opt_out, needs_call, status, has_replied, outreach_stage').range(from, from + PAGE_SIZE - 1);
        if (error || !data || data.length === 0) break;
        allLeads.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      const stats: Record<Country, { total: number; phone: number; email: number; smsOnly: number; callOnly: number; contacted: number; replied: number }> = {
        SE: { total: 0, phone: 0, email: 0, smsOnly: 0, callOnly: 0, contacted: 0, replied: 0 },
        NO: { total: 0, phone: 0, email: 0, smsOnly: 0, callOnly: 0, contacted: 0, replied: 0 },
        DK: { total: 0, phone: 0, email: 0, smsOnly: 0, callOnly: 0, contacted: 0, replied: 0 },
        UK: { total: 0, phone: 0, email: 0, smsOnly: 0, callOnly: 0, contacted: 0, replied: 0 },
        ES: { total: 0, phone: 0, email: 0, smsOnly: 0, callOnly: 0, contacted: 0, replied: 0 },
      };

      for (const lead of allLeads) {
        const country = detectDashboardCountry(lead);
        stats[country].total++;
        if (lead.phone) stats[country].phone++;
        if (lead.email) stats[country].email++;
        if (lead.needs_call) stats[country].callOnly++;
        else if (lead.phone && !lead.outreach_opt_out) stats[country].smsOnly++;
        if (lead.status === 'contacted' || lead.outreach_stage === 'sms_sent') stats[country].contacted++;
        if (lead.has_replied) stats[country].replied++;
      }
      setCountryLeads(stats);
    })();

    // Fetch finder stats by country
    (async () => {
      const { data: budgetSetting } = await supabase.from('settings').select('value').eq('key', 'finder_budget_start_date').maybeSingle();
      const budgetStart = /^\d{4}-\d{2}-\d{2}$/.test(String(budgetSetting?.value || '')) ? String(budgetSetting?.value) : '2026-06-11';
      setFinderBudgetStartDate(budgetStart);
      const budgetStartIso = new Date(`${budgetStart}T00:00:00`).toISOString();
      const { data: runs } = await supabase.from('finder_runs').select('city, stats, created_at').gte('created_at', budgetStartIso);
      const fStats: Record<Country, { runs: number; leads: number; spend: number; cities: number }> = {
        SE: { runs: 0, leads: 0, spend: 0, cities: 0 },
        NO: { runs: 0, leads: 0, spend: 0, cities: 0 },
        DK: { runs: 0, leads: 0, spend: 0, cities: 0 },
        UK: { runs: 0, leads: 0, spend: 0, cities: 0 },
        ES: { runs: 0, leads: 0, spend: 0, cities: 0 },
      };
      const citySets: Record<Country, Set<string>> = { SE: new Set(), NO: new Set(), DK: new Set(), UK: new Set(), ES: new Set() };
      for (const run of (runs || [])) {
        const c = finderRunCountry(run);
        fStats[c].runs++;
        citySets[c].add(run.city);
        const s = run.stats as any;
        fStats[c].leads += (s?.noWebsiteWithPhone ?? 0) + (s?.noWebsiteEmailOnly ?? 0);
        fStats[c].spend += finderRunSpend(s);
      }
      for (const c of COUNTRIES) {
        fStats[c].cities = citySets[c].size;
      }
      setFinderStats(fStats);
    })();
  }, []);

  // Funnel data
  const funnelData = [
    { name: "Reachable", value: counts.total - counts.hasWebsite - counts.missing, fill: COLORS.primary },
    { name: "Contacted", value: counts.contacted + counts.answered + counts.interested + counts.demo + counts.making_demo + counts.closed_won, fill: COLORS.cyan },
    { name: "Answered", value: counts.answered + counts.interested + counts.demo + counts.making_demo + counts.closed_won, fill: COLORS.green },
    { name: "Interested", value: counts.interested + counts.demo + counts.making_demo + counts.closed_won, fill: COLORS.amber },
    { name: "Demo", value: counts.demo + counts.making_demo + counts.closed_won, fill: COLORS.purple },
    { name: "Making Demo", value: counts.making_demo + counts.closed_won, fill: COLORS.primary },
    { name: "Won", value: counts.closed_won, fill: COLORS.green },
  ];

  // SMS pie data
  const smsPieData = [
    { name: "Delivered", value: msgStats.delivered, fill: COLORS.green },
    { name: "Undelivered", value: msgStats.undelivered, fill: COLORS.amber },
    { name: "Queued/Sent", value: msgStats.queued, fill: COLORS.cyan },
    { name: "Failed", value: msgStats.failed, fill: COLORS.red },
  ].filter(d => d.value > 0);

  // Call outcome colors
  const outcomeColors: Record<string, string> = {
    answered: COLORS.green,
    no_answer: COLORS.amber,
    busy: COLORS.purple,
    wrong_number: COLORS.red,
    callback: COLORS.cyan,
    interested: COLORS.green,
    not_interested: COLORS.red,
  };

  const deliveryRate = msgStats.sent > 0
    ? ((msgStats.delivered / msgStats.sent) * 100).toFixed(1)
    : "0";

  const conversionRate = counts.total > 0
    ? ((counts.interested + counts.demo + counts.making_demo + counts.closed_won) / counts.total * 100).toFixed(1)
    : "0";

  const replyRate = msgStats.sent > 0
    ? (msgStats.inbound / msgStats.sent * 100).toFixed(1)
    : "0";
  const realCallTotal = callStats.filter(item => !isNoAnswerOutcome(item.outcome)).reduce((sum, item) => sum + item.count, 0);
  const noAnswerTotal = callStats.filter(item => isNoAnswerOutcome(item.outcome)).reduce((sum, item) => sum + item.count, 0);

  // Outreach stage colors
  const stageColors: Record<string, string> = {
    none: COLORS.muted,
    sms_sent: COLORS.primary,
    no_reply_call: COLORS.amber,
    replied: COLORS.green,
    opted_out: COLORS.red,
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Statistics</h1>
          <p className="text-sm text-muted-foreground">Overview of your outreach pipeline</p>
        </div>

        <TodayOutreachPanel />

        {/* Stat cards - 2 rows */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Reachable Leads" value={counts.total - counts.hasWebsite - counts.missing} icon={<Users size={18} />} color={COLORS.primary} sub={`${counts.total.toLocaleString()} total`} />
          <StatCard label="SMS Sent" value={msgStats.sent} icon={<MessageSquare size={18} />} color={COLORS.cyan} sub={`${deliveryRate}% delivered`} />
          <StatCard label="Replies" value={msgStats.inbound} icon={<MessageSquare size={18} />} color={COLORS.green} sub={`${replyRate}% reply rate`} />
          <StatCard label="Conversion" value={`${conversionRate}%`} icon={<Target size={18} />} color={COLORS.green} sub={`${counts.interested + counts.demo + counts.making_demo + counts.closed_won} interested+`} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Delivered" value={msgStats.delivered} icon={<CheckCircle size={18} />} color={COLORS.green} sub={`${msgStats.undelivered} undelivered`} />
          <StatCard label="Connected Calls" value={realCallTotal} icon={<Phone size={18} />} color={COLORS.amber} sub={`${noAnswerTotal} no-answer attempts excluded`} />
          <StatCard label="Campaigns" value={campaignStats.total} icon={<Zap size={18} />} color={COLORS.purple} sub={`${campaignStats.running} active · ${campaignStats.totalRuns} runs`} />
          <StatCard label="API Spend Since Key" value={`$${(Object.values(finderStats).reduce((s, f) => s + f.spend, 0)).toFixed(0)}`} icon={<Search size={18} />} color={COLORS.cyan} sub={`${Object.values(finderStats).reduce((s, f) => s + f.runs, 0)} runs from ${finderBudgetStartDate}`} />
        </div>

        {/* Country breakdown */}
        <ChartCard title="Leads by Country">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            {COUNTRIES.map(c => {
              const cl = countryLeads[c];
              const fs = finderStats[c];
              const costPerLead = fs.leads > 0 ? (fs.spend / fs.leads).toFixed(2) : '-';
              const contactRate = cl.total > 0 ? ((cl.contacted / cl.total) * 100).toFixed(0) : '0';
              const replyR = cl.contacted > 0 ? ((cl.replied / cl.contacted) * 100).toFixed(0) : '0';
              return (
                <div key={c} className="rounded-lg border border-border bg-secondary/30 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CountryFlag country={c} size={28} />
                    <div>
                      <div className="text-sm font-semibold text-foreground">{COUNTRY_NAMES[c]}</div>
                      <div className="text-xs text-muted-foreground">{fs.runs} runs · {fs.cities} cities · ${fs.spend.toFixed(0)}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-card rounded p-2">
                      <div className="text-lg font-bold text-foreground">{cl.total}</div>
                      <div className="text-muted-foreground">Total Leads</div>
                    </div>
                    <div className="bg-card rounded p-2">
                      <div className="text-lg font-bold" style={{ color: COLORS.green }}>{cl.phone}</div>
                      <div className="text-muted-foreground">Has Phone</div>
                    </div>
                    <div className="bg-card rounded p-2">
                      <div className="text-lg font-bold" style={{ color: COLORS.primary }}>{cl.contacted}</div>
                      <div className="text-muted-foreground">Contacted ({contactRate}%)</div>
                    </div>
                    <div className="bg-card rounded p-2">
                      <div className="text-lg font-bold" style={{ color: COLORS.cyan }}>{cl.replied}</div>
                      <div className="text-muted-foreground">Replied ({replyR}%)</div>
                    </div>
                    <div className="bg-card rounded p-2">
                      <div className="text-lg font-bold" style={{ color: c === 'SE' ? COLORS.amber : COLORS.cyan }}>
                        {c === 'SE' ? cl.callOnly : cl.smsOnly}
                      </div>
                      <div className="text-muted-foreground">{c === 'SE' ? 'Call List' : 'SMS Queue'}</div>
                    </div>
                    <div className="bg-card rounded p-2">
                      <div className="text-lg font-bold" style={{ color: COLORS.purple }}>${costPerLead}</div>
                      <div className="text-muted-foreground">Cost/Lead</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={COUNTRIES.map(c => ({
              name: COUNTRY_NAMES[c],
              leads: countryLeads[c].total,
              contacted: countryLeads[c].contacted,
              replied: countryLeads[c].replied,
              fill: c === 'SE' ? COLORS.primary : c === 'NO' ? COLORS.red : c === 'DK' ? COLORS.amber : c === 'UK' ? COLORS.cyan : COLORS.purple,
            }))} margin={{ left: 10, right: 10 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(215, 15%, 50%)" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} />
              <Tooltip
                contentStyle={{ background: "hsl(222, 24%, 10%)", border: "1px solid hsl(222, 22%, 16%)", borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="leads" name="Total" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
              <Bar dataKey="contacted" name="Contacted" fill={COLORS.cyan} radius={[4, 4, 0, 0]} />
              <Bar dataKey="replied" name="Replied" fill={COLORS.green} radius={[4, 4, 0, 0]} />
              <Legend wrapperStyle={{ fontSize: 11, color: "hsl(215, 15%, 50%)" }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Charts row 1 */}
        <div className="grid gap-4 md:grid-cols-2">
          <ChartCard title="Lead Funnel">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={funnelData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(215, 15%, 50%)" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(215, 15%, 50%)" }} width={80} />
                <Tooltip
                  contentStyle={{ background: "hsl(222, 24%, 10%)", border: "1px solid hsl(222, 22%, 16%)", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "hsl(210, 20%, 92%)" }}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {funnelData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="SMS Delivery Breakdown">
            {smsPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={smsPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {smsPieData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(222, 24%, 10%)", border: "1px solid hsl(222, 22%, 16%)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    wrapperStyle={{ fontSize: 11, color: "hsl(215, 15%, 50%)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No SMS data yet</div>
            )}
          </ChartCard>
        </div>

        {/* Outreach stages + Daily activity */}
        <div className="grid gap-4 md:grid-cols-2">
          <ChartCard title="Outreach Stages">
            {outreachStages.length > 0 ? (
              <div className="space-y-2">
                {outreachStages.map(s => {
                  const total = outreachStages.reduce((sum, x) => sum + x.count, 0);
                  const pct = total > 0 ? (s.count / total * 100) : 0;
                  const labels: Record<string, string> = {
                    none: 'Not Contacted',
                    sms_sent: 'SMS Sent',
                    no_reply_call: 'Moved to Call',
                    replied: 'Replied',
                    opted_out: 'Opted Out',
                  };
                  return (
                    <div key={s.stage}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{labels[s.stage] || s.stage}</span>
                        <span className="text-foreground font-medium">{s.count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(1, pct)}%`, background: stageColors[s.stage] || COLORS.muted }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No outreach data yet</div>
            )}
          </ChartCard>

          <ChartCard title="Daily Outreach (14 days)">
            {dailyActivity.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={dailyActivity} margin={{ left: -10, right: 10 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(222, 24%, 10%)", border: "1px solid hsl(222, 22%, 16%)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="gmails" name="Gmails sent" stackId="1" stroke={COLORS.cyan} fill={COLORS.cyan} fillOpacity={0.3} />
                  <Area type="monotone" dataKey="callsSent" name="Calls sent" stackId="1" stroke={COLORS.amber} fill={COLORS.amber} fillOpacity={0.3} />
                  <Area type="monotone" dataKey="connected" name="Connected calls" stackId="1" stroke={COLORS.green} fill={COLORS.green} fillOpacity={0.3} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "hsl(215, 15%, 50%)" }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No activity yet</div>
            )}
          </ChartCard>
        </div>

        {/* Call outcomes */}
        <ChartCard title="Call Outcomes">
          {callStats.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={callStats} margin={{ left: -10, right: 10 }}>
                <XAxis dataKey="outcome" tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} />
                <Tooltip
                  contentStyle={{ background: "hsl(222, 24%, 10%)", border: "1px solid hsl(222, 22%, 16%)", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {callStats.map((entry, i) => (
                    <Cell key={i} fill={outcomeColors[entry.outcome] || COLORS.muted} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No call data yet</div>
          )}
        </ChartCard>

        {/* Pipeline breakdown */}
        <ChartCard title="Pipeline Breakdown">
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {[
              { label: "Not Contacted", value: counts.not_contacted, color: COLORS.muted },
              { label: "Contacted", value: counts.contacted, color: COLORS.primary },
              { label: "Answered", value: counts.answered, color: COLORS.cyan },
              { label: "Interested", value: counts.interested, color: COLORS.green },
              { label: "Demo", value: counts.demo, color: COLORS.purple },
              { label: "Unsure", value: counts.unsure, color: COLORS.amber },
              { label: "Not Interest.", value: counts.not_interested, color: COLORS.red },
              { label: "Won", value: counts.closed_won, color: COLORS.green },
              { label: "Lost", value: counts.closed_lost, color: COLORS.red },
              { label: "Callbacks", value: counts.callbacks, color: COLORS.amber },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-secondary/40 p-3 text-center">
                <p className="text-lg font-bold text-foreground">{s.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{s.label}</p>
                <div className="h-1 rounded-full mt-2" style={{ background: `${s.color}30` }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: counts.total > 0 ? `${Math.max(2, (s.value / counts.total) * 100)}%` : "0%",
                      background: s.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </AppLayout>
  );
}
