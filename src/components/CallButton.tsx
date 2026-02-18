import React, { useState, useCallback } from 'react';
import { Lead, LeadStatus, updateLead, logActivity } from '@/lib/supabase';
import { useCRM } from '@/context/CRMContext';
import { Button } from '@/components/ui/button';
import { Phone, Copy, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const CALL_OUTCOMES = [
  { key: 'answered', label: 'Answered', color: 'hsl(142 69% 45%)', status: 'answered' as LeadStatus },
  { key: 'not_answered', label: 'Not Answered', color: 'hsl(38 95% 55%)', status: 'callback' as LeadStatus },
  { key: 'busy', label: 'Busy', color: 'hsl(38 95% 55%)', status: 'callback' as LeadStatus },
  { key: 'wrong_number', label: 'Wrong Number', color: 'hsl(0 72% 55%)', status: 'not_interested' as LeadStatus },
  { key: 'callback_later', label: 'Call Back Later', color: 'hsl(213 94% 58%)', status: 'callback' as LeadStatus },
];

const STATUS_OPTIONS: { key: LeadStatus; label: string }[] = [
  { key: 'interested', label: 'Interested' },
  { key: 'not_interested', label: 'Not Interested' },
  { key: 'unsure', label: 'Unsure' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'closed_won', label: 'Closed Won' },
  { key: 'closed_lost', label: 'Closed Lost' },
];

interface CallButtonProps {
  lead: Lead;
  onUpdate?: (lead: Lead) => void;
}

export function CallButton({ lead, onUpdate }: CallButtonProps) {
  const { refreshCounts } = useCRM();
  const [step, setStep] = useState<'idle' | 'outcome' | 'status' | 'followup'>('idle');
  const [selectedOutcome, setSelectedOutcome] = useState<typeof CALL_OUTCOMES[0] | null>(null);
  const [copied, setCopied] = useState(false);
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
      // For non-answered, set follow-up
      setStep('followup');
    }
  };

  const handleStatus = async (status: LeadStatus) => {
    const updated = await updateLead(lead.id, { status, call_outcome_last: selectedOutcome?.key });
    await logActivity(lead.id, 'call', { outcome: selectedOutcome?.key, status });
    onUpdate?.(updated);
    refreshCounts();
    setStep('idle');
    toast.success(`Lead marked as ${status.replace(/_/g, ' ')}`);
  };

  const handleFollowup = async (hoursFromNow: number) => {
    const nextActionAt = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
    const updated = await updateLead(lead.id, {
      status: 'callback',
      call_outcome_last: selectedOutcome?.key,
      next_action_at: nextActionAt,
    });
    await logActivity(lead.id, 'call', { outcome: selectedOutcome?.key, nextActionAt });
    onUpdate?.(updated);
    refreshCounts();
    setStep('idle');
    toast.success('Follow-up scheduled');
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
          <div className="bg-card border border-border rounded-lg p-5 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
            {!isMobile && (
              <div className="mb-4 p-3 bg-muted rounded-md flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">Call this number</div>
                  <div className="text-lg font-mono font-bold text-foreground">{lead.phone}</div>
                  <div className="text-xs text-muted-foreground truncate">{lead.name}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={copyNumber} className="shrink-0">
                  {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                </Button>
              </div>
            )}
            <div className="text-sm font-semibold text-foreground mb-3">Call outcome</div>
            <div className="space-y-1.5">
              {CALL_OUTCOMES.map(o => (
                <button
                  key={o.key}
                  onClick={() => handleOutcome(o)}
                  className="w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-muted border border-border/50 hover:border-border"
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
          <div className="bg-card border border-border rounded-lg p-5 w-72 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-semibold text-foreground mb-3">Set status</div>
            <div className="space-y-1.5">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s.key}
                  onClick={() => handleStatus(s.key)}
                  className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-muted border border-border/50 hover:border-border transition-colors"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 'followup' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setStep('idle')}>
          <div className="bg-card border border-border rounded-lg p-5 w-72 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-semibold text-foreground mb-1">Schedule follow-up</div>
            <div className="text-xs text-muted-foreground mb-3">Outcome: {selectedOutcome?.label}</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: '1 hour', hours: 1 },
                { label: '3 hours', hours: 3 },
                { label: 'Tomorrow', hours: 24 },
                { label: '2 days', hours: 48 },
                { label: '1 week', hours: 168 },
                { label: '2 weeks', hours: 336 },
              ].map(opt => (
                <button
                  key={opt.hours}
                  onClick={() => handleFollowup(opt.hours)}
                  className="px-3 py-2 rounded-md text-sm hover:bg-primary/10 hover:text-primary border border-border/50 hover:border-primary/30 transition-colors text-center"
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="w-full mt-3 text-muted-foreground" onClick={() => setStep('idle')}>
              <X size={12} className="mr-1" /> Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
