import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleOff,
  Clock3,
  Copy,
  Loader2,
  MapPin,
  Phone,
  PhoneCall,
  RefreshCw,
  ShieldAlert,
  Square,
  UserRound,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  acquireOutreachLock,
  createNotification,
  fetchLeads,
  getSetting,
  logActivity,
  setSetting,
  updateLead,
  type Lead,
} from '@/lib/supabase';
import { isDoNotContact, isSwedishLead } from '@/lib/nomiaWorkspace';
import { toast } from 'sonner';

type CallStep = 'ready' | 'outcome' | 'callback';
type SimpleOutcome = 'interested' | 'callback' | 'no_answer' | 'not_interested' | 'demo' | 'wrong_number';

const OUTCOMES: Array<{ key: SimpleOutcome; label: string; detail: string; tone: string }> = [
  { key: 'interested', label: 'Interested', detail: 'Follow up tomorrow', tone: 'border-emerald-400/35 text-emerald-300 hover:bg-emerald-400/10' },
  { key: 'callback', label: 'Call back', detail: 'Choose date and time', tone: 'border-blue-400/35 text-blue-300 hover:bg-blue-400/10' },
  { key: 'no_answer', label: 'No answer', detail: 'Retry next workday', tone: 'border-amber-400/35 text-amber-300 hover:bg-amber-400/10' },
  { key: 'not_interested', label: 'Not interested', detail: 'Remove from call queue', tone: 'border-border text-foreground hover:bg-muted' },
  { key: 'demo', label: 'Demo requested', detail: 'Add to follow-up', tone: 'border-violet-400/35 text-violet-300 hover:bg-violet-400/10' },
  { key: 'wrong_number', label: 'Wrong number', detail: 'Block future outreach', tone: 'border-red-400/35 text-red-300 hover:bg-red-400/10' },
];

function nextWorkday(hour = 10) {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function toDateTimeLocal(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export default function NomiaCallsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [masterPaused, setMasterPaused] = useState(true);
  const [step, setStep] = useState<CallStep>('ready');
  const [notes, setNotes] = useState('');
  const [callbackAt, setCallbackAt] = useState(() => toDateTimeLocal(nextWorkday()));
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [completedToday, setCompletedToday] = useState(0);
  const [callerName, setCallerName] = useState(() => localStorage.getItem('nomia.callOperator') || '');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, paused] = await Promise.all([
        fetchLeads({ product: 'nomia' }),
        getSetting('outreach_master_paused'),
      ]);
      setLeads(rows);
      setMasterPaused(paused !== 'false');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load the call queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { localStorage.setItem('nomia.callOperator', callerName.trim()); }, [callerName]);

  const now = Date.now();
  const callable = useMemo(() => leads
    .filter((lead) => {
      if (!isSwedishLead(lead) || !(lead.phone_e164 || lead.phone) || isDoNotContact(lead)) return false;
      if (!['not_contacted', 'callback', 'call_first', 'no_answer'].includes(lead.status)) return false;
      if (lead.next_action_at && new Date(lead.next_action_at).getTime() > now) return false;
      return !skippedIds.has(lead.id);
    })
    .sort((a, b) => {
      const callbackA = a.status === 'callback' || a.status === 'no_answer' ? 0 : 1;
      const callbackB = b.status === 'callback' || b.status === 'no_answer' ? 0 : 1;
      if (callbackA !== callbackB) return callbackA - callbackB;
      const dueA = a.next_action_at ? new Date(a.next_action_at).getTime() : Number.MAX_SAFE_INTEGER;
      const dueB = b.next_action_at ? new Date(b.next_action_at).getTime() : Number.MAX_SAFE_INTEGER;
      return dueA - dueB || (b.potential_score || 0) - (a.potential_score || 0);
    }), [leads, now, skippedIds]);

  const upcomingCallbacks = useMemo(() => leads.filter((lead) =>
    lead.status === 'callback'
    && !!lead.next_action_at
    && new Date(lead.next_action_at).getTime() > now
    && !isDoNotContact(lead)
  ).length, [leads, now]);

  const lead = callable[0];

  const resetCall = () => {
    setStep('ready');
    setNotes('');
    setCallbackAt(toDateTimeLocal(nextWorkday()));
  };

  const startSession = async () => {
    try {
      const [gmail, ai, sms, partner] = await Promise.all([
        getSetting('nomia_gmail_paused'),
        getSetting('nomia_ai_calls_paused'),
        getSetting('nomia_sms_paused'),
        getSetting('partner_outreach_paused'),
      ]);
      if ([gmail, ai, sms, partner].some((value) => value !== 'true')) {
        toast.error('Manual session blocked: Gmail, AI calls, SMS and partner outreach must all remain paused.');
        return;
      }
      if (!window.confirm('Start a manual calling session? Only calls you press yourself can open. Database duplicate locks remain active.')) return;
      await setSetting('outreach_master_paused', 'false');
      setMasterPaused(false);
      await createNotification({
        type: 'manual_call_session_started',
        title: 'Manual call session started',
        message: callerName.trim() ? `${callerName.trim()} started calling.` : 'A manual Nomia call session started.',
        product: 'nomia',
      });
      toast.success('Manual calling session started');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start the calling session');
    }
  };

  const endSession = async () => {
    try {
      await setSetting('outreach_master_paused', 'true');
      setMasterPaused(true);
      resetCall();
      await createNotification({
        type: 'manual_call_session_ended',
        title: 'Manual call session ended',
        message: `${completedToday} call outcomes logged in this session.`,
        product: 'nomia',
      });
      toast.success('All outreach paused');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not pause outreach');
    }
  };

  const startCall = async () => {
    if (!lead) return;
    if (!callerName.trim()) {
      toast.error('Enter the caller name first');
      return;
    }
    setSaving(true);
    try {
      if (await getSetting('outreach_master_paused') !== 'false') {
        setMasterPaused(true);
        throw new Error('The calling session is paused. Ask the owner to start the session.');
      }
      const lock = await acquireOutreachLock(lead.id, 'call');
      if (!lock?.allowed) throw new Error(`Call blocked: ${String(lock?.reason || 'outreach locked').replace(/_/g, ' ')}`);
      await logActivity(lead.id, 'manual_call_started', {
        operator: callerName.trim(),
        phone: lead.phone_e164 || lead.phone,
        product: 'nomia',
      });
      setStep('outcome');
      window.location.href = `tel:${lead.phone_e164 || lead.phone}`;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open the call');
    } finally {
      setSaving(false);
    }
  };

  const saveOutcome = async (outcome: SimpleOutcome, customFollowUp?: Date) => {
    if (!lead) return;
    setSaving(true);
    try {
      const followUp = customFollowUp || (['interested', 'demo', 'no_answer'].includes(outcome) ? nextWorkday() : null);
      const contactedAt = new Date().toISOString();
      const base: Partial<Lead> = {
        call_attempts: (lead.call_attempts || 0) + 1,
        last_contacted_at: contactedAt,
        last_called_at: contactedAt,
        last_call_attempt_at: contactedAt,
        last_contact_method: 'manual_call',
        needs_call: false,
        caller_name: callerName.trim(),
        call_outcome_last: outcome,
        call_outcome: outcome,
      };
      let updates: Partial<Lead>;
      if (outcome === 'interested') updates = { ...base, status: 'interested', call_status: 'Interested', outreach_state: 'follow_up_needed', call_connected: true, next_action_at: followUp?.toISOString() || null };
      else if (outcome === 'demo') updates = { ...base, status: 'demo', call_status: 'Demo requested', outreach_state: 'follow_up_needed', call_connected: true, next_action_at: followUp?.toISOString() || null };
      else if (outcome === 'callback') updates = { ...base, status: 'callback', call_status: 'Interested', outreach_state: 'follow_up_needed', call_connected: true, next_action_at: followUp?.toISOString() || null };
      else if (outcome === 'no_answer') updates = { ...base, status: 'callback', call_status: 'No answer', outreach_state: 'called', call_connected: false, next_action_at: followUp?.toISOString() || null };
      else if (outcome === 'not_interested') updates = { ...base, status: 'not_interested', call_status: 'Not interested', outreach_state: 'called', call_connected: true, next_action_at: null };
      else updates = { ...base, status: 'not_interested', call_status: 'Do not contact', outreach_state: 'do_not_contact', call_connected: false, do_not_contact: true, outreach_opt_out: true, next_action_at: null };

      const updated = await updateLead(lead.id, updates);
      const label = OUTCOMES.find((item) => item.key === outcome)?.label || outcome;
      await logActivity(lead.id, 'manual_call_completed', {
        operator: callerName.trim(),
        outcome,
        notes: notes.trim() || null,
        follow_up_at: followUp?.toISOString() || null,
        product: 'nomia',
      });
      await createNotification({
        type: 'manual_call_completed',
        title: `${label}: ${lead.name}`,
        message: notes.trim() || `${callerName.trim()} logged a manual call outcome.`,
        payload: { outcome, operator: callerName.trim(), follow_up_at: followUp?.toISOString() || null },
        product: 'nomia',
        leadId: lead.id,
      });
      setLeads((previous) => previous.map((item) => item.id === updated.id ? updated : item));
      setCompletedToday((count) => count + 1);
      resetCall();
      toast.success(`${label} saved. Next lead ready.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the call outcome');
    } finally {
      setSaving(false);
    }
  };

  const saveCallback = () => {
    const date = new Date(callbackAt);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      toast.error('Choose a future callback time');
      return;
    }
    void saveOutcome('callback', date);
  };

  const skipLead = () => {
    if (!lead) return;
    setSkippedIds((previous) => new Set(previous).add(lead.id));
    resetCall();
  };

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-5xl px-4 py-5 md:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
          <div>
            <div className="text-xs font-semibold uppercase text-emerald-300">Nomia</div>
            <h1 className="mt-1 text-2xl font-semibold">Call desk</h1>
            <p className="mt-1 text-sm text-muted-foreground">One business, one call, one saved outcome.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} title="Refresh call queue">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="ml-2">Refresh</span>
          </Button>
        </header>

        <section className={`mt-4 border p-4 ${masterPaused ? 'border-amber-400/30 bg-amber-400/5' : 'border-emerald-400/30 bg-emerald-400/5'}`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              {masterPaused ? <ShieldAlert size={18} className="mt-0.5 text-amber-300" /> : <CheckCircle2 size={18} className="mt-0.5 text-emerald-300" />}
              <div>
                <div className="text-sm font-semibold">{masterPaused ? 'Calling session is off' : 'Manual calling is ready'}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">Gmail, AI calls, SMS and partner automation stay paused.</div>
              </div>
            </div>
            {masterPaused
              ? <Button size="sm" onClick={startSession} className="gap-2"><PhoneCall size={14} /> Start calling session</Button>
              : <Button size="sm" variant="outline" onClick={endSession} className="gap-2"><Square size={13} /> End and pause all</Button>}
          </div>
        </section>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="border border-border bg-card px-4 py-3"><div className="text-xs text-muted-foreground">Ready now</div><div className="mt-1 text-xl font-semibold">{callable.length}</div></div>
          <div className="border border-border bg-card px-4 py-3"><div className="text-xs text-muted-foreground">Upcoming callbacks</div><div className="mt-1 text-xl font-semibold">{upcomingCallbacks}</div></div>
          <div className="border border-border bg-card px-4 py-3"><div className="text-xs text-muted-foreground">Completed this session</div><div className="mt-1 text-xl font-semibold">{completedToday}</div></div>
        </div>

        <div className="mt-4 border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <label className="flex items-center gap-2 text-sm">
              <UserRound size={15} className="text-muted-foreground" />
              <span className="text-muted-foreground">Caller</span>
              <Input value={callerName} onChange={(event) => setCallerName(event.target.value)} placeholder="Enter name" className="h-8 w-40" />
            </label>
            <div className="text-xs text-muted-foreground">Sweden only · duplicate protection active</div>
          </div>

          {loading ? (
            <div className="flex min-h-80 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 size={17} className="animate-spin" /> Loading call queue</div>
          ) : lead ? (
            <div className="p-4 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><Building2 size={14} /> Current business</div>
                  <h2 className="mt-2 text-xl font-semibold md:text-2xl">{lead.name}</h2>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5"><MapPin size={14} /> {lead.city || lead.address || 'Sweden'}</span>
                    {lead.category && <span>{lead.category}</span>}
                    <span>{lead.potential_score ?? 0} lead score</span>
                  </div>
                  {lead.why_good_lead && <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{lead.why_good_lead}</p>}
                </div>
                <div className="min-w-52 border-l border-border pl-5 max-sm:border-l-0 max-sm:pl-0">
                  <div className="text-xs text-muted-foreground">Phone</div>
                  <div className="mt-1 font-mono text-lg font-semibold">{lead.phone_e164 || lead.phone}</div>
                  <button className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => { void navigator.clipboard.writeText(lead.phone_e164 || lead.phone || ''); toast.success('Phone number copied'); }}>
                    <Copy size={12} /> Copy number
                  </button>
                </div>
              </div>

              {step === 'ready' && (
                <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <Button className="h-14 gap-2 text-base" onClick={startCall} disabled={masterPaused || saving || !callerName.trim()}>
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <Phone size={18} />}
                    Call {lead.name}
                  </Button>
                  <Button variant="outline" className="h-14 gap-2" onClick={skipLead}><ArrowRight size={16} /> Skip for now</Button>
                </div>
              )}

              {step === 'outcome' && (
                <div className="mt-6 border-t border-border pt-5">
                  <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">How did the call go?</h3><p className="mt-1 text-xs text-muted-foreground">Add a note first if needed, then choose one result.</p></div><PhoneCall size={20} className="text-emerald-300" /></div>
                  <label className="mt-4 block text-xs text-muted-foreground">Call note (optional)<Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Anything useful for the next follow-up" className="mt-1 min-h-20" /></label>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {OUTCOMES.map((outcome) => (
                      <button key={outcome.key} disabled={saving} onClick={() => outcome.key === 'callback' ? setStep('callback') : void saveOutcome(outcome.key)} className={`min-h-16 border px-4 py-3 text-left transition-colors disabled:opacity-50 ${outcome.tone}`}>
                        <div className="text-sm font-semibold">{outcome.label}</div>
                        <div className="mt-1 text-xs opacity-70">{outcome.detail}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 'callback' && (
                <div className="mt-6 border-t border-border pt-5">
                  <div className="flex items-center gap-2"><CalendarClock size={17} className="text-blue-300" /><h3 className="text-sm font-semibold">When should she call back?</h3></div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                    <Input type="datetime-local" value={callbackAt} onChange={(event) => setCallbackAt(event.target.value)} />
                    <Button onClick={saveCallback} disabled={saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : <Clock3 size={15} />}<span className="ml-2">Save callback</span></Button>
                    <Button variant="outline" onClick={() => setStep('outcome')}>Back</Button>
                  </div>
                  <label className="mt-4 block text-xs text-muted-foreground">Call note (optional)<Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What should the next caller know?" className="mt-1 min-h-20" /></label>
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
              <CircleOff size={28} className="text-muted-foreground" />
              <h2 className="mt-3 text-base font-semibold">No calls are due</h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">The queue is clear for now. Future callbacks will appear automatically when due.</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
