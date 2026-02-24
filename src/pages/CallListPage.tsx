import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { updateLead, Lead } from '@/lib/supabase';
import { useCRM } from '@/context/CRMContext';
import { Phone, PhoneCall, Check, X, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import InfoTip from '@/components/InfoTip';

const CALL_OUTCOMES = [
  { value: 'answered', label: 'Answered', status: 'answered' },
  { value: 'not_answered', label: 'No Answer', status: 'contacted' },
  { value: 'busy', label: 'Busy', status: 'contacted' },
  { value: 'callback_later', label: 'Callback Later', status: 'callback' },
  { value: 'interested', label: 'Interested!', status: 'interested' },
  { value: 'not_interested', label: 'Not Interested', status: 'not_interested' },
] as const;

export default function CallListPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { refreshCounts } = useCRM();

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('needs_call', true)
        .order('call_after_at', { ascending: true, nullsFirst: false })
        .order('last_outbound_at', { ascending: true });
      if (error) throw error;
      setLeads(data as Lead[]);
    } catch { toast.error('Failed to load call list'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleOutcome = async (lead: Lead, outcome: string, newStatus: string) => {
    try {
      await updateLead(lead.id, {
        status: newStatus,
        needs_call: false,
        outreach_stage: 'called',
        call_outcome_last: outcome,
        call_attempts: ((lead as any).call_attempts || 0) + 1,
        last_contacted_at: new Date().toISOString(),
        last_contact_method: 'call',
      } as any);
      setLeads(ls => ls.filter(l => l.id !== lead.id));
      setActiveId(null);
      refreshCounts();
      toast.success(`${lead.name} → ${newStatus.replace('_', ' ')}`);
    } catch { toast.error('Failed to update'); }
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-6 pt-8">
        <div className="flex items-center gap-2 mb-6">
          <PhoneCall size={20} className="text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Call List</h1>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{leads.length}</span>
          <InfoTip text="Leads who didn't reply to SMS within the call-after-hours window. Call them in order — oldest first." />
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground py-20 text-center">Loading...</div>
        ) : leads.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Phone size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No calls needed right now</p>
            <p className="text-xs mt-1">Leads with no SMS reply will auto-appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {leads.map(lead => (
              <div key={lead.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-sm text-foreground">{lead.name}</span>
                      {lead.category && <span className="text-[10px] text-muted-foreground">{lead.category}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{lead.phone}</span>
                      {(lead as any).last_outbound_at && (
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          SMS sent {new Date((lead as any).last_outbound_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {(lead as any).last_message_preview && (
                      <p className="text-xs text-muted-foreground mt-1 truncate max-w-md">
                        Last msg: {(lead as any).last_message_preview}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {activeId === lead.id ? (
                      <div className="flex gap-1 flex-wrap justify-end">
                        {CALL_OUTCOMES.map(o => (
                          <button
                            key={o.value}
                            onClick={() => handleOutcome(lead, o.value, o.status)}
                            className="px-2 py-1 rounded text-[10px] font-medium border border-border bg-muted text-foreground hover:bg-primary/10 hover:border-primary/30 transition-colors"
                          >
                            {o.label}
                          </button>
                        ))}
                        <button onClick={() => setActiveId(null)} className="px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-foreground">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green text-green-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                          <Phone size={14} /> Call
                        </a>
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setActiveId(lead.id)}>
                          Log Outcome
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
