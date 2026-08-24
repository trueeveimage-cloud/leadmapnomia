import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, RefreshCw } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { fetchNomiaWorkspaceSnapshot, getNomiaPipelineStage, NOMIA_PIPELINE_LABELS, type NomiaPipelineStage } from '@/lib/nomiaWorkspace';
import type { Lead } from '@/lib/supabase';
import { toast } from 'sonner';

const STAGES = Object.keys(NOMIA_PIPELINE_LABELS) as NomiaPipelineStage[];

export default function NomiaPipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [meetingIds, setMeetingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      const snapshot = await fetchNomiaWorkspaceSnapshot();
      setLeads(snapshot.leads);
      setMeetingIds(new Set(snapshot.appointments.filter(item => item.status !== 'cancelled').map(item => item.lead_id)));
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not load pipeline'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const grouped = useMemo(() => Object.fromEntries(STAGES.map(stage => [stage, leads.filter(lead => getNomiaPipelineStage(lead, meetingIds.has(lead.id)) === stage)])) as Record<NomiaPipelineStage, Lead[]>, [leads, meetingIds]);

  return (
    <AppLayout>
      <div className="flex h-full flex-col px-4 py-6 md:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
          <div><div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Nomia</div><h1 className="mt-1 text-2xl font-semibold">Sales pipeline</h1><p className="mt-1 text-sm text-muted-foreground">Computed from shared lead statuses, outreach states and booked appointments.</p></div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</Button>
        </header>
        <div className="mt-5 flex flex-1 gap-3 overflow-x-auto pb-4">
          {STAGES.map(stage => <section key={stage} className="w-72 shrink-0 border border-border bg-card"><div className="flex items-center justify-between border-b border-border px-3 py-3"><h2 className="text-xs font-semibold uppercase tracking-[0.12em]">{NOMIA_PIPELINE_LABELS[stage]}</h2><span className="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{grouped[stage].length}</span></div><div className="max-h-[calc(100vh-190px)] space-y-2 overflow-y-auto p-2">{grouped[stage].map(lead => <div key={lead.id} className="border border-border bg-background p-3"><div className="truncate text-sm font-medium">{lead.name}</div><div className="mt-1 truncate text-xs text-muted-foreground">{lead.city || lead.category || 'No location'}</div><div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground"><span>{lead.potential_score ?? 0} score</span>{meetingIds.has(lead.id) && <span className="flex items-center gap-1 text-emerald-300"><CalendarCheck size={11} /> Meeting</span>}</div></div>)}{!grouped[stage].length && <div className="p-5 text-center text-xs text-muted-foreground">No leads</div>}</div></section>)}
        </div>
      </div>
    </AppLayout>
  );
}
