import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarCheck, Mail, MessageSquareReply, PhoneCall, Trophy, UserRound } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { fetchNomiaWorkspaceSnapshot, getNomiaCallOutcome, getNomiaPipelineStage, type NomiaCallOutcome } from '@/lib/nomiaWorkspace';
import { toast } from 'sonner';

type Snapshot = Awaited<ReturnType<typeof fetchNomiaWorkspaceSnapshot>>;

function Rate({ label, value, numerator, denominator, icon: Icon }: { label: string; value: string; numerator: number; denominator: number; icon: typeof Mail }) {
  return <div className="border border-border bg-card p-4"><div className="flex items-center justify-between text-xs font-semibold uppercase text-muted-foreground"><span>{label}</span><Icon size={15} /></div><div className="mt-4 text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-muted-foreground">{numerator.toLocaleString()} of {denominator.toLocaleString()}</div></div>;
}

const OUTCOME_LABELS: Record<NomiaCallOutcome, string> = {
  interested: 'Interested',
  callback: 'Callbacks',
  no_answer: 'No answer',
  not_interested: 'Not interested',
  demo: 'Demo requested',
  wrong_number: 'Wrong number',
};

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
    const callResults = (data?.activities || []).map(activity => ({ activity, outcome: getNomiaCallOutcome(activity) })).filter((item): item is typeof item & { outcome: NomiaCallOutcome } => item.outcome !== null);
    const outcomes = (Object.keys(OUTCOME_LABELS) as NomiaCallOutcome[]).reduce<Record<NomiaCallOutcome, number>>((result, outcome) => {
      result[outcome] = callResults.filter(item => item.outcome === outcome).length;
      return result;
    }, { interested: 0, callback: 0, no_answer: 0, not_interested: 0, demo: 0, wrong_number: 0 });
    const callers = new Map<string, { name: string; calls: number; interested: number; demos: number; callbacks: number }>();
    callResults.forEach(({ activity, outcome }) => {
      const name = String(activity.payload?.operator || 'Earlier call records');
      const caller = callers.get(name) || { name, calls: 0, interested: 0, demos: 0, callbacks: 0 };
      caller.calls += 1;
      if (outcome === 'interested') caller.interested += 1;
      if (outcome === 'demo') caller.demos += 1;
      if (outcome === 'callback') caller.callbacks += 1;
      callers.set(name, caller);
    });
    const callerPerformance = [...callers.values()].sort((a, b) => b.calls - a.calls);
    const rate = (n: number, d: number) => d ? `${((n / d) * 100).toFixed(1)}%` : '0.0%';
    return { leads, outboundEmails, inboundEmails, called, replied, appointments, won, callResults, outcomes, callerPerformance, rate };
  }, [data]);

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
        <header className="border-b border-border pb-5">
          <div className="text-xs font-semibold uppercase text-emerald-300">Nomia</div>
          <h1 className="mt-1 text-2xl font-semibold">Sales analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Calls, conversations, meetings and website sales.</p>
        </header>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Rate label="Call interest rate" value={metrics.rate(metrics.outcomes.interested + metrics.outcomes.demo, metrics.callResults.length)} numerator={metrics.outcomes.interested + metrics.outcomes.demo} denominator={metrics.callResults.length} icon={PhoneCall} />
          <Rate label="Email reply rate" value={metrics.rate(metrics.inboundEmails.length, metrics.outboundEmails.length)} numerator={metrics.inboundEmails.length} denominator={metrics.outboundEmails.length} icon={MessageSquareReply} />
          <Rate label="Call coverage" value={metrics.rate(metrics.called.length, metrics.leads.length)} numerator={metrics.called.length} denominator={metrics.leads.length} icon={PhoneCall} />
          <Rate label="Meeting rate" value={metrics.rate(metrics.appointments.length, metrics.leads.length)} numerator={metrics.appointments.length} denominator={metrics.leads.length} icon={CalendarCheck} />
          <Rate label="Close rate" value={metrics.rate(metrics.won.length, metrics.appointments.length)} numerator={metrics.won.length} denominator={metrics.appointments.length} icon={Trophy} />
          <Rate label="Total Nomia leads" value={metrics.leads.length.toLocaleString()} numerator={metrics.leads.length} denominator={metrics.leads.length} icon={BarChart3} />
        </div>

        <section className="mt-5 border border-border bg-card">
          <div className="border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">Cold-call outcomes</h2><p className="text-xs text-muted-foreground">All saved results, including the earlier call workflow.</p></div>
          <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-3 lg:grid-cols-6">
            {(Object.keys(OUTCOME_LABELS) as NomiaCallOutcome[]).map(outcome => <div key={outcome} className="px-4 py-4"><div className="text-xs text-muted-foreground">{OUTCOME_LABELS[outcome]}</div><div className="mt-2 text-2xl font-semibold">{metrics.outcomes[outcome].toLocaleString()}</div><div className="mt-1 text-xs text-muted-foreground">{metrics.rate(metrics.outcomes[outcome], metrics.callResults.length)}</div></div>)}
          </div>
        </section>

        <section className="mt-5 border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3"><UserRound size={15} className="text-muted-foreground" /><div><h2 className="text-sm font-semibold">Caller performance</h2><p className="text-xs text-muted-foreground">Results are grouped by the caller name entered in Call Desk.</p></div></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-4 py-3 font-medium">Caller</th><th className="px-4 py-3 font-medium">Calls</th><th className="px-4 py-3 font-medium">Interested</th><th className="px-4 py-3 font-medium">Demo</th><th className="px-4 py-3 font-medium">Callbacks</th><th className="px-4 py-3 font-medium">Positive rate</th></tr></thead>
              <tbody>{metrics.callerPerformance.map(caller => <tr key={caller.name} className="border-b border-border last:border-0"><td className="px-4 py-3 font-medium">{caller.name}</td><td className="px-4 py-3">{caller.calls}</td><td className="px-4 py-3 text-emerald-300">{caller.interested}</td><td className="px-4 py-3">{caller.demos}</td><td className="px-4 py-3">{caller.callbacks}</td><td className="px-4 py-3">{metrics.rate(caller.interested + caller.demos, caller.calls)}</td></tr>)}</tbody>
            </table>
            {metrics.callerPerformance.length === 0 && <div className="px-4 py-10 text-center text-sm text-muted-foreground">No saved call outcomes yet.</div>}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
