import AppLayout from "@/components/AppLayout";
import { useCRM } from "@/context/CRMContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, AreaChart, Area } from "recharts";
import { TrendingUp, Users, Phone, MessageSquare, Target, ArrowUpRight, ArrowDownRight } from "lucide-react";

const COLORS = {
  primary: "hsl(213, 94%, 58%)",
  green: "hsl(142, 69%, 45%)",
  amber: "hsl(38, 95%, 55%)",
  red: "hsl(0, 72%, 55%)",
  purple: "hsl(262, 83%, 65%)",
  cyan: "hsl(192, 91%, 52%)",
  muted: "hsl(215, 15%, 50%)",
};

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
  }, []);

  // Funnel data
  const funnelData = [
    { name: "Total Leads", value: counts.total, fill: COLORS.primary },
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

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of your outreach pipeline</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total Leads" value={counts.total} icon={<Users size={18} />} color={COLORS.primary} />
          <StatCard label="SMS Sent" value={msgStats.sent} icon={<MessageSquare size={18} />} color={COLORS.cyan} sub={`${replyRate}% reply rate`} />
          <StatCard label="Calls Made" value={callStats.reduce((s, c) => s + c.count, 0)} icon={<Phone size={18} />} color={COLORS.amber} />
          <StatCard label="Conversion" value={`${conversionRate}%`} icon={<Target size={18} />} color={COLORS.green} sub={`${counts.interested + counts.demo + counts.closed_won} interested+`} />
        </div>

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
