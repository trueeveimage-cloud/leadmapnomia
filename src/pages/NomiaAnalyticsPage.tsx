import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarCheck, Mail, MessageSquareReply, PhoneCall, Trophy } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { fetchNomiaWorkspaceSnapshot, getNomiaPipelineStage } from '@/lib/nomiaWorkspace';
import { toast } from 'sonner';

type Snapshot = Awaited<ReturnType<typeof fetchNomiaWorkspaceSnapshot>>;

function Rate({ label, value, numerator, denominator, icon: Icon }: { label: string; value: string; numerator: number; denominator: number; icon: typeof Mail }) {
  return <div className="border border-border bg-card p-4"><div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"><span>{label}</span><Icon size={15} /></div><div className="mt-4 text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-muted-foreground">{numerator.toLocaleString()} of {denominator.toLocaleString()}</div></div>;
}

export default function NomiaAnalyticsPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  useEffect(() => { fetchNomiaWorkspaceSnapshot().then(setData).catch(error => toast.error(error.message)); }, []);
  const metrics = useMemo(() => {
    const leads = data?.leads || [];
    const messages = data?.messages || [];
    const appointments = data?.appointments.filter(item => item.status !== 'cancelled') || [];
    const outboundEmails = messages.filter(item => item.channel === 'email' && item.direction === 'outbound' && ['sent', 'delivered'].includes(item.status));
    const inboundEmails = messages.filter(item => item.channel === 'email' && item.direction === 'inbound');
    const called = leads.filter(lead => (lead.call_attempts || 0) > 0 || lead.outreach_state === 'called');
    const replied = leads.filter(lead => lead.has_replied || lead.outreach_state === 'replied');
    const won = leads.filter(lead => getNomiaPipelineStage(lead) === 'won');
    const rate = (n: number, d: number) => d ? `${((n / d) * 100).toFixed(1)}%` : '0.0%';
    return { leads, outboundEmails, inboundEmails, called, replied, appointments, won, rate };
  }, [data]);
  return <AppLayout><div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6"><header className="border-b border-border pb-5"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Nomia</div><h1 className="mt-1 text-2xl font-semibold">Sales analytics</h1><p className="mt-1 text-sm text-muted-foreground">Measure conversations that become booked meetings and website sales.</p></header><div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3"><Rate label="Email reply rate" value={metrics.rate(metrics.inboundEmails.length, metrics.outboundEmails.length)} numerator={metrics.inboundEmails.length} denominator={metrics.outboundEmails.length} icon={MessageSquareReply} /><Rate label="Lead reply rate" value={metrics.rate(metrics.replied.length, metrics.leads.length)} numerator={metrics.replied.length} denominator={metrics.leads.length} icon={Mail} /><Rate label="Call coverage" value={metrics.rate(metrics.called.length, metrics.leads.length)} numerator={metrics.called.length} denominator={metrics.leads.length} icon={PhoneCall} /><Rate label="Meeting rate" value={metrics.rate(metrics.appointments.length, metrics.leads.length)} numerator={metrics.appointments.length} denominator={metrics.leads.length} icon={CalendarCheck} /><Rate label="Close rate" value={metrics.rate(metrics.won.length, metrics.appointments.length)} numerator={metrics.won.length} denominator={metrics.appointments.length} icon={Trophy} /><Rate label="Total Nomia leads" value={metrics.leads.length.toLocaleString()} numerator={metrics.leads.length} denominator={metrics.leads.length} icon={BarChart3} /></div><section className="mt-5 border border-border bg-card p-5"><h2 className="text-sm font-semibold">Interpretation</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">The headline outcome is a booked meeting. Delivery and call attempts are activity metrics; they are not counted as success unless they produce a reply, appointment, or closed sale.</p></section></div></AppLayout>;
}
