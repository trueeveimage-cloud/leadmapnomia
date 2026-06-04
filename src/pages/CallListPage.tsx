import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Lead } from '@/lib/supabase';
import { Bot, Phone, RefreshCw, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const statusTone: Record<string, string> = {
  Calling: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  'Demo requested': 'border-green-500/30 bg-green-500/10 text-green-400',
  'Meeting requested': 'border-green-500/30 bg-green-500/10 text-green-400',
  Interested: 'border-green-500/30 bg-green-500/10 text-green-400',
  'No answer': 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  'Not interested': 'border-red-500/30 bg-red-500/10 text-red-400',
  'Do not contact': 'border-red-500/30 bg-red-500/10 text-red-400',
  Error: 'border-red-500/30 bg-red-500/10 text-red-400',
};

function dateLabel(value?: string | null) {
  if (!value) return 'Not called yet';
  return format(new Date(value), 'MMM d, yyyy h:mma');
}

export default function CallListPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .or('retell_call_id.not.is.null,last_called_at.not.is.null,call_summary.not.is.null,call_transcript.not.is.null,call_status.neq.New')
        .order('last_called_at', { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      setLeads(data as Lead[]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load AI calls');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-6 pt-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Bot size={20} className="text-primary" />
            <h1 className="text-2xl font-bold text-foreground">AI Calls</h1>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{leads.length}</span>
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
            <p className="text-sm">No Retell calls yet</p>
            <p className="text-xs mt-1">Calls started from “Call with AI” will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {leads.map(lead => {
              const callStatus = lead.call_status || 'New';
              const tone = statusTone[callStatus] || 'border-border bg-muted text-muted-foreground';
              return (
                <div key={lead.id} className="py-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-foreground truncate">{lead.name}</h2>
                      <span className={cn('text-xs px-2 py-0.5 rounded-full border', tone)}>{callStatus}</span>
                      {lead.call_outcome && <span className="text-xs text-muted-foreground">{lead.call_outcome}</span>}
                    </div>

                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {(lead.phone_e164 || lead.phone) && <span>{lead.phone_e164 || lead.phone}</span>}
                      {lead.last_called_at && <span>{dateLabel(lead.last_called_at)}</span>}
                      {lead.retell_call_id && <span className="font-mono truncate">Retell {lead.retell_call_id}</span>}
                    </div>

                    {lead.call_summary && (
                      <p className="mt-3 text-sm text-foreground whitespace-pre-wrap">{lead.call_summary}</p>
                    )}

                    {lead.next_step && (
                      <div className="mt-2 text-sm text-primary">{lead.next_step}</div>
                    )}

                    {lead.call_transcript && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                          <FileText size={12} /> Transcript
                        </summary>
                        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted p-3 text-xs text-foreground font-sans">
                          {lead.call_transcript}
                        </pre>
                      </details>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground lg:text-right">
                    <div>Attempts: <span className="text-foreground">{lead.call_attempts || 0}</span></div>
                    <div>Method: <span className="text-foreground">{lead.last_contact_method || 'AI Call'}</span></div>
                    {lead.demo_delivery_method && <div>Demo via: <span className="text-foreground">{lead.demo_delivery_method}</span></div>}
                    {lead.demo_contact_value && <div className="truncate">Contact: <span className="text-foreground">{lead.demo_contact_value}</span></div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
