import React, { useEffect, useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { fetchCampaign, fetchCampaignRuns, countEligibleLeads, updateCampaign, Campaign, CampaignRun } from '@/lib/campaigns';
import { fetchRecentOutbound, MessageLog } from '@/lib/messages';
import { supabase } from '@/integrations/supabase/client';
import { useParams, Link } from 'react-router-dom';
import { Play, Pause, Send, ArrowLeft, RefreshCw, RotateCcw, Clock, Hash, Timer, Calendar, Globe } from 'lucide-react';
import { toast } from 'sonner';
import type { Country } from '@/lib/cities';
import CountryFlag, { countryLabel } from '@/components/CountryFlag';

const COUNTRY_OPTIONS: { value: Country; label: string }[] = [
  { value: 'SE', label: 'Sweden' },
  { value: 'NO', label: 'Norway' },
  { value: 'DK', label: 'Denmark' },
];

function useNextBatchTimer() {
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    const calc = () => {
      const now = new Date();
      const next = new Date();
      next.setUTCHours(9, 0, 0, 0);
      if (now >= next) next.setDate(next.getDate() + 1);
      const diff = next.getTime() - now.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, []);
  return timeLeft;
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [runs, setRuns] = useState<CampaignRun[]>([]);
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [eligible, setEligible] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [customBatchSize, setCustomBatchSize] = useState<string>('');
  const [selectedCountries, setSelectedCountries] = useState<Country[]>(['SE']);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [scheduledBatches, setScheduledBatches] = useState<{ id: number; at: Date; countries: Country[]; batchSize?: number; timerId: ReturnType<typeof setTimeout> }[]>([]);
  const nextBatch = useNextBatchTimer();

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [c, r] = await Promise.all([fetchCampaign(id), fetchCampaignRuns(id)]);
      setCampaign(c);
      setRuns(r);
      // Set selected countries from campaign filter
      const campCountries = (c.audience_filter as any)?.countries;
      if (campCountries?.length) setSelectedCountries(campCountries);
      const runIds = r.map(run => run.id);
      if (runIds.length > 0) {
        const { data } = await supabase
          .from('message_logs')
          .select('*')
          .eq('direction', 'outbound')
          .in('campaign_run_id', runIds)
          .order('created_at', { ascending: false });
        setMessages((data || []) as MessageLog[]);
      }
      setEligible(await countEligibleLeads(c.audience_filter as any, c.cooldown_days));
    } catch { toast.error('Failed to load campaign'); }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    toast.success('Refreshed');
  };

  const toggleCountry = (c: Country) => {
    setSelectedCountries(prev => 
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    );
  };

  const handleSendBatch = async () => {
    if (!campaign || !id) return;
    if (selectedCountries.length === 0) {
      toast.error('Select at least one country');
      return;
    }
    setSending(true);
    try {
      const body: any = { campaignId: id, countries: selectedCountries };
      if (customBatchSize && Number(customBatchSize) > 0) {
        body.batchSize = Number(customBatchSize);
      }
      const res = await supabase.functions.invoke('send-campaign-batch', { body });
      if (res.error) throw res.error;
      const data = res.data as any;
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success(`Sent ${data.stats?.sent ?? 0} messages (${data.stats?.failed ?? 0} failed, ${data.stats?.skipped_landline ?? 0} landlines skipped)`);
      }
      setCustomBatchSize('');
      await load();
    } catch (err: any) { toast.error(err.message || 'Send failed'); }
    finally { setSending(false); }
  };

  const handleScheduleBatch = () => {
    if (!scheduleDate || !scheduleTime) {
      toast.error('Select date and time');
      return;
    }
    const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`);
    const now = new Date();
    if (scheduledAt <= now) {
      toast.error('Schedule must be in the future');
      return;
    }
    const delay = scheduledAt.getTime() - now.getTime();
    const timeStr = scheduledAt.toLocaleString();
    toast.success(`Batch scheduled for ${timeStr} — sending to ${selectedCountries.map(c => countryLabel(c)).join(', ')}`);
    setShowSchedule(false);
    
    setTimeout(async () => {
      toast.info('Scheduled batch starting now...');
      await handleSendBatch();
    }, delay);
  };

  const handleRetryFailed = async () => {
    if (!id) return;
    setRetrying(true);
    try {
      const failedIds = messages.filter(m => m.status === 'failed').map(m => m.id);
      if (failedIds.length === 0) { toast.info('No failed messages to retry'); setRetrying(false); return; }
      const res = await supabase.functions.invoke('retry-failed-messages', {
        body: { messageIds: failedIds, campaignId: id },
      });
      if (res.error) throw res.error;
      const data = res.data as any;
      toast.success(`Retried ${data.retried ?? 0} messages`);
      await load();
    } catch (err: any) { toast.error(err.message || 'Retry failed'); }
    finally { setRetrying(false); }
  };

  const toggleStatus = async () => {
    if (!campaign || !id) return;
    const newStatus = campaign.status === 'running' ? 'paused' : 'running';
    const updated = await updateCampaign(id, { status: newStatus });
    setCampaign(updated);
    toast.success(`Campaign ${newStatus}`);
  };

  const delivered = messages.filter(m => m.status === 'delivered' || m.status === 'sent');
  const failed = messages.filter(m => m.status === 'failed');
  const undelivered = messages.filter(m => m.status === 'undelivered');

  const totalTarget = campaign?.batch_cap ?? 0;
  const dailyCap = campaign?.daily_cap ?? 100;
  const totalSent = messages.length;
  const remaining = Math.max(0, totalTarget - totalSent);
  const daysLeft = dailyCap > 0 ? Math.ceil(remaining / dailyCap) : 0;

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
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-1.5">
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={toggleStatus} className="gap-1.5">
              {campaign.status === 'running' ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Activate</>}
            </Button>
          </div>
        </div>

        {/* Send controls */}
        <div className="bg-card border border-border rounded-lg p-4 mb-6">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Send Batch</h3>
          
          {/* Country selector */}
          <div className="mb-3">
            <label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1.5">
              <Globe size={12} /> Target Countries
            </label>
            <div className="flex gap-1.5">
              {COUNTRY_OPTIONS.map(c => (
                <button
                  key={c.value}
                  onClick={() => toggleCountry(c.value)}
                  className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                    selectedCountries.includes(c.value) 
                      ? 'bg-primary/15 text-primary border-primary/30' 
                      : 'bg-muted text-muted-foreground border-border hover:border-primary/30'
                  }`}
                >
                  <CountryFlag country={c.value} size={16} /> {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Batch Size (leave empty for default: {campaign.daily_cap})</label>
              <Input
                type="number"
                min="1"
                max="1000"
                value={customBatchSize}
                onChange={e => setCustomBatchSize(e.target.value)}
                placeholder={String(campaign.daily_cap)}
                className="h-8 text-sm"
              />
            </div>
            <Button size="sm" onClick={handleSendBatch} disabled={sending || selectedCountries.length === 0} className="gap-1.5">
              <Send size={13} /> {sending ? 'Sending...' : `Send to ${selectedCountries.map(c => countryLabel(c)).join(', ')}`}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSchedule(!showSchedule)} className="gap-1.5">
              <Calendar size={13} /> Schedule
            </Button>
          </div>

          {showSchedule && (
            <div className="mt-3 p-3 bg-muted/50 border border-border rounded-md space-y-2">
              <p className="text-xs font-medium text-foreground">Schedule batch for later</p>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                  className="h-8 text-sm flex-1"
                  min={new Date().toISOString().split('T')[0]}
                />
                <Input
                  type="time"
                  value={scheduleTime}
                  onChange={e => setScheduleTime(e.target.value)}
                  className="h-8 text-sm w-28"
                />
                <Button size="sm" onClick={handleScheduleBatch} className="gap-1.5 text-xs">
                  <Clock size={12} /> Confirm
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Schedule / Progress */}
        <div className="grid grid-cols-6 gap-3 mb-6">
          {[
            { label: 'Total Target', value: totalTarget, icon: Hash },
            { label: 'Daily Cap', value: dailyCap, icon: Clock },
            { label: 'Sent So Far', value: totalSent, icon: Send },
            { label: 'Next Batch', value: remaining > 0 ? Math.min(dailyCap, remaining) : 0, icon: Send },
            { label: 'Days Left', value: remaining > 0 ? `~${daysLeft}d` : 'Done', icon: Clock },
            { label: 'Next Auto-Send', value: campaign.status === 'running' && remaining > 0 ? nextBatch : '—', icon: Timer },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-lg p-3 text-center">
              <s.icon size={14} className="mx-auto mb-1 text-muted-foreground" />
              <p className={`font-bold text-foreground ${s.label === 'Next Auto-Send' ? 'text-sm' : 'text-lg'}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        {totalTarget > 0 && (
          <div className="mb-6">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>{totalSent} / {totalTarget} sent</span>
              <span>{Math.round((totalSent / totalTarget) * 100)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.min(100, (totalSent / totalTarget) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Template preview */}
        <div className="bg-card border border-border rounded-lg p-4 mb-6">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Template</h3>
          <p className="text-sm text-foreground font-mono whitespace-pre-wrap">{campaign.template_text}</p>
        </div>

        {/* Messages by status */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Messages ({messages.length})</h3>
            {failed.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleRetryFailed} disabled={retrying} className="gap-1.5 text-xs">
                <RotateCcw size={12} className={retrying ? 'animate-spin' : ''} />
                {retrying ? 'Retrying...' : `Retry ${failed.length} Failed`}
              </Button>
            )}
          </div>

          <Tabs defaultValue="delivered">
            <TabsList className="mb-3">
              <TabsTrigger value="delivered" className="gap-1.5 text-xs">
                ✅ Delivered <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">{delivered.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="failed" className="gap-1.5 text-xs">
                ❌ Failed <Badge variant="destructive" className="ml-1 text-[10px] px-1.5">{failed.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="undelivered" className="gap-1.5 text-xs">
                ⚠️ Undelivered <Badge variant="outline" className="ml-1 text-[10px] px-1.5">{undelivered.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="delivered">
              <MessageTable msgs={delivered} />
            </TabsContent>
            <TabsContent value="failed">
              {failed.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4">No failed messages 🎉</p>
              ) : (
                <MessageTable msgs={failed} showError />
              )}
            </TabsContent>
            <TabsContent value="undelivered">
              {undelivered.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4">No undelivered messages</p>
              ) : (
                <MessageTable msgs={undelivered} showError />
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Runs */}
        <div className="mb-10">
          <h3 className="text-sm font-semibold text-foreground mb-3">Runs ({runs.length})</h3>
          {runs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No runs yet. Click "Send Now" to start.</p>
          ) : (
            <div className="space-y-2">
              {runs.slice(0, 10).map(r => {
                const s = r.stats as any;
                return (
                  <div key={r.id} className="bg-card border border-border rounded-lg p-3 text-xs">
                    <div className="flex justify-between mb-1">
                      <span className="text-foreground font-medium">{new Date(r.started_at).toLocaleString()}</span>
                      <div className="flex items-center gap-2">
                        {s?.countries && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            {(s.countries as string[]).map((c: string) => <CountryFlag key={c} country={c} size={14} />)}
                          </span>
                        )}
                        <span className="text-muted-foreground">{r.ended_at ? 'Completed' : 'In progress'}</span>
                      </div>
                    </div>
                    <div className="flex gap-3 text-muted-foreground flex-wrap">
                      {s?.attempted !== undefined && <span>attempted: <span className="text-foreground">{s.attempted}</span></span>}
                      {s?.sent !== undefined && <span>sent: <span className="text-foreground font-semibold">{s.sent}</span></span>}
                      {s?.failed !== undefined && s.failed > 0 && <span className="text-destructive">failed: {s.failed}</span>}
                      {s?.skipped_landline !== undefined && s.skipped_landline > 0 && <span>landlines: {s.skipped_landline}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function MessageTable({ msgs, showError }: { msgs: MessageLog[]; showError?: boolean }) {
  if (msgs.length === 0) return <p className="text-xs text-muted-foreground py-4">No messages</p>;
  return (
    <div className="space-y-1 max-h-80 overflow-y-auto">
      {msgs.map(m => (
        <div key={m.id} className="flex items-start gap-3 py-2 border-b border-border/50 text-xs">
          <span className="text-muted-foreground w-28 shrink-0">{m.to_number}</span>
          <span className="text-foreground flex-1 truncate">{m.body}</span>
          {showError && m.error_message && (
            <span className="text-destructive shrink-0 max-w-48 truncate" title={m.error_message}>{m.error_message}</span>
          )}
          <span className="text-muted-foreground shrink-0 text-[10px]">{new Date(m.created_at).toLocaleTimeString()}</span>
        </div>
      ))}
    </div>
  );
}
