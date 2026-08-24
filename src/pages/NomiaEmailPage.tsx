/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Loader2, Mail, RefreshCw, Save, Send, ShieldAlert } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { fetchLeads, getSetting, setSetting, type Lead } from '@/lib/supabase';
import { isDoNotContact, isSwedishLead, renderNomiaTemplate } from '@/lib/nomiaWorkspace';
import { toast } from 'sonner';

const DEFAULT_SUBJECT = 'En snabb fråga om {{business_name}}';
const DEFAULT_BODY = `Hej {{owner_name}},

Jag tittade på {{business_name}} och såg några konkreta möjligheter att förbättra hur företaget syns och omvandlar besökare till kunder online.

Jag kan visa ett kort, kostnadsfritt förslag anpassat för er. Är det intressant att ta ett 15-minuters samtal denna vecka?

Vänliga hälsningar,
Maged
Nomia`;

type Recipient = {
  id: string;
  campaign_id: string;
  lead_id: string;
  rendered_subject: string;
  rendered_body: string;
  status: string;
  leads?: Lead;
};

type Campaign = {
  id: string;
  name: string;
  status: string;
  approval_status: string;
  created_at: string;
};

export default function NomiaEmailPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [masterPaused, setMasterPaused] = useState(true);
  const [gmailPaused, setGmailPaused] = useState(true);

  const loadCampaign = useCallback(async () => {
    const client = supabase as any;
    const { data } = await client.from('campaigns').select('*').eq('product', 'nomia').eq('channel', 'email').in('approval_status', ['ready_for_review', 'approved']).order('created_at', { ascending: false }).limit(1).maybeSingle();
    setCampaign(data || null);
    if (data) {
      const { data: rows } = await client.from('campaign_recipients').select('*,leads(*)').eq('campaign_id', data.id).order('position', { ascending: true });
      setRecipients(rows || []);
    } else setRecipients([]);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, savedSubject, savedBody, master, gmail] = await Promise.all([
        fetchLeads({ product: 'nomia' }), getSetting('nomia_gmail_subject'), getSetting('nomia_gmail_body'), getSetting('outreach_master_paused'), getSetting('nomia_gmail_paused'),
      ]);
      setLeads(rows);
      setSubject(savedSubject || DEFAULT_SUBJECT);
      setBody(savedBody || DEFAULT_BODY);
      setMasterPaused(master !== 'false');
      setGmailPaused(gmail !== 'false');
      const fromLeads = JSON.parse(sessionStorage.getItem('nomia.email.selectedLeadIds') || '[]') as string[];
      setSelectedIds(new Set(fromLeads.slice(0, 10)));
      sessionStorage.removeItem('nomia.email.selectedLeadIds');
      await loadCampaign();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not load Gmail workspace'); }
    finally { setLoading(false); }
  }, [loadCampaign]);
  useEffect(() => { void load(); }, [load]);

  const eligible = useMemo(() => leads.filter(lead => isSwedishLead(lead) && !!lead.email && !isDoNotContact(lead) && !lead.has_replied && !['closed_won', 'closed_lost', 'not_interested'].includes(lead.status)), [leads]);
  const allReviewed = recipients.length > 0 && recipients.every(item => item.status === 'reviewed' || item.status === 'approved' || item.status === 'sent');

  const saveTemplate = async () => {
    await Promise.all([setSetting('nomia_gmail_subject', subject), setSetting('nomia_gmail_body', body)]);
    toast.success('Nomia Gmail template saved');
  };

  const createReview = async () => {
    const chosen = eligible.filter(lead => selectedIds.has(lead.id)).slice(0, 10);
    if (!chosen.length) return;
    setWorking(true);
    try {
      const client = supabase as any;
      const { data: created, error } = await client.from('campaigns').insert({
        name: `Nomia Gmail review ${new Date().toLocaleDateString('sv-SE')}`,
        product: 'nomia', channel: 'email', approval_status: 'ready_for_review', status: 'paused',
        audience_filter: { countries: ['SE'], lead_ids: chosen.map(lead => lead.id) }, daily_cap: 10, batch_cap: chosen.length,
        template_text: body, email_subject: subject,
      }).select('*').single();
      if (error) throw error;
      const rows = chosen.map((lead, position) => ({
        campaign_id: created.id, lead_id: lead.id, position, status: 'pending_review',
        rendered_subject: renderNomiaTemplate(subject, lead), rendered_body: renderNomiaTemplate(body, lead), eligibility_snapshot: { email: lead.email, country: 'SE' },
      }));
      const { error: recipientError } = await client.from('campaign_recipients').insert(rows);
      if (recipientError) throw recipientError;
      setSelectedIds(new Set());
      await loadCampaign();
      toast.success('Review batch created. Nothing was sent.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not create review batch'); }
    finally { setWorking(false); }
  };

  const markReviewed = async (recipient: Recipient, reviewed: boolean) => {
    const status = reviewed ? 'reviewed' : 'pending_review';
    const { error } = await (supabase as any).from('campaign_recipients').update({ status }).eq('id', recipient.id);
    if (error) return toast.error(error.message);
    setRecipients(prev => prev.map(item => item.id === recipient.id ? { ...item, status } : item));
  };

  const approve = async () => {
    if (!campaign || !allReviewed) return;
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await (supabase as any).from('campaigns').update({ approval_status: 'approved', approved_at: new Date().toISOString(), approved_by: session?.user.id, status: 'paused' }).eq('id', campaign.id);
    if (error) return toast.error(error.message);
    await (supabase as any).from('campaign_recipients').update({ status: 'approved' }).eq('campaign_id', campaign.id).eq('status', 'reviewed');
    await loadCampaign();
    toast.success('Batch approved. It remains paused until you explicitly send it.');
  };

  const sendApproved = async () => {
    if (!campaign || campaign.approval_status !== 'approved') return;
    const [master, gmail] = await Promise.all([getSetting('outreach_master_paused'), getSetting('nomia_gmail_paused')]);
    if (master !== 'false' || gmail !== 'false') {
      toast.error('Sending is blocked by the master or Gmail pause.');
      return;
    }
    const pending = recipients.filter(item => item.status === 'approved');
    if (!window.confirm(`Send exactly ${pending.length} reviewed emails now? This contacts real businesses.`)) return;
    setWorking(true);
    let sent = 0;
    try {
      await (supabase as any).from('campaigns').update({ status: 'running' }).eq('id', campaign.id);
      for (const recipient of pending) {
        const lead = recipient.leads;
        if (!lead?.email) continue;
        const { data, error } = await supabase.functions.invoke('send-gmail', { body: { leadId: lead.id, campaignRecipientId: recipient.id, to: lead.email, subject: recipient.rendered_subject, body: recipient.rendered_body } });
        const status = !error && !data?.error && !data?.skipped ? 'sent' : 'blocked';
        await (supabase as any).from('campaign_recipients').update({ status, sent_at: status === 'sent' ? new Date().toISOString() : null, error_message: error?.message || data?.error || data?.reason || null }).eq('id', recipient.id);
        if (status === 'sent') sent++;
      }
      await (supabase as any).from('campaigns').update({ status: 'completed' }).eq('id', campaign.id);
      toast.success(`Batch complete: ${sent} sent.`);
      await loadCampaign();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Batch send failed'); }
    finally { setWorking(false); }
  };

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
          <div><div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Nomia</div><h1 className="mt-1 text-2xl font-semibold">Gmail review desk</h1><p className="mt-1 text-sm text-muted-foreground">Select leads, preview every message, approve the batch, then explicitly send.</p></div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</Button>
        </header>

        <div className={`mt-4 flex gap-3 border p-3 ${masterPaused || gmailPaused ? 'border-amber-400/25 bg-amber-400/5' : 'border-emerald-400/25 bg-emerald-400/5'}`}>
          <ShieldAlert size={17} className="mt-0.5 shrink-0 text-amber-300" /><div><div className="text-sm font-medium">{masterPaused || gmailPaused ? 'Real Gmail sending is paused' : 'Gmail sending is enabled'}</div><div className="text-xs text-muted-foreground">Templates and review batches persist while paused. Duplicate and Do Not Contact checks still run at send time.</div></div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[380px_1fr]">
          <section className="border border-border bg-card">
            <div className="border-b border-border p-4"><h2 className="text-sm font-semibold">1. Select Swedish leads</h2><p className="text-xs text-muted-foreground">Maximum 10 per reviewed batch.</p></div>
            <div className="max-h-[620px] divide-y divide-border overflow-y-auto">
              {eligible.slice(0, 300).map(lead => <label key={lead.id} className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-secondary/40"><input type="checkbox" className="mt-1" checked={selectedIds.has(lead.id)} disabled={selectedIds.size >= 10 && !selectedIds.has(lead.id)} onChange={e => setSelectedIds(prev => { const next = new Set(prev); if (e.target.checked) next.add(lead.id); else next.delete(lead.id); return next; })} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{lead.name}</span><span className="block truncate text-xs text-muted-foreground">{lead.email} · {lead.city || 'Sweden'}</span></span></label>)}
            </div>
          </section>

          <div className="space-y-5">
            <section className="border border-border bg-card p-4">
              <div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">2. Write template</h2><p className="text-xs text-muted-foreground">Variables: {'{{business_name}}'}, {'{{owner_name}}'}, {'{{city}}'}, {'{{niche}}'}.</p></div><Button variant="outline" size="sm" onClick={saveTemplate} className="gap-2"><Save size={13} /> Save</Button></div>
              <Input value={subject} onChange={e => setSubject(e.target.value)} className="mt-4" />
              <Textarea value={body} onChange={e => setBody(e.target.value)} className="mt-3 min-h-48 font-mono text-sm" />
              <Button onClick={createReview} disabled={!selectedIds.size || working} className="mt-3 gap-2">{working ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />} Create review ({selectedIds.size})</Button>
            </section>

            <section className="border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4"><div><h2 className="text-sm font-semibold">3. Review and approve</h2><p className="text-xs text-muted-foreground">{campaign ? campaign.name : 'No active review batch'}</p></div>{campaign && <span className="rounded border border-border bg-secondary px-2 py-1 text-xs">{campaign.approval_status.replace(/_/g, ' ')}</span>}</div>
              <div className="max-h-[620px] divide-y divide-border overflow-y-auto">
                {recipients.map(recipient => <div key={recipient.id} className="p-4"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={['reviewed', 'approved', 'sent'].includes(recipient.status)} disabled={['approved', 'sent'].includes(recipient.status)} onChange={e => markReviewed(recipient, e.target.checked)} />{recipient.leads?.name || recipient.lead_id}<span className="ml-auto text-xs font-normal text-muted-foreground">{recipient.status.replace(/_/g, ' ')}</span></label><div className="mt-3 rounded-md border border-border bg-background p-3"><div className="text-sm font-medium">{recipient.rendered_subject}</div><div className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{recipient.rendered_body}</div></div></div>)}
                {!campaign && <div className="p-10 text-center text-sm text-muted-foreground"><Mail size={20} className="mx-auto mb-2" />Create a batch to begin reviewing.</div>}
              </div>
              {campaign && <div className="flex flex-wrap gap-2 border-t border-border p-4"><Button onClick={approve} disabled={!allReviewed || campaign.approval_status === 'approved'} className="gap-2"><Check size={14} /> Approve reviewed batch</Button><Button variant="secondary" onClick={sendApproved} disabled={campaign.approval_status !== 'approved' || working || masterPaused || gmailPaused} className="gap-2"><Send size={14} /> Send approved batch</Button></div>}
            </section>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
