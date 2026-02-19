import React, { useState } from 'react';
import { Lead, LeadStatus, updateLead, logActivity } from '@/lib/supabase';
import { useCRM } from '@/context/CRMContext';
import { Button } from '@/components/ui/button';
import { Phone, Copy, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { DemoFormModal } from './DemoFormModal';

const CALL_OUTCOMES = [
  { key: 'answered', label: 'Answered', color: 'hsl(142 69% 45%)', status: 'answered' as LeadStatus },
  { key: 'not_answered', label: 'Not Answered', color: 'hsl(38 95% 55%)', status: 'callback' as LeadStatus },
  { key: 'busy', label: 'Busy', color: 'hsl(38 95% 55%)', status: 'callback' as LeadStatus },
  { key: 'wrong_number', label: 'Wrong Number', color: 'hsl(0 72% 55%)', status: 'not_interested' as LeadStatus },
  { key: 'callback_later', label: 'Call Back Later', color: 'hsl(213 94% 58%)', status: 'callback' as LeadStatus },
];

const STATUS_OPTIONS: { key: LeadStatus; label: string; color?: string }[] = [
  { key: 'interested', label: 'Interested', color: 'hsl(142 69% 45%)' },
  { key: 'not_interested', label: 'Not Interested', color: 'hsl(0 72% 55%)' },
  { key: 'unsure', label: 'Unsure', color: 'hsl(38 95% 55%)' },
  { key: 'contacted', label: 'Contacted', color: 'hsl(213 94% 58%)' },
  { key: 'demo', label: 'Demo', color: 'hsl(262 83% 65%)' },
  { key: 'closed_won', label: 'Closed Won', color: 'hsl(142 69% 55%)' },
  { key: 'closed_lost', label: 'Closed Lost', color: 'hsl(0 50% 40%)' },
];

// Generate hour:minute options every 15 min
const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  const label = `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return { label, h, m };
});

interface CallButtonProps {
  lead: Lead;
  onUpdate?: (lead: Lead) => void;
}

export function CallButton({ lead, onUpdate }: CallButtonProps) {
  const { refreshCounts } = useCRM();
  const [step, setStep] = useState<'idle' | 'outcome' | 'status' | 'followup'>('idle');
  const [selectedOutcome, setSelectedOutcome] = useState<typeof CALL_OUTCOMES[0] | null>(null);
  const [copied, setCopied] = useState(false);
  const [followupDate, setFollowupDate] = useState<Date | undefined>(undefined);
  const [followupHour, setFollowupHour] = useState(9);
  const [followupMinute, setFollowupMinute] = useState(0);
  const [demoOpen, setDemoOpen] = useState(false);
  const [pendingLead, setPendingLead] = useState<Lead>(lead);
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);

  const handleCall = () => {
    if (isMobile) {
      window.location.href = `tel:${lead.phone}`;
    }
    setStep('outcome');
  };

  const handleOutcome = async (outcome: typeof CALL_OUTCOMES[0]) => {
    setSelectedOutcome(outcome);
    if (outcome.key === 'answered') {
      setStep('status');
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setFollowupDate(tomorrow);
      setFollowupHour(9);
      setFollowupMinute(0);
      setStep('followup');
    }
  };

  const handleStatus = async (status: LeadStatus) => {
    if (status === 'demo') {
      // First update status to demo, then open demo form
      try {
        const updated = await updateLead(lead.id, { status: 'demo', call_outcome_last: selectedOutcome?.key });
        await logActivity(lead.id, 'call', { outcome: selectedOutcome?.key, status: 'demo' });
        setPendingLead(updated);
        onUpdate?.(updated);
        refreshCounts();
        setStep('idle');
        setDemoOpen(true);
      } catch {
        toast.error('Failed to update status');
      }
      return;
    }
    const updated = await updateLead(lead.id, { status, call_outcome_last: selectedOutcome?.key });
    await logActivity(lead.id, 'call', { outcome: selectedOutcome?.key, status });
    onUpdate?.(updated);
    refreshCounts();
    setStep('idle');
    toast.success(`Lead marked as ${status.replace(/_/g, ' ')}`);
  };

  const handleFollowupConfirm = async () => {
    if (!followupDate) {
      toast.error('Please select a date');
      return;
    }
    const dt = new Date(followupDate);
    dt.setHours(followupHour, followupMinute, 0, 0);
    const nextActionAt = dt.toISOString();
    const updated = await updateLead(lead.id, {
      status: 'callback',
      call_outcome_last: selectedOutcome?.key,
      next_action_at: nextActionAt,
    });
    await logActivity(lead.id, 'call', { outcome: selectedOutcome?.key, nextActionAt });
    onUpdate?.(updated);
    refreshCounts();
    setStep('idle');
    toast.success(`Follow-up scheduled for ${format(dt, 'MMM d, h:mma')}`);
  };

  const copyNumber = () => {
    navigator.clipboard.writeText(lead.phone || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!lead.phone) return null;

  return (
    <div className="relative">
      {step === 'idle' && (
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            onClick={handleCall}
            className="bg-[hsl(142_69%_45%)] text-white hover:bg-[hsl(142_69%_40%)] font-medium gap-1.5 h-7 px-3"
          >
            <Phone size={12} />
            {isMobile ? 'Call' : lead.phone}
          </Button>
          {!isMobile && (
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={copyNumber}>
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
            </Button>
          )}
        </div>
      )}

      {step === 'outcome' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setStep('idle')}>
          <div className="bg-card border border-border rounded-xl p-5 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
            {!isMobile && (
              <div className="mb-4 p-3 bg-muted rounded-lg flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">Call this number</div>
                  <div className="text-xl font-mono font-bold text-foreground tracking-wide">{lead.phone}</div>
                  <div className="text-xs text-muted-foreground truncate">{lead.name}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={copyNumber} className="shrink-0">
                  {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                </Button>
              </div>
            )}
            <div className="text-sm font-semibold text-foreground mb-3">Call outcome</div>
            <div className="space-y-2">
              {CALL_OUTCOMES.map(o => (
                <button
                  key={o.key}
                  onClick={() => handleOutcome(o)}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors hover:bg-muted border border-border/50 hover:border-border"
                  style={{ color: o.color }}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="w-full mt-3 text-muted-foreground" onClick={() => setStep('idle')}>
              <X size={12} className="mr-1" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {step === 'status' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setStep('idle')}>
          <div className="bg-card border border-border rounded-xl p-5 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-semibold text-foreground mb-3">Set status</div>
            <div className="space-y-2">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s.key}
                  onClick={() => handleStatus(s.key)}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-muted border border-border/50 hover:border-border transition-colors"
                  style={{ color: s.color }}
                >
                  {s.label}
                  {s.key === 'demo' && <span className="ml-2 text-xs opacity-60 font-normal">→ fill demo brief</span>}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="w-full mt-3 text-muted-foreground" onClick={() => setStep('idle')}>
              <X size={12} className="mr-1" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {step === 'followup' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setStep('idle')}>
          <div className="bg-card border border-border rounded-xl p-5 w-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-semibold text-foreground mb-1">Schedule follow-up</div>
            <div className="text-xs text-muted-foreground mb-4">Outcome: {selectedOutcome?.label}</div>

            <Calendar
              mode="single"
              selected={followupDate}
              onSelect={setFollowupDate}
              initialFocus
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              className="p-3 pointer-events-auto rounded-md border border-border mb-3"
            />

            <div className="mb-4">
              <div className="text-xs text-muted-foreground mb-2 font-medium">Time</div>
              <select
                value={`${followupHour}:${followupMinute}`}
                onChange={e => {
                  const [h, m] = e.target.value.split(':').map(Number);
                  setFollowupHour(h);
                  setFollowupMinute(m);
                }}
                className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {TIME_OPTIONS.map(t => (
                  <option key={`${t.h}:${t.m}`} value={`${t.h}:${t.m}`}>{t.label}</option>
                ))}
              </select>
            </div>

            {followupDate && (
              <div className="text-xs text-center text-muted-foreground mb-3 bg-muted rounded px-3 py-1.5">
                📅 {format(new Date(followupDate.getFullYear(), followupDate.getMonth(), followupDate.getDate(), followupHour, followupMinute), 'EEE, MMM d yyyy @ h:mma')}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="flex-1 text-muted-foreground" onClick={() => setStep('idle')}>
                <X size={12} className="mr-1" /> Cancel
              </Button>
              <Button size="sm" className="flex-1" onClick={handleFollowupConfirm} disabled={!followupDate}>
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Demo form opens after selecting Demo status */}
      {demoOpen && (
        <DemoFormModal
          lead={pendingLead}
          open={demoOpen}
          onClose={() => setDemoOpen(false)}
          onSave={updated => { onUpdate?.(updated); setDemoOpen(false); }}
        />
      )}
    </div>
  );
}
