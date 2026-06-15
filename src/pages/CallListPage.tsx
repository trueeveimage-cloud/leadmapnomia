import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Lead } from '@/lib/supabase';
import { AlertCircle, Bot, Clock, FileText, Phone, RefreshCw } from 'lucide-react';
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

function hasAiCallResult(lead: Lead) {
  return (
    !!(lead.retell_call_id || lead.last_called_at || lead.call_summary || lead.call_transcript)
    || (!!lead.call_status && lead.call_status !== 'New')
  );
}

export default function CallListPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const totalWithSummary = leads.filter((lead) => !!lead.call_summary).length;
  const totalInterested = leads.filter((lead) => ['Interested', 'Demo requested', 'Meeting requested'].includes(lead.call_status || '')).length;
  const totalNeedsReview = leads.filter((lead) => ['Calling', 'No answer', 'Error'].includes(lead.call_status || '')).length;

  const load = async () => {
    toast.dismiss();
    setLoadError(null);
    setLoading(true);

    try {
      const allLeads: Lead[] = [];
      const pageSize = 1000;
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from('leads')
          .select('*')
          .order('updated_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;

        allLeads.push(...(data as Lead[]));
        if (data.length < pageSize) break;
        from += pageSize;
      }

      const aiCallLeads = allLeads.filter(hasAiCallResult);
      aiCallLeads.sort((a, b) => {
        const aTime = new Date(a.last_called_at || a.updated_at || a.created_at).getTime();
        const bTime = new Date(b.last_called_at || b.updated_at || b.created_at).getTime();
        return bTime - aTime;
      });
      setLeads(aiCallLeads.slice(0, 200));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load AI calls';
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const intervalId = window.setInterval(load, 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

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

        <div className="grid gap-3 md:grid-cols-3 mb-6">
          <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
            <div className="text-xs text-muted-foreground">AI calls</div>
            <div className="mt-1 text-2xl font-semibold text-foreground">{leads.length}</div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
            <div className="text-xs text-muted-foreground">With summary</div>
            <div className="mt-1 text-2xl font-semibold text-foreground">{totalWithSummary}</div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
            <div className="text-xs text-muted-foreground">Needs review</div>
            <div className="mt-1 text-2xl font-semibold text-foreground">{totalNeedsReview}</div>
            {totalInterested > 0 && <div className="mt-1 text-xs text-primary">{totalInterested} interested</div>}
          </div>
        </div>

        {loadError && (
          <div className="mb-6 rounded-md border border-red-500/30 bg-red-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="text-red-400 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-red-200">Could not load AI calls</div>
                <div className="mt-1 text-xs text-red-100/80">{loadError}</div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="rounded-md border border-border bg-muted/20 py-16 text-center">
            <RefreshCw size={22} className="mx-auto mb-3 animate-spin text-muted-foreground" />
            <div className="text-sm text-muted-foreground">Loading AI calls...</div>
          </div>
        ) : leads.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/20 px-6 py-14 text-center">
            <Phone size={34} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No Retell call results saved yet</p>
            <p className="text-xs text-muted-foreground mt-1">When a Retell webhook saves status, summary, or transcript data, it will appear here.</p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              <Clock size={13} />
              Start a call from Cold Call or a lead row, then press Refresh.
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {leads.map((lead) => {
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
