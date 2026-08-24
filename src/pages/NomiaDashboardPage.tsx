import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck, CheckCircle2, Clock3, Mail, PhoneCall, RefreshCw, ShieldAlert, Users } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { fetchNomiaWorkspaceSnapshot, getNomiaPipelineStage, isDoNotContact, isSwedishLead } from '@/lib/nomiaWorkspace';
import type { Lead } from '@/lib/supabase';
import { toast } from 'sonner';

type Snapshot = Awaited<ReturnType<typeof fetchNomiaWorkspaceSnapshot>>;

function Metric({ label, value, detail, icon: Icon, tone = 'neutral' }: { label: string; value: number; detail: string; icon: typeof Users; tone?: 'neutral' | 'green' | 'amber' | 'blue' }) {
  const tones = {
    neutral: 'border-border text-foreground',
    green: 'border-emerald-400/25 text-emerald-300',
    amber: 'border-amber-400/25 text-amber-300',
    blue: 'border-sky-400/25 text-sky-300',
  };
  return (
    <div className={`border bg-card p-4 ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
        <Icon size={16} />
      </div>
      <div className="mt-3 text-2xl font-semibold text-foreground">{value.toLocaleString()}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

export default function NomiaDashboardPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setSnapshot(await fetchNomiaWorkspaceSnapshot()); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not load Nomia'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const leads = snapshot?.leads || [];
    const appointments = snapshot?.appointments || [];
    const meetingLeadIds = new Set(appointments.filter(a => a.status !== 'cancelled').map(a => a.lead_id));
    const now = Date.now();
    const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
    const eligibleCalls = leads.filter(l => isSwedishLead(l) && !!l.phone && !isDoNotContact(l) && ['not_contacted', 'callback'].includes(l.status));
    const followups = leads.filter(l => l.next_action_at && new Date(l.next_action_at).getTime() <= endToday.getTime() && !isDoNotContact(l));
    const unreadReplies = leads.filter(l => l.last_inbound_at && (!l.read_at || new Date(l.last_inbound_at) > new Date(l.read_at)));
    const meetings = appointments.filter(a => a.status !== 'cancelled' && new Date(a.scheduled_at).getTime() >= now);
    const won = leads.filter(l => getNomiaPipelineStage(l, meetingLeadIds.has(l.id)) === 'won');
    const reviewBatches = (snapshot?.campaigns || []).filter(c => c.channel === 'email' && ['ready_for_review', 'approved'].includes(c.approval_status));
    return { leads, eligibleCalls, followups, unreadReplies, meetings, won, reviewBatches };
  }, [snapshot]);

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Nomia workspace</div>
            <h1 className="mt-1 text-2xl font-semibold">Sales command center</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sweden-first website sales. Calls and Gmail remain paused until explicitly approved.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
        </header>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Metric label="Nomia leads" value={stats.leads.length} detail="Separate from Leadmap" icon={Users} />
          <Metric label="Call queue" value={stats.eligibleCalls.length} detail="Swedish, callable leads" icon={PhoneCall} tone="blue" />
          <Metric label="Email review" value={stats.reviewBatches.length} detail="Awaiting approval or send" icon={Mail} tone="amber" />
          <Metric label="Unread replies" value={stats.unreadReplies.length} detail="Needs a response" icon={Clock3} tone="amber" />
          <Metric label="Meetings" value={stats.meetings.length} detail="Upcoming booked meetings" icon={CalendarCheck} tone="green" />
          <Metric label="Closed won" value={stats.won.length} detail="Website sales" icon={CheckCircle2} tone="green" />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Today</h2>
                <p className="text-xs text-muted-foreground">Work the highest-value actions first.</p>
              </div>
              <ShieldAlert size={17} className="text-amber-300" />
            </div>
            <div className="divide-y divide-border">
              {[
                { to: '/nomia/calls', label: 'Work call queue', value: stats.eligibleCalls.length, detail: 'Manual calls are primary' },
                { to: '/nomia/email', label: 'Review Gmail batches', value: stats.reviewBatches.length, detail: 'Preview every recipient before approval' },
                { to: '/nomia/inbox', label: 'Answer replies', value: stats.unreadReplies.length, detail: 'Turn conversations into meetings' },
                { to: '/nomia/pipeline', label: 'Complete follow-ups', value: stats.followups.length, detail: 'Due today or overdue' },
              ].map(item => (
                <Link key={item.to} to={item.to} className="group flex items-center gap-4 px-4 py-4 hover:bg-secondary/50">
                  <div className="grid h-9 w-9 place-items-center rounded-md border border-border bg-background text-sm font-semibold">{item.value}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-xs text-muted-foreground">{item.detail}</div>
                  </div>
                  <ArrowRight size={15} className="text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
                </Link>
              ))}
            </div>
          </section>

          <section className="border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Upcoming meetings</h2>
              <p className="text-xs text-muted-foreground">The primary success outcome for Nomia.</p>
            </div>
            <div className="divide-y divide-border">
              {stats.meetings.slice(0, 6).map(meeting => {
                const lead = stats.leads.find((item: Lead) => item.id === meeting.lead_id);
                return (
                  <div key={meeting.id} className="px-4 py-3">
                    <div className="text-sm font-medium">{lead?.name || meeting.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{new Date(meeting.scheduled_at).toLocaleString('sv-SE')}</div>
                  </div>
                );
              })}
              {!loading && stats.meetings.length === 0 && <div className="px-4 py-8 text-center text-sm text-muted-foreground">No upcoming meetings yet.</div>}
            </div>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
