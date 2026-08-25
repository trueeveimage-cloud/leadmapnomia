import React, { useEffect, useState } from 'react';
import WorkspaceLayout from '@/components/WorkspaceLayout';
import { supabase } from '@/integrations/supabase/client';
import { acquireOutreachLock, fetchWorkspaceLeads, unlockOutreachIdentity } from '@/lib/nomia';
import { CALL_STATUSES } from '@/lib/sharedCrmContract';
import { toast } from 'sonner';
import { Phone, ShieldAlert, Unlock, Loader2 } from 'lucide-react';

const OUTCOMES = CALL_STATUSES.filter((s) => s !== 'New' && s !== 'Calling' && s !== 'Approved for AI call');
const NEEDS_FOLLOW_UP = ['No answer', 'Interested', 'Demo requested', 'Meeting requested', 'Demo sent'];

export default function NomiaCallsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<string | null>(null);
  const [active, setActive] = useState<any | null>(null);
  const [outcome, setOutcome] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [notes, setNotes] = useState('');
  const [blocked, setBlocked] = useState<{ lead: any; reason: string } | null>(null);
  const [reason, setReason] = useState('');

  const load = () => {
    setLoading(true);
    fetchWorkspaceLeads('nomia', { hasPhone: true, swedenOnly: true, includeDnc: false }, 200)
      .then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const startCall = async (lead: any) => {
    setChecking(lead.id);
    try {
      const res = await acquireOutreachLock(lead.id, 'call');
      if (!res?.allowed) {
        setBlocked({ lead, reason: res?.reason || 'blocked' });
        return;
      }
      setActive(lead);
      setOutcome('');
      setFollowUp('');
      setNotes('');
      window.location.href = `tel:${(lead.phone_e164 || lead.phone || '').replace(/\s/g, '')}`;
    } catch (e: any) {
      toast.error(e?.message || 'Eligibility check failed');
    } finally {
      setChecking(null);
    }
  };

  const saveOutcome = async () => {
    if (!active || !outcome) return toast.error('Pick a call outcome');
    if (NEEDS_FOLLOW_UP.includes(outcome) && !followUp) return toast.error('This outcome requires a follow-up date');

    const updates: any = {
      call_status: outcome,
      call_outcome: outcome,
      last_contacted_at: new Date().toISOString(),
      last_contact_method: 'call',
      call_attempts: (active.call_attempts || 0) + 1,
      call_connected: outcome !== 'No answer',
      outreach_state: outcome === 'Do not contact' ? 'do_not_contact' : 'called',
    };
    if (outcome === 'Do not contact') updates.do_not_contact = true;
    if (followUp) updates.follow_up_at = new Date(followUp).toISOString();

    const { error } = await supabase.from('leads').update(updates).eq('id', active.id);
    if (error) return toast.error(error.message);

    await supabase.from('activities').insert({
      lead_id: active.id,
      type: 'manual_call',
      payload: { outcome, notes, follow_up_at: updates.follow_up_at || null },
    });
    await (supabase as any).from('app_notifications').insert({
      product: 'nomia', lead_id: active.id, type: 'call_outcome',
      title: `Call logged: ${outcome}`, message: active.business_name || active.name, payload: { outcome },
    });

    toast.success('Call outcome logged');
    setActive(null);
    load();
  };

  const doUnlock = async () => {
    if (!blocked) return;
    try {
      await unlockOutreachIdentity(blocked.lead.id, 'call', reason);
      toast.success('Unlocked and recorded');
      setBlocked(null);
      setReason('');
    } catch (e: any) {
      toast.error(e?.message || 'Unlock failed');
    }
  };

  return (
    <WorkspaceLayout workspace="nomia" title="Manual calls" subtitle="Eligibility and lock are checked before the dialer opens">
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {loading && <div className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</div>}
        {!loading && rows.length === 0 && <div className="px-3 py-6 text-center text-xs text-muted-foreground">No callable Nomia leads.</div>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm text-foreground truncate">{r.business_name || r.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {r.phone} · {r.city || '—'} · attempts {r.call_attempts || 0} · {r.call_status || 'New'}
              </div>
            </div>
            <button onClick={() => startCall(r)} disabled={checking === r.id}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald/40 bg-emerald/10 px-2.5 py-1.5 text-[11px] text-emerald hover:bg-emerald/20 disabled:opacity-50">
              {checking === r.id ? <Loader2 size={12} className="animate-spin" /> : <Phone size={12} />} Call
            </button>
          </div>
        ))}
      </div>

      {active && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-4">
            <div className="text-sm font-semibold text-foreground mb-1">Log call outcome</div>
            <div className="text-[11px] text-muted-foreground mb-3">{active.business_name || active.name} · {active.phone}</div>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-2 text-xs text-foreground mb-2">
              <option value="">Select outcome…</option>
              {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            {NEEDS_FOLLOW_UP.includes(outcome) && (
              <input type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-2 text-xs text-foreground mb-2" />
            )}
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Call notes"
              className="w-full rounded-md border border-border bg-background px-2 py-2 text-xs text-foreground mb-3" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setActive(null)} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground">Cancel</button>
              <button onClick={saveOutcome} className="rounded-md bg-emerald px-3 py-1.5 text-xs text-emerald-foreground font-medium">Save outcome</button>
            </div>
          </div>
        </div>
      )}

      {blocked && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4">
          <div className="w-full max-w-md rounded-lg border border-amber/40 bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber mb-1">
              <ShieldAlert size={15} /> Call blocked
            </div>
            <div className="text-[11px] text-muted-foreground mb-3">
              {blocked.lead.business_name || blocked.lead.name} — reason: <span className="text-foreground">{blocked.reason}</span>
            </div>
            {blocked.reason === 'do_not_contact' ? (
              <p className="text-[11px] text-muted-foreground mb-3">Do Not Contact cannot be unlocked.</p>
            ) : (
              <>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                  placeholder="Written reason (min 8 characters) — this is permanently recorded"
                  className="w-full rounded-md border border-border bg-background px-2 py-2 text-xs text-foreground mb-3" />
                <button onClick={doUnlock} disabled={reason.trim().length < 8}
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber/50 bg-amber/10 px-3 py-1.5 text-xs text-amber disabled:opacity-40">
                  <Unlock size={12} /> Unlock this channel
                </button>
              </>
            )}
            <div className="mt-3 flex justify-end">
              <button onClick={() => { setBlocked(null); setReason(''); }} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground">Close</button>
            </div>
          </div>
        </div>
      )}
    </WorkspaceLayout>
  );
}
