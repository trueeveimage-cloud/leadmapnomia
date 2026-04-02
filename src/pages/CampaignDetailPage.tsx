import React, { useEffect, useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { fetchCampaign, fetchCampaignRuns, countEligibleLeads, countSendableLeads, updateCampaign, createCampaign, Campaign, CampaignRun } from '@/lib/campaigns';
import { fetchRecentOutbound, MessageLog } from '@/lib/messages';
import { supabase } from '@/integrations/supabase/client';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Play, Pause, Send, ArrowLeft, RefreshCw, RotateCcw, Clock, Hash, Timer, Calendar, Globe, DollarSign, Bug, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Copy, Save, Settings2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { AudienceFilter } from '@/lib/campaigns';
import { toast } from 'sonner';
import type { Country } from '@/lib/cities';
import CountryFlag, { countryLabel } from '@/components/CountryFlag';

const COUNTRY_OPTIONS: { value: Country; label: string }[] = [
  { value: 'SE', label: 'Sweden' },
  { value: 'NO', label: 'Norway' },
  { value: 'DK', label: 'Denmark' },
];

interface ScheduledBatch {
  id: string;
  at: string;
  countries: Country[];
  batchSize?: number;
}

const scheduleSettingKey = (campaignId: string) => `campaign_schedule_${campaignId}`;

function parseScheduledBatches(value: string | null | undefined): ScheduledBatch[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ScheduledBatch => {
      return !!item && typeof item.id === 'string' && typeof item.at === 'string' && Array.isArray(item.countries);
    });
  } catch {
    return [];
  }
}

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

const SMS_COST_PER_SEGMENT = 0.065;

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [runs, setRuns] = useState<CampaignRun[]>([]);
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [eligible, setEligible] = useState<number | null>(null);
  const [sendableNow, setSendableNow] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [customBatchSize, setCustomBatchSize] = useState<string>('');
  const [selectedCountries, setSelectedCountries] = useState<Country[]>(['SE']);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [scheduledBatches, setScheduledBatches] = useState<ScheduledBatch[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [editFilter, setEditFilter] = useState<AudienceFilter | null>(null);
  const [savingFilter, setSavingFilter] = useState(false);
  const nextBatch = useNextBatchTimer();

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [c, r, scheduleRes] = await Promise.all([
        fetchCampaign(id),
        fetchCampaignRuns(id),
        supabase.from('settings').select('value').eq('key', scheduleSettingKey(id)).maybeSingle(),
      ]);

      setCampaign(c);
      setRuns(r);
      setScheduledBatches(parseScheduledBatches(scheduleRes.data?.value));

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
      } else {
        setMessages([]);
      }

      setEligible(await countEligibleLeads(c.audience_filter as any, c.cooldown_days));
    } catch {
      toast.error('Failed to load campaign');
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!campaign) return;

    countSendableLeads(campaign.audience_filter as any, selectedCountries)
      .then(setSendableNow)
      .catch(() => setSendableNow(null));
  }, [campaign, selectedCountries]);

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

  const persistScheduledBatches = useCallback(async (next: ScheduledBatch[]) => {
    if (!id) return;
    if (next.length === 0) {
      const { error } = await supabase.from('settings').delete().eq('key', scheduleSettingKey(id));
      if (error) throw error;
      return;
    }
    const { error } = await supabase
      .from('settings')
      .upsert({ key: scheduleSettingKey(id), value: JSON.stringify(next) }, { onConflict: 'key' });
    if (error) throw error;
  }, [id]);

  const handleSendBatch = async () => {
    if (!campaign || !id || sending) return;
    if (selectedCountries.length === 0) {
      toast.error('Select at least one country');
      return;
    }

    const requestedBatchSize = customBatchSize && Number(customBatchSize) > 0
      ? Number(customBatchSize)
      : campaign.daily_cap;

    if (sendableNow === 0) {
      toast.error(`No sendable leads available for ${selectedCountries.map(countryLabel).join(', ')}`);
      return;
    }

    if (sendableNow !== null && requestedBatchSize > sendableNow) {
      toast.error(`Only ${sendableNow} sendable leads available right now`);
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
        toast.success(`Sent ${data.stats?.sent ?? 0} messages (${data.stats?.scanned ?? data.stats?.attempted ?? 0} scanned, ${data.stats?.skipped_landline ?? 0} landlines skipped)`);
      }
      setCustomBatchSize('');
      await load();
    } catch (err: any) { toast.error(err.message || 'Send failed'); }
    finally { setSending(false); }
  };

  const handleScheduleBatch = async () => {
    if (!id) return;
    if (!scheduleDate || !scheduleTime) {
      toast.error('Select date and time');
      return;
    }
    const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`);
    if (Number.isNaN(scheduledAt.getTime())) {
      toast.error('Invalid date/time');
      return;
    }
    if (scheduledAt <= new Date()) {
      toast.error('Schedule must be in the future');
      return;
    }
    const batchCountries = [...selectedCountries];
    const batchSize = customBatchSize && Number(customBatchSize) > 0 ? Number(customBatchSize) : undefined;
    const batchId = crypto.randomUUID();
    const next = [...scheduledBatches, { id: batchId, at: scheduledAt.toISOString(), countries: batchCountries, batchSize }];

    try {
      await persistScheduledBatches(next);
      setScheduledBatches(next);
      toast.success(`Batch scheduled for ${scheduledAt.toLocaleString()}`);
      setShowSchedule(false);
      setScheduleDate('');
      setScheduleTime('09:00');
    } catch (err: any) {
      toast.error(err.message || 'Failed to schedule batch');
    }
  };

  const cancelScheduledBatch = async (batchId: string) => {
    try {
      const next = scheduledBatches.filter(b => b.id !== batchId);
      await persistScheduledBatches(next);
      setScheduledBatches(next);
      toast.info('Scheduled batch cancelled');
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel scheduled batch');
    }
  };

  const handleRetryFailed = async () => {
    if (!id || retrying) return;
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

  const handleDuplicate = async () => {
    if (!campaign) return;
    try {
      const copy = await createCampaign({
        name: `${campaign.name} (copy)`,
        audience_filter: campaign.audience_filter as any,
        template_text: campaign.template_text,
        variables_used: campaign.variables_used as any,
        daily_cap: campaign.daily_cap,
        batch_cap: campaign.batch_cap,
        cooldown_days: campaign.cooldown_days,
        call_after_hours: campaign.call_after_hours,
        status: 'draft',
      });
      toast.success('Campaign duplicated');
      navigate(`/campaigns/${copy.id}`);
    } catch {
      toast.error('Failed to duplicate campaign');
    }
  };

  const handleCompleteCampaign = async () => {
    if (!campaign || !id) return;
    if (!window.confirm('Mark this campaign as completed? It will no longer send messages.')) return;
    const updated = await updateCampaign(id, { status: 'completed' });
    setCampaign(updated);
    toast.success('Campaign marked as completed');
  };

  const handleSaveFilters = async () => {
    if (!campaign || !id || !editFilter) return;
    setSavingFilter(true);
    try {
      const updated = await updateCampaign(id, { audience_filter: editFilter });
      setCampaign(updated);
      setEditFilter(null);
      toast.success('Filters saved');
      setEligible(await countEligibleLeads(updated.audience_filter as any, updated.cooldown_days));
      countSendableLeads(updated.audience_filter as any, selectedCountries).then(setSendableNow);
    } catch {
      toast.error('Failed to save filters');
    }
    setSavingFilter(false);
  };

  // Compute real stats from message_logs
  const deliveredMsgs = messages.filter(m => m.status === 'delivered');
  const sentMsgs = messages.filter(m => m.status === 'sent' || m.status === 'queued');
  const failedMsgs = messages.filter(m => m.status === 'failed');
  const undeliveredMsgs = messages.filter(m => m.status === 'undelivered');

  // Cost from actual messages with provider_message_sid (actually sent to Twilio)
  const computeCost = (msgs: MessageLog[]) => {
    return msgs
      .filter(m => m.provider_message_sid && m.provider_message_sid !== '')
      .reduce((sum, m) => sum + ((m as any).num_segments || 1) * SMS_COST_PER_SEGMENT, 0);
  };

  const deliveredCost = computeCost(deliveredMsgs);
  const failedCost = computeCost(failedMsgs);
  const totalCost = computeCost(messages);
  const requestedBatchSize = customBatchSize && Number(customBatchSize) > 0 ? Number(customBatchSize) : (campaign?.daily_cap ?? 0);
  const requestExceedsAvailability = sendableNow !== null && requestedBatchSize > sendableNow;

  const totalTarget = campaign?.batch_cap ?? 0;
  const dailyCap = campaign?.daily_cap ?? 100;
  const totalDelivered = deliveredMsgs.length;
  const totalSent = messages.length;
  const remaining = Math.max(0, totalTarget - totalDelivered);
  const daysLeft = dailyCap > 0 ? Math.ceil(remaining / dailyCap) : 0;

  const getRunCost = (s: any) => {
    const sent = s?.sent || 0;
    const failedCount = s?.failed || 0;
    return ((sent + failedCount) * SMS_COST_PER_SEGMENT).toFixed(2);
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
              {sendableNow !== null && <> · {sendableNow} sendable now</>}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDuplicate} className="gap-1.5">
              <Copy size={13} /> Duplicate
            </Button>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-1.5">
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh
            </Button>
            {campaign.status !== 'completed' && (
              <>
                <Button variant="outline" size="sm" onClick={toggleStatus} className="gap-1.5">
                  {campaign.status === 'running' ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Activate</>}
                </Button>
                <Button variant="outline" size="sm" onClick={handleCompleteCampaign} className="gap-1.5 text-muted-foreground hover:text-foreground">
                  <CheckCircle size={13} /> Complete
                </Button>
              </>
            )}
            {campaign.status === 'completed' && (
              <Badge variant="secondary" className="text-xs">Completed</Badge>
            )}
          </div>
        </div>

        {/* Send controls */}
        <div className="bg-card border border-border rounded-lg p-4 mb-6">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Send Batch</h3>
          
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
                max="500"
                value={customBatchSize}
                onChange={e => setCustomBatchSize(e.target.value)}
                placeholder={String(campaign.daily_cap)}
                className="h-8 text-sm"
              />
              {sendableNow !== null && (
                <p className={`mt-1 text-[11px] ${requestExceedsAvailability ? 'text-destructive' : 'text-muted-foreground'}`}>
                  Available now for {selectedCountries.map(countryLabel).join(', ')}: {sendableNow}
                </p>
              )}
            </div>
            <Button size="sm" onClick={handleSendBatch} disabled={sending || selectedCountries.length === 0 || requestExceedsAvailability || sendableNow === 0} className="gap-1.5">
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
                <Input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="h-8 text-sm flex-1" min={new Date().toISOString().split('T')[0]} />
                <Input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="h-8 text-sm w-28" />
                <Button size="sm" onClick={handleScheduleBatch} className="gap-1.5 text-xs">
                  <Clock size={12} /> Confirm
                </Button>
              </div>
            </div>
          )}

          {scheduledBatches.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Scheduled Batches</p>
              {scheduledBatches.map(b => (
                <div key={b.id} className="flex items-center justify-between p-2.5 bg-primary/5 border border-primary/20 rounded-md text-xs">
                  <div className="flex items-center gap-2">
                    <Clock size={12} className="text-primary" />
                    <span className="text-foreground font-medium">{new Date(b.at).toLocaleString()}</span>
                    <span className="text-muted-foreground">→ {b.countries.map(c => countryLabel(c)).join(', ')}</span>
                    {b.batchSize && <Badge variant="secondary" className="text-[10px] px-1.5">{b.batchSize} msgs</Badge>}
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] text-destructive hover:text-destructive" onClick={() => cancelScheduledBatch(b.id)}>
                    Cancel
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Progress Metrics — delivery-based */}
        <div className="grid grid-cols-6 gap-3 mb-6">
          {[
            { label: 'Total Target', value: totalTarget || '∞', icon: Hash },
            { label: 'Daily Cap', value: dailyCap, icon: Clock },
            { label: 'Delivered', value: totalDelivered, icon: Send },
            { label: 'Total Cost', value: `$${totalCost.toFixed(2)}`, icon: DollarSign },
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

        {/* Status breakdown bar */}
        <div className="mb-6 bg-card border border-border rounded-lg p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Delivery Breakdown</h3>
          <div className="grid grid-cols-4 gap-3 text-center text-xs">
            <div>
              <p className="text-lg font-bold text-foreground">{sentMsgs.length}</p>
              <p className="text-muted-foreground">Queued/Sent</p>
            </div>
            <div>
              <p className="text-lg font-bold text-green-500">{deliveredMsgs.length}</p>
              <p className="text-muted-foreground">Delivered ✓</p>
            </div>
            <div>
              <p className="text-lg font-bold text-destructive">{failedMsgs.length}</p>
              <p className="text-muted-foreground">Failed</p>
            </div>
            <div>
              <p className="text-lg font-bold text-amber-500">{undeliveredMsgs.length}</p>
              <p className="text-muted-foreground">Undelivered</p>
            </div>
          </div>

          {/* Cost breakdown */}
          <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-3 text-center text-xs">
            <div>
              <p className="font-semibold text-foreground">${deliveredCost.toFixed(2)}</p>
              <p className="text-muted-foreground">Delivered cost</p>
            </div>
            <div>
              <p className="font-semibold text-destructive">${failedCost.toFixed(2)}</p>
              <p className="text-muted-foreground">Wasted (failed)</p>
            </div>
            <div>
              <p className="font-semibold text-foreground">${totalCost.toFixed(2)}</p>
              <p className="text-muted-foreground">Total cost</p>
            </div>
          </div>
        </div>

        {/* Progress bar — delivery-based */}
        {totalTarget > 0 && (
          <div className="mb-6">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>{totalDelivered} / {totalTarget} delivered</span>
              <span>{Math.round((totalDelivered / totalTarget) * 100)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, (totalDelivered / totalTarget) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Audience Filters */}
        <div className="bg-card border border-border rounded-lg p-4 mb-6">
          <button
            onClick={() => {
              if (!showFilters && !editFilter) setEditFilter({ ...(campaign.audience_filter as AudienceFilter) });
              setShowFilters(!showFilters);
            }}
            className="flex items-center gap-2 w-full text-left"
          >
            <Settings2 size={14} className="text-muted-foreground" />
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Audience Filters</h3>
            {showFilters ? <ChevronUp size={12} className="text-muted-foreground ml-auto" /> : <ChevronDown size={12} className="text-muted-foreground ml-auto" />}
          </button>

          {!showFilters && (
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              {(campaign.audience_filter as AudienceFilter)?.sections?.length ? (
                <Badge variant="secondary" className="text-[10px]">Sections: {(campaign.audience_filter as AudienceFilter).sections!.join(', ')}</Badge>
              ) : null}
              {(campaign.audience_filter as AudienceFilter)?.minRating && <Badge variant="secondary" className="text-[10px]">Rating ≥ {(campaign.audience_filter as AudienceFilter).minRating}</Badge>}
              {(campaign.audience_filter as AudienceFilter)?.minReviews != null && <Badge variant="secondary" className="text-[10px]">Reviews ≥ {(campaign.audience_filter as AudienceFilter).minReviews}</Badge>}
              {(campaign.audience_filter as AudienceFilter)?.hasWebsite === false && <Badge variant="secondary" className="text-[10px]">No website</Badge>}
              {(campaign.audience_filter as AudienceFilter)?.excludeOptOut !== false && <Badge variant="secondary" className="text-[10px]">Exclude opt-out</Badge>}
              {(campaign.audience_filter as AudienceFilter)?.excludeReplied !== false && <Badge variant="secondary" className="text-[10px]">Exclude replied</Badge>}
            </div>
          )}

          {showFilters && editFilter && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Min Rating</Label>
                  <Input
                    type="number" step="0.1" min="0" max="5"
                    value={editFilter.minRating ?? ''}
                    onChange={e => setEditFilter({ ...editFilter, minRating: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="No minimum"
                    className="h-8 text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Min Reviews</Label>
                  <Input
                    type="number" min="0"
                    value={editFilter.minReviews ?? ''}
                    onChange={e => setEditFilter({ ...editFilter, minReviews: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="No minimum"
                    className="h-8 text-sm mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Sections (comma-separated, or leave empty for all)</Label>
                <Input
                  value={editFilter.sections?.join(', ') ?? ''}
                  onChange={e => setEditFilter({ ...editFilter, sections: e.target.value.trim() ? e.target.value.split(',').map(s => s.trim()) : undefined })}
                  placeholder="e.g. phone, email"
                  className="h-8 text-sm mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Daily Cap</Label>
                  <Input
                    type="number" min="1"
                    value={campaign.daily_cap}
                    onChange={async (e) => {
                      const val = Number(e.target.value);
                      if (val > 0) {
                        const updated = await updateCampaign(id!, { daily_cap: val });
                        setCampaign(updated);
                      }
                    }}
                    className="h-8 text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Batch Cap (total target)</Label>
                  <Input
                    type="number" min="0"
                    value={campaign.batch_cap}
                    onChange={async (e) => {
                      const val = Number(e.target.value);
                      const updated = await updateCampaign(id!, { batch_cap: val });
                      setCampaign(updated);
                    }}
                    className="h-8 text-sm mt-1"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editFilter.hasWebsite === false}
                    onCheckedChange={v => setEditFilter({ ...editFilter, hasWebsite: v ? false : undefined })}
                  />
                  <Label className="text-xs">Only without website</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editFilter.excludeOptOut !== false}
                    onCheckedChange={v => setEditFilter({ ...editFilter, excludeOptOut: v })}
                  />
                  <Label className="text-xs">Exclude opt-out</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editFilter.excludeReplied !== false}
                    onCheckedChange={v => setEditFilter({ ...editFilter, excludeReplied: v })}
                  />
                  <Label className="text-xs">Exclude replied</Label>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={handleSaveFilters} disabled={savingFilter} className="gap-1.5">
                  <Save size={13} /> {savingFilter ? 'Saving...' : 'Save Filters'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setShowFilters(false); setEditFilter(null); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Template preview */}
        <div className="bg-card border border-border rounded-lg p-4 mb-6">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Template</h3>
          <p className="text-sm text-foreground font-mono whitespace-pre-wrap">{campaign.template_text}</p>
        </div>

        {/* Messages by status */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Messages ({messages.length})</h3>
            {failedMsgs.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleRetryFailed} disabled={retrying} className="gap-1.5 text-xs">
                <RotateCcw size={12} className={retrying ? 'animate-spin' : ''} />
                {retrying ? 'Retrying...' : `Retry ${failedMsgs.length} Failed`}
              </Button>
            )}
          </div>

          <Tabs defaultValue="delivered">
            <TabsList className="mb-3">
              <TabsTrigger value="delivered" className="gap-1.5 text-xs">
                ✅ Delivered <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">{deliveredMsgs.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="failed" className="gap-1.5 text-xs">
                ❌ Failed <Badge variant="destructive" className="ml-1 text-[10px] px-1.5">{failedMsgs.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="undelivered" className="gap-1.5 text-xs">
                ⚠️ Undelivered <Badge variant="outline" className="ml-1 text-[10px] px-1.5">{undeliveredMsgs.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="queued" className="gap-1.5 text-xs">
                🕐 Queued <Badge variant="outline" className="ml-1 text-[10px] px-1.5">{sentMsgs.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="delivered">
              <MessageTable msgs={deliveredMsgs} />
            </TabsContent>
            <TabsContent value="failed">
              {failedMsgs.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4">No failed messages 🎉</p>
              ) : (
                <MessageTable msgs={failedMsgs} showError />
              )}
            </TabsContent>
            <TabsContent value="undelivered">
              {undeliveredMsgs.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4">No undelivered messages</p>
              ) : (
                <MessageTable msgs={undeliveredMsgs} showError />
              )}
            </TabsContent>
            <TabsContent value="queued">
              {sentMsgs.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4">No queued messages</p>
              ) : (
                <MessageTable msgs={sentMsgs} />
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Runs */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">Runs ({runs.length})</h3>
          {runs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No runs yet. Click "Send Now" to start.</p>
          ) : (
            <div className="space-y-2">
              {runs.slice(0, 10).map(r => {
                const s = r.stats as any;
                const scannedCount = s?.scanned ?? s?.attempted;
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
                      {scannedCount !== undefined && <span>scanned: <span className="text-foreground">{scannedCount}</span></span>}
                      {s?.scanned !== undefined && <span>send attempts: <span className="text-foreground">{s.attempted}</span></span>}
                      {s?.sent !== undefined && <span>sent: <span className="text-foreground font-semibold">{s.sent}</span></span>}
                      {s?.failed !== undefined && s.failed > 0 && <span className="text-destructive">failed: {s.failed}</span>}
                      {s?.skipped_landline !== undefined && s.skipped_landline > 0 && <span>landlines skipped: {s.skipped_landline}</span>}
                      {s?.skipped_idempotency !== undefined && s.skipped_idempotency > 0 && (
                        <span className="text-amber-500">dupes skipped: {s.skipped_idempotency}</span>
                      )}
                      <span className="text-amber-500 font-medium">💰 ${getRunCost(s)}</span>
                      {s?.failed > 0 && <span className="text-destructive/70">({(s.failed * SMS_COST_PER_SEGMENT).toFixed(2)} wasted)</span>}
                    </div>
                    {/* Scan log */}
                    {s?.scanLog && Array.isArray(s.scanLog) && (
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <p className="text-[10px] text-muted-foreground font-medium mb-1">Scan Log:</p>
                        {(s.scanLog as string[]).map((line: string, i: number) => (
                          <p key={i} className="text-[10px] text-muted-foreground font-mono">{line}</p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Debug Panel */}
        <div className="mb-10">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <Bug size={14} />
            <span className="font-semibold uppercase tracking-wider">Campaign Debug</span>
            {showDebug ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {showDebug && (
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-2">Last 50 send attempts</p>
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {messages.slice(0, 50).map(m => (
                  <div key={m.id} className="flex items-start gap-2 py-1.5 border-b border-border/30 text-[10px] font-mono">
                    <span className="text-muted-foreground w-16 shrink-0">{m.status}</span>
                    <span className="text-muted-foreground w-28 shrink-0">{m.to_number}</span>
                    <span className="text-muted-foreground w-20 shrink-0 truncate" title={m.provider_message_sid || ''}>{m.provider_message_sid?.slice(0, 12) || '—'}</span>
                    <span className="text-muted-foreground w-8 shrink-0">{(m as any).num_segments || 1}seg</span>
                    <span className="text-muted-foreground w-14 shrink-0">${(((m as any).num_segments || 1) * SMS_COST_PER_SEGMENT).toFixed(3)}</span>
                    {m.error_message && (
                      <span className="text-destructive truncate flex-1" title={m.error_message}>
                        <AlertTriangle size={10} className="inline mr-1" />{m.error_message}
                      </span>
                    )}
                    <span className="text-muted-foreground shrink-0">{new Date(m.created_at).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
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
          <span className="text-foreground flex-1 whitespace-pre-wrap break-words">{m.body}</span>
          {showError && m.error_message && (
            <span className="text-destructive shrink-0 max-w-48 truncate" title={m.error_message}>{m.error_message}</span>
          )}
          <span className="text-muted-foreground shrink-0 text-[10px]">{new Date(m.created_at).toLocaleTimeString()}</span>
        </div>
      ))}
    </div>
  );
}
