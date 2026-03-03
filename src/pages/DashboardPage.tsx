import AppLayout from "@/components/AppLayout";
import { useCRM } from "@/context/CRMContext";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, AreaChart, Area } from "recharts";
import { TrendingUp, Users, Phone, MessageSquare, Target, ArrowUpRight, ArrowDownRight, Globe, Mail, Search } from "lucide-react";
import { findCity, Country, getCitiesByCountry } from "@/lib/cities";

const COLORS = {
  primary: "hsl(213, 94%, 58%)",
  green: "hsl(142, 69%, 45%)",
  amber: "hsl(38, 95%, 55%)",
  red: "hsl(0, 72%, 55%)",
  purple: "hsl(262, 83%, 65%)",
  cyan: "hsl(192, 91%, 52%)",
  muted: "hsl(215, 15%, 50%)",
};

const FLAGS: Record<Country, string> = { SE: '🇸🇪', NO: '🇳🇴', DK: '🇩🇰' };
const COUNTRY_NAMES: Record<Country, string> = { SE: 'Sweden', NO: 'Norway', DK: 'Denmark' };

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
  const [msgStats, setMsgStats] = useState({ sent: 0, delivered: 0, failed: 0, inbound: 0 });
  const [callStats, setCallStats] = useState<{ outcome: string; count: number }[]>([]);
  const [dailyActivity, setDailyActivity] = useState<{ date: string; sms: number; calls: number }[]>([]);
  const [countryLeads, setCountryLeads] = useState<Record<Country, { total: number; phone: number; email: number; smsOnly: number; callOnly: number }>>({
    SE: { total: 0, phone: 0, email: 0, smsOnly: 0, callOnly: 0 },
    NO: { total: 0, phone: 0, email: 0, smsOnly: 0, callOnly: 0 },
    DK: { total: 0, phone: 0, email: 0, smsOnly: 0, callOnly: 0 },
  });
  const [finderStats, setFinderStats] = useState<Record<Country, { runs: number; leads: number; spend: number }>>({
    SE: { runs: 0, leads: 0, spend: 0 },
    NO: { runs: 0, leads: 0, spend: 0 },
    DK: { runs: 0, leads: 0, spend: 0 },
  });

  useEffect(() => {
    // Fetch SMS stats
    Promise.all([
      supabase.from("message_logs").select("id", { count: "exact", head: true }).eq("direction", "outbound"),
      supabase.from("message_logs").select("id", { count: "exact", head: true }).eq("direction", "outbound").eq("status", "delivered"),
      supabase.from("message_logs").select("id", { count: "exact", head: true }).eq("direction", "outbound").eq("status", "failed"),
      supabase.from("message_logs").select("id", { count: "exact", head: true }).eq("direction", "inbound"),
    ]).then(([sent, delivered, failed, inbound]) => {
      setMsgStats({
        sent: sent.count || 0,
        delivered: delivered.count || 0,
        failed: failed.count || 0,
        inbound: inbound.count || 0,
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

    // Fetch daily activity (last 14 days)
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
    supabase
      .from("message_logs")
      .select("created_at, direction")
      .gte("created_at", fourteenDaysAgo)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        const dayMap: Record<string, { sms: number; calls: number }> = {};
        (data || []).forEach((m: any) => {
          const day = m.created_at.slice(0, 10);
          if (!dayMap[day]) dayMap[day] = { sms: 0, calls: 0 };
          if (m.direction === "outbound") dayMap[day].sms++;
          else dayMap[day].calls++;
        });
        setDailyActivity(
          Object.entries(dayMap).map(([date, v]) => ({ date: date.slice(5), ...v }))
        );
      });

    // Fetch leads by country (using address to detect)
    (async () => {
      const PAGE_SIZE = 1000;
      const allLeads: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase.from('leads').select('address, phone, email, section, outreach_opt_out, needs_call').range(from, from + PAGE_SIZE - 1);
        if (error || !data || data.length === 0) break;
        allLeads.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      const stats: Record<Country, { total: number; phone: number; email: number; smsOnly: number; callOnly: number }> = {
        SE: { total: 0, phone: 0, email: 0, smsOnly: 0, callOnly: 0 },
        NO: { total: 0, phone: 0, email: 0, smsOnly: 0, callOnly: 0 },
        DK: { total: 0, phone: 0, email: 0, smsOnly: 0, callOnly: 0 },
      };

      for (const lead of allLeads) {
        const addr = (lead.address || '').toLowerCase();
        let country: Country = 'SE';
        if (addr.includes('norge') || addr.includes('norway') || addr.includes(', no')) country = 'NO';
        else if (addr.includes('danmark') || addr.includes('denmark') || addr.includes(', dk')) country = 'DK';
        else {
          // Try matching city names
          for (const c of getCitiesByCountry('NO')) {
            if (addr.includes(c.name.toLowerCase())) { country = 'NO'; break; }
          }
          if (country === 'SE') {
            for (const c of getCitiesByCountry('DK')) {
              if (addr.includes(c.name.toLowerCase())) { country = 'DK'; break; }
            }
          }
        }
        stats[country].total++;
        if (lead.phone) stats[country].phone++;
        if (lead.email) stats[country].email++;
        if (lead.needs_call) stats[country].callOnly++;
        else if (lead.phone && !lead.outreach_opt_out) stats[country].smsOnly++;
      }
      setCountryLeads(stats);
    })();

    // Fetch finder stats by country
    (async () => {
      const { data: runs } = await supabase.from('finder_runs').select('city, stats');
      const fStats: Record<Country, { runs: number; leads: number; spend: number }> = {
        SE: { runs: 0, leads: 0, spend: 0 },
        NO: { runs: 0, leads: 0, spend: 0 },
        DK: { runs: 0, leads: 0, spend: 0 },
      };
      for (const run of (runs || [])) {
        const city = findCity(run.city);
        const c = city?.country || 'SE';
        fStats[c].runs++;
        const s = run.stats as any;
        fStats[c].leads += (s?.noWebsiteWithPhone ?? 0) + (s?.noWebsiteEmailOnly ?? 0);
        fStats[c].spend += ((s?.detailsFetched ?? 0) * 0.017) + (0.032 * 2);
      }
      setFinderStats(fStats);
    })();
  }, []);

  // Funnel data
  const funnelData = [
    { name: "Reachable", value: counts.total - counts.hasWebsite - counts.missing, fill: COLORS.primary },
    { name: "Contacted", value: counts.contacted + counts.answered + counts.interested + counts.demo + counts.closed_won, fill: COLORS.cyan },
    { name: "Answered", value: counts.answered + counts.interested + counts.demo + counts.closed_won, fill: COLORS.green },
    { name: "Interested", value: counts.interested + counts.demo + counts.closed_won, fill: COLORS.amber },
    { name: "Demo", value: counts.demo + counts.closed_won, fill: COLORS.purple },
    { name: "Won", value: counts.closed_won, fill: COLORS.green },
  ];

  // SMS pie data
  const smsPieData = [
    { name: "Delivered", value: msgStats.delivered, fill: COLORS.green },
    { name: "Queued", value: Math.max(0, msgStats.sent - msgStats.delivered - msgStats.failed), fill: COLORS.amber },
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

  const conversionRate = counts.total > 0
    ? ((counts.interested + counts.demo + counts.closed_won) / counts.total * 100).toFixed(1)
    : "0";

  const replyRate = msgStats.sent > 0
    ? (msgStats.inbound / msgStats.sent * 100).toFixed(1)
    : "0";

  // Country chart data
  const countryChartData = (['SE', 'NO', 'DK'] as Country[]).map(c => ({
    name: `${FLAGS[c]} ${COUNTRY_NAMES[c]}`,
    flag: FLAGS[c],
    country: COUNTRY_NAMES[c],
    leads: countryLeads[c].total,
    phone: countryLeads[c].phone,
    email: countryLeads[c].email,
    sms: countryLeads[c].smsOnly,
    call: countryLeads[c].callOnly,
    fill: c === 'SE' ? COLORS.primary : c === 'NO' ? COLORS.red : COLORS.amber,
  }));

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Statistics</h1>
          <p className="text-sm text-muted-foreground">Overview of your outreach pipeline</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Reachable Leads" value={counts.total - counts.hasWebsite - counts.missing} icon={<Users size={18} />} color={COLORS.primary} sub={`${counts.total.toLocaleString()} total`} />
          <StatCard label="SMS Sent" value={msgStats.sent} icon={<MessageSquare size={18} />} color={COLORS.cyan} sub={`${replyRate}% reply rate`} />
          <StatCard label="Calls Made" value={callStats.reduce((s, c) => s + c.count, 0)} icon={<Phone size={18} />} color={COLORS.amber} />
          <StatCard label="Conversion" value={`${conversionRate}%`} icon={<Target size={18} />} color={COLORS.green} sub={`${counts.interested + counts.demo + counts.closed_won} interested+`} />
        </div>

        {/* Country breakdown */}
        <ChartCard title="Leads by Country">
          <div className="grid grid-cols-3 gap-3 mb-4">
            {(['SE', 'NO', 'DK'] as Country[]).map(c => {
              const cl = countryLeads[c];
              const fs = finderStats[c];
              return (
                <div key={c} className="rounded-lg border border-border bg-secondary/30 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{FLAGS[c]}</span>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{COUNTRY_NAMES[c]}</div>
                      <div className="text-xs text-muted-foreground">{fs.runs} runs · ${fs.spend.toFixed(0)} spent</div>
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
                      <div className="text-lg font-bold" style={{ color: COLORS.primary }}>{cl.email}</div>
                      <div className="text-muted-foreground">Has Email</div>
                    </div>
                    <div className="bg-card rounded p-2">
                      <div className="text-lg font-bold" style={{ color: c === 'SE' ? COLORS.amber : COLORS.cyan }}>
                        {c === 'SE' ? cl.callOnly : cl.smsOnly}
                      </div>
                      <div className="text-muted-foreground">{c === 'SE' ? 'Call List' : 'SMS Queue'}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={countryChartData} margin={{ left: 10, right: 10 }}>
              <XAxis dataKey="country" tick={{ fontSize: 12, fill: "hsl(215, 15%, 50%)" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} />
              <Tooltip
                contentStyle={{ background: "hsl(222, 24%, 10%)", border: "1px solid hsl(222, 22%, 16%)", borderRadius: 8, fontSize: 12 }}
                formatter={(value: number, name: string) => [value, name === 'leads' ? 'Total' : name === 'sms' ? 'SMS Queue' : name === 'call' ? 'Call List' : name]}
              />
              <Bar dataKey="leads" name="Total" radius={[4, 4, 0, 0]}>
                {countryChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
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

          <ChartCard title="SMS Delivery">
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

        {/* Charts row 2 */}
        <div className="grid gap-4 md:grid-cols-2">
          <ChartCard title="Daily Activity (14 days)">
            {dailyActivity.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={dailyActivity} margin={{ left: -10, right: 10 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(222, 24%, 10%)", border: "1px solid hsl(222, 22%, 16%)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="sms" stackId="1" stroke={COLORS.primary} fill={COLORS.primary} fillOpacity={0.3} />
                  <Area type="monotone" dataKey="calls" stackId="1" stroke={COLORS.amber} fill={COLORS.amber} fillOpacity={0.3} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "hsl(215, 15%, 50%)" }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No activity yet</div>
            )}
          </ChartCard>

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
        </div>

        {/* Finder Performance by Country */}
        <ChartCard title="Finder Performance by Country">
          <div className="grid grid-cols-3 gap-3">
            {(['SE', 'NO', 'DK'] as Country[]).map(c => {
              const fs = finderStats[c];
              const cities = getCitiesByCountry(c);
              const costPerLead = fs.leads > 0 ? (fs.spend / fs.leads).toFixed(2) : '-';
              return (
                <div key={c} className="rounded-lg border border-border bg-secondary/30 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{FLAGS[c]}</span>
                    <span className="text-sm font-semibold text-foreground">{COUNTRY_NAMES[c]}</span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Finder Runs</span><span className="font-medium text-foreground">{fs.runs}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Leads Found</span><span className="font-medium" style={{ color: COLORS.green }}>{fs.leads}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Est. Spend</span><span className="font-medium text-foreground">${fs.spend.toFixed(0)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Cost/Lead</span><span className="font-medium" style={{ color: COLORS.cyan }}>${costPerLead}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Cities</span><span className="font-medium text-foreground">{cities.length}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
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
