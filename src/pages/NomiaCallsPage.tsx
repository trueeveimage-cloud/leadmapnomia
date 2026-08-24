/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, Clock3, PhoneCall, RefreshCw, ShieldAlert } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { CallButton } from '@/components/CallButton';
import { ManualCallModal } from '@/components/ManualCallModal';
import { Button } from '@/components/ui/button';
import { fetchLeads, getSetting, type Lead } from '@/lib/supabase';
import { isDoNotContact, isSwedishLead } from '@/lib/nomiaWorkspace';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function NomiaCallsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [masterPaused, setMasterPaused] = useState(true);
  const [aiPaused, setAiPaused] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [aiCampaign, setAiCampaign] = useState<any>(null);
  const [aiRecipients, setAiRecipients] = useState<any[]>([]);

  const loadAiReview = useCallback(async () => {
    const client = supabase as any;
    const { data } = await client.from('campaigns').select('*').eq('product', 'nomia').eq('channel', 'ai_call').in('approval_status', ['ready_for_review', 'approved']).order('created_at', { ascending: false }).limit(1).maybeSingle();
    setAiCampaign(data || null);
    if (data) {
      const { data: recipients } = await client.from('campaign_recipients').select('*,leads(id,name,phone,phone_e164)').eq('campaign_id', data.id).order('position');
      setAiRecipients(recipients || []);
    } else setAiRecipients([]);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, paused, ai] = await Promise.all([fetchLeads({ product: 'nomia' }), getSetting('outreach_master_paused'), getSetting('nomia_ai_calls_paused')]);
      setLeads(rows);
      setMasterPaused(paused !== 'false');
      setAiPaused(ai !== 'false');
      await loadAiReview();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not load call queue'); }
    finally { setLoading(false); }
  }, [loadAiReview]);
  useEffect(() => { void load(); }, [load]);

  const queue = useMemo(() => leads
    .filter(lead => isSwedishLead(lead) && !!lead.phone && !isDoNotContact(lead) && ['not_contacted', 'callback'].includes(lead.status))
    .sort((a, b) => {
      const dueA = a.next_action_at ? new Date(a.next_action_at).getTime() : Number.MAX_SAFE_INTEGER;
      const dueB = b.next_action_at ? new Date(b.next_action_at).getTime() : Number.MAX_SAFE_INTEGER;
      return dueA - dueB || (b.potential_score || 0) - (a.potential_score || 0);
    }), [leads]);

  const createAiReview = async () => {
    const ids = [...selectedIds].slice(0, 5);
    if (!ids.length) return;
    setSavingReview(true);
    try {
      const { data: campaign, error } = await (supabase as any).from('campaigns').insert({
        name: `Nomia AI call review ${new Date().toLocaleDateString('sv-SE')}`,
        product: 'nomia', channel: 'ai_call', approval_status: 'ready_for_review', status: 'paused',
        audience_filter: { countries: ['SE'], lead_ids: ids }, batch_cap: ids.length, daily_cap: Math.min(5, ids.length), template_text: '',
      }).select('*').single();
      if (error) throw error;
      const recipients = ids.map((leadId, position) => ({ campaign_id: campaign.id, lead_id: leadId, position, status: 'pending_review' }));
      const { error: recipientError } = await (supabase as any).from('campaign_recipients').insert(recipients);
      if (recipientError) throw recipientError;
      toast.success('AI call review saved. No calls were started.');
      setSelectedIds(new Set());
      await loadAiReview();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not create AI review'); }
    finally { setSavingReview(false); }
  };

  const approveAiReview = async () => {
    if (!aiCampaign || aiRecipients.length === 0 || aiRecipients.length > 5) return;
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await (supabase as any).from('campaigns').update({ approval_status: 'approved', approved_at: new Date().toISOString(), approved_by: session?.user.id, status: 'paused' }).eq('id', aiCampaign.id);
    if (error) return toast.error(error.message);
    await (supabase as any).from('campaign_recipients').update({ status: 'approved' }).eq('campaign_id', aiCampaign.id);
    await loadAiReview();
    toast.success('AI call review approved. No calls were started.');
  };

  const startApprovedAiCalls = async () => {
    if (!aiCampaign || aiCampaign.approval_status !== 'approved') return;
    const [master, ai] = await Promise.all([getSetting('outreach_master_paused'), getSetting('nomia_ai_calls_paused')]);
    if (master !== 'false' || ai !== 'false') return toast.error('AI calls are blocked by the master or AI pause.');
    const pending = aiRecipients.filter(item => item.status === 'approved').slice(0, 5);
    if (!window.confirm(`Start exactly ${pending.length} approved Retell calls? This contacts real businesses.`)) return;
    setSavingReview(true);
    let started = 0;
    try {
      await (supabase as any).from('campaigns').update({ status: 'running' }).eq('id', aiCampaign.id);
      for (const recipient of pending) {
        const { data, error } = await supabase.functions.invoke('retell-start-call', { body: { leadId: recipient.lead_id, campaignRecipientId: recipient.id } });
        const status = !error && !data?.error ? 'started' : 'blocked';
        await (supabase as any).from('campaign_recipients').update({ status, sent_at: status === 'started' ? new Date().toISOString() : null, error_message: error?.message || data?.error || null }).eq('id', recipient.id);
        if (status === 'started') started++;
        if (status === 'started') break;
      }
      await (supabase as any).from('campaigns').update({ status: started ? 'paused' : 'completed' }).eq('id', aiCampaign.id);
      toast.success(`${started} AI call started. Remaining approved calls stay paused until the active call finishes.`);
      await loadAiReview();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not start approved calls'); }
    finally { setSavingReview(false); }
  };

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Nomia</div>
            <h1 className="mt-1 text-2xl font-semibold">Cold-call queue</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manual calls first. AI calls require a separate review with a five-lead maximum.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setManualOpen(true)} className="gap-2"><PhoneCall size={14} /> Add manual call</Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</Button>
          </div>
        </header>

        <div className={`mt-4 flex items-start gap-3 border p-3 text-sm ${masterPaused ? 'border-amber-400/25 bg-amber-400/5' : 'border-emerald-400/25 bg-emerald-400/5'}`}>
          {masterPaused ? <ShieldAlert size={17} className="mt-0.5 shrink-0 text-amber-300" /> : <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-300" />}
          <div><div className="font-medium">{masterPaused ? 'All outreach is paused' : 'Manual outreach is enabled'}</div><div className="text-xs text-muted-foreground">Every call still acquires the backend phone/business lock before the dialer opens.</div></div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm"><span className="font-semibold">{queue.length}</span> callable Swedish leads</div>
          <Button size="sm" variant="secondary" disabled={!selectedIds.size || selectedIds.size > 5 || savingReview} onClick={createAiReview} className="gap-2">
            <Bot size={14} /> {savingReview ? 'Saving...' : `Create AI review (${selectedIds.size}/5)`}
          </Button>
        </div>

        {aiCampaign && <section className="mt-3 border border-border bg-card p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-semibold"><Bot size={15} /> Approved AI lane</div><div className="mt-1 text-xs text-muted-foreground">{aiCampaign.name} · {aiRecipients.length}/5 leads · {aiCampaign.approval_status.replace(/_/g, ' ')}</div></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={approveAiReview} disabled={aiCampaign.approval_status === 'approved'}>Approve review</Button><Button size="sm" onClick={startApprovedAiCalls} disabled={aiCampaign.approval_status !== 'approved' || masterPaused || aiPaused || savingReview}>Start next approved call</Button></div></div><div className="mt-3 flex flex-wrap gap-2">{aiRecipients.map(item => <span key={item.id} className="rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground">{item.leads?.name || item.lead_id}: {item.status}</span>)}</div></section>}

        <div className="mt-3 overflow-hidden border border-border bg-card">
          <div className="grid grid-cols-[34px_1fr_150px_130px_160px] gap-3 border-b border-border bg-secondary/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground max-md:hidden">
            <span /><span>Business</span><span>Priority</span><span>Follow-up</span><span>Action</span>
          </div>
          <div className="divide-y divide-border">
            {queue.map(lead => (
              <div key={lead.id} className="grid gap-3 px-4 py-3 md:grid-cols-[34px_1fr_150px_130px_160px] md:items-center">
                <input type="checkbox" checked={selectedIds.has(lead.id)} disabled={selectedIds.size >= 5 && !selectedIds.has(lead.id)} onChange={e => setSelectedIds(prev => { const next = new Set(prev); if (e.target.checked) next.add(lead.id); else next.delete(lead.id); return next; })} />
                <div className="min-w-0"><div className="truncate text-sm font-medium">{lead.name}</div><div className="truncate text-xs text-muted-foreground">{lead.phone} · {lead.city || lead.address || 'Sweden'}</div></div>
                <div className="text-xs"><span className="font-medium">{lead.potential_score ?? 0}</span><span className="text-muted-foreground"> score</span><div className="text-muted-foreground">{lead.website ? 'Has website' : 'No website'}</div></div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 size={12} />{lead.next_action_at ? new Date(lead.next_action_at).toLocaleDateString('sv-SE') : 'Not set'}</div>
                <div className={masterPaused ? 'pointer-events-none opacity-50' : ''}><CallButton lead={lead} onUpdate={updated => setLeads(prev => prev.map(item => item.id === updated.id ? updated : item))} /></div>
              </div>
            ))}
            {!loading && queue.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">No callable Nomia leads match the Sweden queue.</div>}
          </div>
        </div>
      </div>
      <ManualCallModal open={manualOpen} onOpenChange={setManualOpen} onDone={lead => lead && setLeads(prev => [lead, ...prev.filter(item => item.id !== lead.id)])} />
    </AppLayout>
  );
}
