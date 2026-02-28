import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Lead } from '@/lib/supabase';
import { useCRM } from '@/context/CRMContext';
import { Phone, PhoneCall, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import InfoTip from '@/components/InfoTip';
import { LeadRow } from '@/components/LeadRow';

export default function CallListPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
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

  const handleUpdate = (updated: Lead) => {
    // If no longer needs_call, remove from list
    if (!updated.needs_call) {
      setLeads(ls => ls.filter(l => l.id !== updated.id));
    } else {
      setLeads(ls => ls.map(l => l.id === updated.id ? updated : l));
    }
    refreshCounts();
  };

  const handleDelete = (id: string) => {
    setLeads(ls => ls.filter(l => l.id !== id));
    refreshCounts();
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-6 pt-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <PhoneCall size={20} className="text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Call List</h1>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{leads.length}</span>
            <InfoTip text="Leads who didn't reply to SMS within the call-after-hours window, plus leads with non-mobile numbers. Call them in order — oldest first." />
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
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
          <div className="space-y-0 divide-y divide-border">
            {leads.map(lead => (
              <LeadRow
                key={lead.id}
                lead={lead}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
