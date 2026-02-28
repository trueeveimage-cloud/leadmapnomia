import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { fetchCampaign, fetchCampaignRuns, countEligibleLeads, updateCampaign, Campaign, CampaignRun, renderTemplate } from '@/lib/campaigns';
import { fetchRecentOutbound, MessageLog } from '@/lib/messages';
import { supabase } from '@/integrations/supabase/client';
import { useParams, Link } from 'react-router-dom';
import { Play, Pause, Zap, Download, ArrowLeft, Send } from 'lucide-react';
import { toast } from 'sonner';
import InfoTip from '@/components/InfoTip';

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [runs, setRuns] = useState<CampaignRun[]>([]);
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [eligible, setEligible] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      try {
        const [c, r] = await Promise.all([fetchCampaign(id), fetchCampaignRuns(id)]);
        setCampaign(c);
        setRuns(r);
        if (r.length > 0) {
          setMessages(await fetchRecentOutbound(r[0].id));
        }
        setEligible(await countEligibleLeads(c.audience_filter as any, c.cooldown_days));
      } catch { toast.error('Failed to load campaign'); }
      finally { setLoading(false); }
    };
    load();
  }, [id]);

  const handleSendBatch = async () => {
    if (!campaign || !id) return;
    setSending(true);
    try {
      const res = await supabase.functions.invoke('send-campaign-batch', {
        body: { campaignId: id },
      });
      if (res.error) throw res.error;
      const data = res.data as any;
      toast.success(`Sent ${data.stats?.sent ?? 0} messages`);
      // Refresh
      const [r] = await Promise.all([fetchCampaignRuns(id)]);
      setRuns(r);
      if (r.length > 0) setMessages(await fetchRecentOutbound(r[0].id));
      setEligible(await countEligibleLeads(campaign.audience_filter as any, campaign.cooldown_days));
    } catch (err: any) { toast.error(err.message || 'Send failed'); }
    finally { setSending(false); }
  };

  const toggleStatus = async () => {
    if (!campaign || !id) return;
    const newStatus = campaign.status === 'running' ? 'paused' : 'running';
    const updated = await updateCampaign(id, { status: newStatus });
    setCampaign(updated);
    toast.success(`Campaign ${newStatus}`);
  };

  if (loading) return <AppLayout><div className="p-10 text-sm text-muted-foreground">Loading...</div></AppLayout>;
  if (!campaign) return <AppLayout><div className="p-10 text-sm text-destructive">Campaign not found</div></AppLayout>;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-6 pt-8">
        <Link to="/campaigns" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mb-4">
          <ArrowLeft size={12} /> Back to campaigns
        </Link>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">{campaign.name}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Status: <span className="text-foreground font-medium">{campaign.status}</span>
              {eligible !== null && <> · {eligible} leads eligible</>}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={toggleStatus} className="h-8 text-sm gap-1.5">
              {campaign.status === 'running' ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Activate</>}
            </Button>
            <Button onClick={handleSendBatch} disabled={sending} className="h-8 text-sm gap-1.5">
              <Send size={13} /> {sending ? 'Sending...' : 'Send Batch Now'}
            </Button>
          </div>
        </div>


        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Daily Cap', value: campaign.daily_cap },
            { label: 'Batch Cap', value: campaign.batch_cap },
            { label: 'Cooldown', value: `${campaign.cooldown_days}d` },
            { label: 'Call After', value: `${campaign.call_after_hours}h` },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-foreground">{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Template preview */}
        <div className="bg-card border border-border rounded-lg p-4 mb-6">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Template</h3>
          <p className="text-sm text-foreground font-mono whitespace-pre-wrap">{campaign.template_text}</p>
        </div>

        {/* Runs */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">Recent Runs ({runs.length})</h3>
          {runs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No runs yet. Click "Send Batch Now" to start.</p>
          ) : (
            <div className="space-y-2">
              {runs.slice(0, 5).map(r => (
                <div key={r.id} className="bg-card border border-border rounded-lg p-3 text-xs">
                  <div className="flex justify-between mb-1">
                    <span className="text-foreground font-medium">{new Date(r.started_at).toLocaleString()}</span>
                    <span className="text-muted-foreground">{r.ended_at ? 'Completed' : 'In progress'}</span>
                  </div>
                  <div className="flex gap-3 text-muted-foreground">
                    {Object.entries(r.stats).map(([k, v]) => (
                      <span key={k}>{k}: <span className="text-foreground">{v as number}</span></span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent messages */}
        <div className="mb-10">
          <h3 className="text-sm font-semibold text-foreground mb-3">Recent Outbound Messages</h3>
          {messages.length === 0 ? (
            <p className="text-xs text-muted-foreground">No messages sent yet.</p>
          ) : (
            <div className="space-y-1">
              {messages.map(m => (
                <div key={m.id} className="flex items-center gap-3 py-2 border-b border-border/50 text-xs">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${m.status === 'delivered' ? 'bg-green' : m.status === 'failed' ? 'bg-destructive' : 'bg-amber'}`} />
                  <span className="text-muted-foreground w-20 shrink-0">{m.to_number}</span>
                  <span className="text-foreground flex-1 truncate">{m.body}</span>
                  <span className="text-muted-foreground shrink-0">{m.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
