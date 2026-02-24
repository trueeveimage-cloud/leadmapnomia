import React, { useEffect, useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Lead, updateLead, logActivity } from '@/lib/supabase';
import { useCRM } from '@/context/CRMContext';
import { Phone, Star, Clock, SkipForward, MessageSquare, Copy, Check, X, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, isPast, addHours, addDays } from 'date-fns';

const OUTCOMES = [
  { key: 'answered', label: 'Answered', color: 'hsl(142 69% 45%)' },
  { key: 'not_answered', label: 'No Answer', color: 'hsl(38 95% 55%)' },
  { key: 'busy', label: 'Busy', color: 'hsl(38 95% 55%)' },
  { key: 'wrong_number', label: 'Wrong #', color: 'hsl(0 72% 55%)' },
  { key: 'callback_later', label: 'Callback', color: 'hsl(213 94% 58%)' },
] as const;

const STATUSES = [
  { key: 'interested', label: 'Interested', color: 'hsl(142 69% 45%)' },
  { key: 'not_interested', label: 'Not Interested', color: 'hsl(0 72% 55%)' },
  { key: 'unsure', label: 'Unsure', color: 'hsl(38 95% 55%)' },
  { key: 'demo', label: 'Demo', color: 'hsl(262 83% 65%)' },
] as const;

const FOLLOWUP_PRESETS = [
  { label: '1h', fn: () => addHours(new Date(), 1) },
  { label: '3h', fn: () => addHours(new Date(), 3) },
  { label: 'Tomorrow 10am', fn: () => { const d = addDays(new Date(), 1); d.setHours(10, 0, 0, 0); return d; } },
  { label: '2 days', fn: () => { const d = addDays(new Date(), 2); d.setHours(10, 0, 0, 0); return d; } },
];

export default function NextLeadPage() {
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<'preview' | 'outcome' | 'status' | 'followup'>('preview');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [skippedIds, setSkippedIds] = useState<string[]>([]);
  const { refreshCounts } = useCRM();
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);

  const fetchNext = useCallback(async (skipIds: string[] = []) => {
    setLoading(true);
    setStep('preview');
    setNote('');
    try {
      // Priority 1: Overdue callbacks
      let { data } = await supabase
        .from('leads')
        .select('*')
        .eq('status', 'callback')
        .not('next_action_at', 'is', null)
        .lte('next_action_at', new Date().toISOString())
        .eq('outreach_opt_out', false)
        .order('next_action_at', { ascending: true })
        .limit(20);

      let candidates = (data || []).filter(l => !skipIds.includes(l.id) && l.phone);
      
      if (candidates.length === 0) {
        // Priority 2: needs_call
        const res2 = await supabase
          .from('leads')
          .select('*')
          .eq('needs_call', true)
          .eq('outreach_opt_out', false)
          .order('call_after_at', { ascending: true, nullsFirst: false })
          .limit(20);
        candidates = (res2.data || []).filter(l => !skipIds.includes(l.id) && l.phone);
      }

      if (candidates.length === 0) {
        // Priority 3: not_contacted, oldest first
        const res3 = await supabase
          .from('leads')
          .select('*')
          .eq('status', 'not_contacted')
          .eq('outreach_opt_out', false)
          .not('phone', 'is', null)
          .order('created_at', { ascending: true })
          .limit(20);
        candidates = (res3.data || []).filter(l => !skipIds.includes(l.id) && l.phone);
      }

      if (candidates.length === 0) {
        // Priority 4: contacted but oldest last_contacted_at
        const res4 = await supabase
          .from('leads')
          .select('*')
          .eq('status', 'contacted')
          .eq('outreach_opt_out', false)
          .not('phone', 'is', null)
          .order('last_contacted_at', { ascending: true, nullsFirst: true })
          .limit(20);
        candidates = (res4.data || []).filter(l => !skipIds.includes(l.id) && l.phone);
      }

      setLead(candidates.length > 0 ? (candidates[0] as Lead) : null);
    } catch {
      toast.error('Failed to load next lead');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNext(); }, [fetchNext]);

  const skip = () => {
    if (lead) {
      const next = [...skippedIds, lead.id];
      setSkippedIds(next);
      fetchNext(next);
    }
  };

  const handleCall = () => {
    if (!lead) return;
    if (isMobile) window.location.href = `tel:${lead.phone}`;
    setStep('outcome');
  };

  const handleOutcome = async (outcomeKey: string) => {
    if (!lead) return;
    const now = new Date().toISOString();
    const base: any = {
      call_outcome_last: outcomeKey,
      call_attempts: (lead as any).call_attempts ? (lead as any).call_attempts + 1 : 1,
      last_contacted_at: now,
      last_contact_method: 'call',
      needs_call: false,
    };

    if (note.trim()) base.notes = lead.notes ? `${lead.notes}\n${note.trim()}` : note.trim();

    if (outcomeKey === 'answered') {
      setStep('status');
      return;
    }

    // Auto-schedule follow-up
    let nextActionAt: Date;
    if (outcomeKey === 'not_answered') {
      nextActionAt = addDays(new Date(), 1);
      nextActionAt.setHours(12, 0, 0, 0);
    } else if (outcomeKey === 'busy') {
      nextActionAt = addHours(new Date(), 3);
    } else if (outcomeKey === 'callback_later') {
      setStep('followup');
      return;
    } else if (outcomeKey === 'wrong_number') {
      base.status = 'not_interested';
      base.outreach_opt_out = true;
      const updated = await updateLead(lead.id, base);
      await logActivity(lead.id, 'call', { outcome: outcomeKey });
      refreshCounts();
      toast.success('Marked wrong number');
      fetchNext([...skippedIds]);
      return;
    } else {
      nextActionAt = addDays(new Date(), 1);
    }

    base.status = 'callback';
    base.next_action_at = nextActionAt.toISOString();
    await updateLead(lead.id, base);
    await logActivity(lead.id, 'call', { outcome: outcomeKey, next_action_at: base.next_action_at });
    refreshCounts();
    toast.success(`Follow-up: ${format(nextActionAt, 'MMM d h:mma')}`);
    fetchNext([...skippedIds]);
  };

  const handleStatus = async (status: string) => {
    if (!lead) return;
    const now = new Date().toISOString();
    const updates: any = {
      status,
      call_outcome_last: 'answered',
      call_attempts: (lead as any).call_attempts ? (lead as any).call_attempts + 1 : 1,
      last_contacted_at: now,
      last_contact_method: 'call',
      needs_call: false,
    };
    if (note.trim()) updates.notes = lead.notes ? `${lead.notes}\n${note.trim()}` : note.trim();
    await updateLead(lead.id, updates);
    await logActivity(lead.id, 'call', { outcome: 'answered', status });
    refreshCounts();
    toast.success(`Lead → ${status.replace(/_/g, ' ')}`);
    fetchNext([...skippedIds]);
  };

  const handleFollowupPreset = async (dt: Date) => {
    if (!lead) return;
    const now = new Date().toISOString();
    const updates: any = {
      status: 'callback',
      call_outcome_last: 'callback_later',
      call_attempts: (lead as any).call_attempts ? (lead as any).call_attempts + 1 : 1,
      last_contacted_at: now,
      last_contact_method: 'call',
      needs_call: false,
      next_action_at: dt.toISOString(),
    };
    if (note.trim()) updates.notes = lead.notes ? `${lead.notes}\n${note.trim()}` : note.trim();
    await updateLead(lead.id, updates);
    await logActivity(lead.id, 'call', { outcome: 'callback_later', next_action_at: updates.next_action_at });
    refreshCounts();
    toast.success(`Callback: ${format(dt, 'MMM d h:mma')}`);
    fetchNext([...skippedIds]);
  };

  const copyNumber = () => {
    if (lead?.phone) {
      navigator.clipboard.writeText(lead.phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-6 pt-8">
        <div className="flex items-center gap-2 mb-6">
          <ChevronRight size={20} className="text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Next Lead</h1>
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted text-muted-foreground ml-2">N</kbd>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground py-20 text-center">Finding next lead...</div>
        ) : !lead ? (
          <div className="text-center py-20 text-muted-foreground">
            <Phone size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">All caught up!</p>
            <p className="text-xs mt-1">No more leads to contact right now</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Lead preview card */}
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{lead.name}</h2>
                  {lead.category && <span className="text-xs text-muted-foreground">{lead.niche_label || lead.category}</span>}
                </div>
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={skip}>
                  <SkipForward size={14} className="mr-1" /> Skip
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                {lead.phone && (
                  <div className="flex items-center gap-2 text-foreground">
                    <Phone size={13} className="text-green-400" />
                    <span className="font-mono">{lead.phone}</span>
                    <button onClick={copyNumber} className="text-muted-foreground hover:text-foreground">
                      {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                    </button>
                  </div>
                )}
                {lead.rating && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Star size={13} className="text-amber-400 fill-amber-400" />
                    <span>{lead.rating} ({lead.reviews_count})</span>
                  </div>
                )}
                {(lead as any).last_contacted_at && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock size={13} />
                    <span>Last: {format(new Date((lead as any).last_contacted_at), 'MMM d h:mma')}</span>
                  </div>
                )}
                {(lead as any).call_attempts > 0 && (
                  <div className="text-muted-foreground text-xs">
                    {(lead as any).call_attempts} attempt{(lead as any).call_attempts !== 1 ? 's' : ''}
                  </div>
                )}
              </div>

              {lead.notes && (
                <div className="text-xs text-muted-foreground bg-muted rounded p-2 mb-4 italic">{lead.notes}</div>
              )}

              {/* Quick note input */}
              <div className="mb-4">
                <Textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Add a quick note..."
                  className="min-h-[40px] h-10 text-xs bg-muted resize-none"
                  rows={1}
                />
              </div>

              {/* Actions based on step */}
              {step === 'preview' && (
                <div className="flex items-center gap-2">
                  <Button onClick={handleCall} className="bg-[hsl(var(--green))] text-[hsl(var(--green-foreground))] hover:opacity-90 gap-1.5">
                    <Phone size={14} /> Call
                  </Button>
                </div>
              )}

              {step === 'outcome' && (
                <div>
                  {!isMobile && (
                    <div className="mb-3 p-3 bg-muted rounded-lg">
                      <div className="text-xs text-muted-foreground">Dial this number</div>
                      <div className="text-xl font-mono font-bold text-foreground tracking-wide">{lead.phone}</div>
                    </div>
                  )}
                  <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Outcome</div>
                  <div className="flex flex-wrap gap-2">
                    {OUTCOMES.map(o => (
                      <button
                        key={o.key}
                        onClick={() => handleOutcome(o.key)}
                        className="px-3 py-2 rounded-md text-sm font-medium border border-border hover:bg-muted transition-colors"
                        style={{ color: o.color }}
                      >
                        {o.label}
                      </button>
                    ))}
                    <button onClick={() => setStep('preview')} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                  </div>
                </div>
              )}

              {step === 'status' && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Set Status</div>
                  <div className="flex flex-wrap gap-2">
                    {STATUSES.map(s => (
                      <button
                        key={s.key}
                        onClick={() => handleStatus(s.key)}
                        className="px-3 py-2 rounded-md text-sm font-medium border border-border hover:bg-muted transition-colors"
                        style={{ color: s.color }}
                      >
                        {s.label}
                      </button>
                    ))}
                    <button onClick={() => setStep('preview')} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                  </div>
                </div>
              )}

              {step === 'followup' && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Schedule Callback</div>
                  <div className="flex flex-wrap gap-2">
                    {FOLLOWUP_PRESETS.map(p => (
                      <button
                        key={p.label}
                        onClick={() => handleFollowupPreset(p.fn())}
                        className="px-3 py-2 rounded-md text-sm font-medium border border-border text-primary hover:bg-primary/10 transition-colors"
                      >
                        {p.label}
                      </button>
                    ))}
                    <button onClick={() => setStep('preview')} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
