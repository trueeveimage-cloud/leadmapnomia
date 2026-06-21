/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Database,
  Mail,
  PhoneCall,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { EMPTY_LEAD_SUPPLY_STATS, loadLeadmapSupplyStats, type LeadSupplyStats } from '@/lib/leadSupply';
import { cn } from '@/lib/utils';
import { connectedCallStatus, gmailTargetForToday } from '@/lib/outreachEligibility';

type ReadinessStatus = 'ready' | 'warning' | 'blocked' | 'checking';

type LaunchItem = {
  key: string;
  label: string;
  value: string;
  detail: string;
  status: ReadinessStatus;
};

type LogItem = {
  id: string;
  time: string;
  source: string;
  title: string;
  detail: string;
  status: ReadinessStatus;
};

type DailyStat = {
  date: string;
  gmail: number;
  calls: number;
  connected: number;
};

type Diagnostics = {
  items: LaunchItem[];
  buckets: LeadSupplyStats;
  logs: LogItem[];
  daily: DailyStat[];
  blockers: string[];
  warnings: string[];
  emailSentToday: number;
  callsStartedToday: number;
  connectedCallsToday: number;
  emailCap: number;
  callCap: number;
  windowLabel: string;
  nextCheckLabel: string;
  windowOpen: boolean;
};

const DEFAULT_SETTINGS: Record<string, string> = {
  gmail_autosend_enabled: 'true',
  gmail_autosend_daily: '100',
  ai_calls_enabled: 'true',
  ai_calls_daily_connected_cap: '15',
  ai_calls_daily: '15',
  ai_calls_start_hour: '10',
  ai_calls_start_minute: '0',
  ai_calls_end_hour: '17',
  ai_calls_end_minute: '30',
  ai_calls_days: '1,2,3,4,5',
  ai_calls_product: 'leadmap',
};

const REQUIRED_GMAIL_KEYS = ['GOOGLE_MAIL_API_KEY', 'LOVABLE_API_KEY'];
const REQUIRED_RETELL_KEYS = ['RETELL_API_KEY', 'RETELL_AGENT_ID', 'RETELL_FROM_NUMBER'];

function startOfTodayIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function startOfDaysAgoIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function dayKey(value: string | Date) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function shortDay(value: string | Date) {
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatTime(value?: string | null) {
  if (!value) return '--:--';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isMissing(value?: string | null) {
  const text = String(value || '').toUpperCase();
  return !text || text.includes('MISSING') || text.includes('NOT SET');
}

function hasSecret(health: Record<string, string>, key: string) {
  return !isMissing(health[key]);
}

function intSetting(settings: Record<string, string>, key: string, fallback: number) {
  const value = Number.parseInt(settings[key] || '', 10);
  return Number.isFinite(value) ? value : fallback;
}

function minutesOfDay(hour: number, minute: number) {
  return hour * 60 + minute;
}

function scheduleStatus(settings: Record<string, string>) {
  const days = String(settings.ai_calls_days || DEFAULT_SETTINGS.ai_calls_days)
    .split(',')
    .map(day => Number(day.trim()))
    .filter(day => Number.isFinite(day));
  const now = new Date();
  const startHour = intSetting(settings, 'ai_calls_start_hour', 10);
  const startMinute = intSetting(settings, 'ai_calls_start_minute', 0);
  const endHour = intSetting(settings, 'ai_calls_end_hour', 17);
  const endMinute = intSetting(settings, 'ai_calls_end_minute', 30);
  const current = minutesOfDay(now.getHours(), now.getMinutes());
  const start = minutesOfDay(startHour, startMinute);
  const end = minutesOfDay(endHour, endMinute);
  const activeDay = days.includes(now.getDay());
  const open = activeDay && current >= start && current < end;
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const next = new Date(now);
  next.setSeconds(0, 0);
  const rounded = Math.ceil(next.getMinutes() / 5) * 5;
  next.setMinutes(rounded === 60 ? 0 : rounded);
  if (rounded === 60) next.setHours(next.getHours() + 1);
  let nextLabel: string;
  if (open) nextLabel = `next cron check around ${formatTime(next.toISOString())}`;
  else if (isWeekend) {
    const daysUntilMonday = now.getDay() === 0 ? 1 : 2;
    nextLabel = `weekend pause — resumes ${daysUntilMonday === 1 ? 'tomorrow' : `in ${daysUntilMonday} days`} at ${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`;
  }
  else if (activeDay) nextLabel = 'waiting for the work window';
  else nextLabel = 'paused until the next selected weekday';
  return {
    open,
    activeDay,
    isWeekend,
    label: `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}-${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`,
    nextLabel,
  };
}

function itemClass(status: ReadinessStatus) {
  if (status === 'ready') return 'border-emerald-500/30 bg-emerald-500/10';
  if (status === 'warning') return 'border-amber-500/30 bg-amber-500/10';
  if (status === 'blocked') return 'border-destructive/30 bg-destructive/10';
  return 'border-border bg-muted/20';
}

function statusIcon(status: ReadinessStatus) {
  if (status === 'ready') return <CheckCircle2 size={15} className="text-emerald-500" />;
  if (status === 'warning') return <AlertTriangle size={15} className="text-amber-500" />;
  if (status === 'blocked') return <AlertTriangle size={15} className="text-destructive" />;
  return <Clock size={15} className="text-muted-foreground" />;
}

function statusBadge(status: ReadinessStatus) {
  if (status === 'ready') return <Badge className="bg-emerald-500 text-white hover:bg-emerald-500">Ready</Badge>;
  if (status === 'warning') return <Badge className="bg-amber-500 text-white hover:bg-amber-500">Check</Badge>;
  if (status === 'blocked') return <Badge variant="destructive">Blocked</Badge>;
  return <Badge variant="outline">Checking</Badge>;
}

function asText(value: unknown) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function loadDiagnostics(): Promise<Diagnostics> {
  const sb = supabase as any;
  const today = startOfTodayIso();
  const since = startOfDaysAgoIso(6);
  const settingsKeys = [
    'gmail_autosend_enabled',
    'gmail_autosend_daily',
    'ai_calls_enabled',
    'ai_calls_daily_connected_cap',
    'ai_calls_daily',
    'ai_calls_start_hour',
    'ai_calls_start_minute',
    'ai_calls_end_hour',
    'ai_calls_end_minute',
    'ai_calls_days',
    'ai_calls_product',
  ];

  const [settingsRes, supplyRes, emailTodayRes, messageRowsRes, activityRowsRes, connectedRowsRes, notificationRowsRes, diagRes, previewRes] = await Promise.allSettled([
    sb.from('settings').select('key,value').in('key', settingsKeys),
    loadLeadmapSupplyStats(),
    sb
      .from('message_logs')
      .select('id', { count: 'exact', head: true })
      .eq('channel', 'email')
      .eq('direction', 'outbound')
      .eq('status', 'sent')
      .gte('created_at', today),
    sb
      .from('message_logs')
      .select('id,created_at,channel,direction,status,to_number,error_message,body,product')
      .eq('direction', 'outbound')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(300),
    sb
      .from('activities')
      .select('id,created_at,type,description')
      .eq('type', 'ai_call_started')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(300),
    sb
      .from('leads')
      .select('id,last_contacted_at,call_status,call_connected')
      .eq('last_contact_method', 'AI Call')
      .gte('last_contacted_at', since)
      .limit(1000),
    sb
      .from('app_notifications')
      .select('id,type,title,message,payload,created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.functions.invoke('diag-env'),
    supabase.functions.invoke('auto-start-ai-calls-daily', { body: { preview: true } }),
  ]);

  const settings = { ...DEFAULT_SETTINGS };
  if (settingsRes.status === 'fulfilled') {
    for (const row of settingsRes.value.data || []) settings[row.key] = row.value;
  }

  const buckets = supplyRes.status === 'fulfilled' ? supplyRes.value : EMPTY_LEAD_SUPPLY_STATS;
  const emailCap = gmailTargetForToday(intSetting(settings, 'gmail_autosend_daily', 100));
  const callCap = intSetting(settings, 'ai_calls_daily_connected_cap', intSetting(settings, 'ai_calls_daily', 15));
  const emailSentToday = emailTodayRes.status === 'fulfilled' ? (emailTodayRes.value.count || 0) : 0;
  const messageRows = messageRowsRes.status === 'fulfilled' ? (messageRowsRes.value.data || []) : [];
  const activityRows = activityRowsRes.status === 'fulfilled' ? (activityRowsRes.value.data || []) : [];
  const connectedRows = connectedRowsRes.status === 'fulfilled' ? (connectedRowsRes.value.data || []) : [];
  const notifications = notificationRowsRes.status === 'fulfilled' ? (notificationRowsRes.value.data || []) : [];
  const health = diagRes.status === 'fulfilled' && !diagRes.value.error ? (diagRes.value.data || {}) as Record<string, string> : {};
  const preview = previewRes.status === 'fulfilled' && !previewRes.value.error ? (previewRes.value.data || {}) as any : null;

  const hasResend = hasSecret(health, 'RESEND_API_KEY') && hasSecret(health, 'EMAIL_FROM');
  const missingGmail = REQUIRED_GMAIL_KEYS.filter(key => isMissing(health[key]));
  const gmailReady = hasResend || missingGmail.length === 0;
  const gmailDetail = hasResend
    ? 'Resend sender is configured in Supabase secrets.'
    : missingGmail.length
      ? `${missingGmail.join(', ')} missing in Supabase secrets`
      : 'Lovable Gmail connector secrets are present.';
  const missingRetell = REQUIRED_RETELL_KEYS.filter(key => isMissing(health[key]));
  const schedule = scheduleStatus(settings);
  const connectedCallsToday = connectedRows.filter((row: any) => {
    if (new Date(row.last_contacted_at) < new Date(today)) return false;
    return row.call_connected === true || connectedCallStatus(row.call_status);
  }).length;
  const callsStartedToday = activityRows.filter((row: any) => new Date(row.created_at) >= new Date(today)).length;
  const previewEligible = Number(preview?.eligibleCalls ?? preview?.eligible ?? buckets.readyCall);
  const previewLabel = preview?.nicheLabel ? `${preview.nicheLabel} queue` : 'today queue';

  const items: LaunchItem[] = [
    {
      key: 'gmail',
      label: 'Gmail sender',
      value: gmailReady ? (hasResend ? 'Resend ready' : 'Connected') : 'Blocked',
      detail: gmailDetail,
      status: gmailReady ? 'ready' : 'blocked',
    },
    {
      key: 'retell',
      label: 'AI call sender',
      value: missingRetell.length ? 'Blocked' : 'Ready',
      detail: missingRetell.length ? `${missingRetell.join(', ')} missing in Supabase secrets` : 'Retell API key, agent and from-number are present.',
      status: missingRetell.length ? 'blocked' : 'ready',
    },
    {
      key: 'email-supply',
      label: 'Email supply',
      value: buckets.readyEmail.toLocaleString(),
      detail: buckets.readyEmail >= emailCap ? `Enough for today's ${emailCap} Gmail cap.` : `Need ${Math.max(0, emailCap - buckets.readyEmail)} more ready email leads.`,
      status: buckets.readyEmail >= emailCap ? 'ready' : buckets.readyEmail > 0 ? 'warning' : 'blocked',
    },
    {
      key: 'phone-supply',
      label: 'Call supply',
      value: buckets.readyCall.toLocaleString(),
      detail: `${previewEligible.toLocaleString()} in ${previewLabel}; ${buckets.readyCall.toLocaleString()} total callable SE leads.`,
      status: buckets.readyCall >= callCap ? 'ready' : buckets.readyCall > 0 ? 'warning' : 'blocked',
    },
    {
      key: 'schedule',
      label: 'Schedule',
      value: schedule.open ? 'Open now' : schedule.isWeekend ? 'Weekend pause' : 'Waiting',
      detail: `Mon-Fri ${schedule.label} Stockholm — ${schedule.nextLabel}.`,
      status: settings.ai_calls_enabled === 'true' || settings.gmail_autosend_enabled === 'true' ? 'ready' : 'blocked',
    },
    {
      key: 'caps',
      label: 'Daily caps',
      value: `${emailCap} Gmail / ${callCap} calls`,
      detail: `${emailSentToday}/${emailCap} Gmail sent and ${connectedCallsToday}/${callCap} connected calls counted today.`,
      status: emailCap <= 100 && callCap <= 15 ? 'ready' : 'warning',
    },
  ];

  const blockers = items.filter(item => item.status === 'blocked').map(item => `${item.label}: ${item.detail}`);
  const warnings = items.filter(item => item.status === 'warning').map(item => `${item.label}: ${item.detail}`);
  // Only flag the window as a warning during a weekday — weekends are an intentional pause shown in the banner.
  if (!schedule.open && !schedule.isWeekend) warnings.push(`Automation is not in the active sending window right now (${schedule.label} Stockholm).`);
  if (emailSentToday >= emailCap) warnings.push('Gmail daily cap is already reached.');
  if (connectedCallsToday >= callCap) warnings.push('Connected-call daily cap is already reached.');

  const logFromNotifications: LogItem[] = notifications.map((row: any) => {
    const payload = row.payload || {};
    const reason = payload.reason || payload.error || payload.nicheReason;
    const lower = `${row.title || ''} ${row.message || ''} ${reason || ''}`.toLowerCase();
    const status: ReadinessStatus = lower.includes('blocked') || lower.includes('missing') || lower.includes('error')
      ? 'blocked'
      : lower.includes('skipped') || lower.includes('outside') || lower.includes('no eligible')
        ? 'warning'
        : 'ready';
    return {
      id: `notification-${row.id}`,
      time: row.created_at,
      source: String(row.type || '').includes('gmail') ? 'Gmail' : String(row.type || '').includes('ai') ? 'AI calls' : 'Automation',
      title: row.title || 'Automation event',
      detail: reason ? `${row.message || ''} Reason: ${asText(reason)}` : row.message || 'No details saved.',
      status,
    };
  });

  const logFromMessages: LogItem[] = messageRows.slice(0, 25).map((row: any) => ({
    id: `message-${row.id}`,
    time: row.created_at,
    source: row.channel === 'email' ? 'Gmail' : String(row.channel || 'Message').toUpperCase(),
    title: `${row.channel === 'email' ? 'Email' : 'Message'} ${row.status || 'logged'}`,
    detail: row.error_message || row.to_number || 'Outbound message logged.',
    status: row.status === 'sent' || row.status === 'delivered' ? 'ready' : row.status === 'failed' || row.status === 'undelivered' ? 'blocked' : 'warning',
  }));

  const logs = [...logFromNotifications, ...logFromMessages]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 12);

  const dailyMap: Record<string, DailyStat> = {};
  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    dailyMap[dayKey(date)] = { date: shortDay(date), gmail: 0, calls: 0, connected: 0 };
  }
  for (const row of messageRows) {
    if (row.channel !== 'email' || row.status !== 'sent') continue;
    const key = dayKey(row.created_at);
    if (dailyMap[key]) dailyMap[key].gmail += 1;
  }
  for (const row of activityRows) {
    const key = dayKey(row.created_at);
    if (dailyMap[key]) dailyMap[key].calls += 1;
  }
  for (const row of connectedRows) {
    if (row.call_connected !== true && !connectedCallStatus(row.call_status)) continue;
    const key = dayKey(row.last_contacted_at);
    if (dailyMap[key]) dailyMap[key].connected += 1;
  }

  return {
    items,
    buckets,
    logs,
    daily: Object.values(dailyMap),
    blockers,
    warnings,
    emailSentToday,
    callsStartedToday,
    connectedCallsToday,
    emailCap,
    callCap,
    windowLabel: schedule.label,
    nextCheckLabel: schedule.nextLabel,
    windowOpen: schedule.open,
  };
}

export default function LaunchReadinessPanel({ compact = false }: { compact?: boolean }) {
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDiagnostics(await loadDiagnostics());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load launch diagnostics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const intervalId = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(intervalId);
  }, [refresh]);

  useEffect(() => {
    let timeoutId: number | undefined;
    const scheduleRefresh = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(refresh, 800);
    };
    const channel = supabase
      .channel('launch-readiness-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: 'product=eq.leadmap' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_logs' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_notifications' }, scheduleRefresh)
      .subscribe();

    return () => {
      window.clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  const overall = useMemo<ReadinessStatus>(() => {
    if (!diagnostics) return loading ? 'checking' : 'warning';
    if (diagnostics.items.some(item => item.status === 'blocked')) return 'blocked';
    if (diagnostics.items.some(item => item.status === 'warning')) return 'warning';
    return 'ready';
  }, [diagnostics, loading]);

  const emailProgress = diagnostics ? Math.min(100, Math.round((diagnostics.emailSentToday / Math.max(1, diagnostics.emailCap)) * 100)) : 0;
  const callProgress = diagnostics ? Math.min(100, Math.round((diagnostics.connectedCallsToday / Math.max(1, diagnostics.callCap)) * 100)) : 0;

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck size={18} className="text-primary" />
            <h2 className="text-base font-semibold text-foreground">Launch command center</h2>
            {statusBadge(overall)}
            {diagnostics && (
              <Badge variant={diagnostics.windowOpen ? 'default' : 'outline'}>
                {diagnostics.windowOpen ? 'Window open' : diagnostics.windowLabel}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Live readiness, lead supply, blocker reasons and outreach history for the next launch day.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="gap-2">
          <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {(diagnostics?.items || []).map(item => (
          <div key={item.key} className={cn('rounded-md border p-3', itemClass(item.status))}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{item.label}</span>
              {statusIcon(item.status)}
            </div>
            <div className="mt-2 text-xl font-semibold text-foreground">{item.value}</div>
            <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{item.detail}</p>
          </div>
        ))}
        {!diagnostics && loading && Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-md border border-border bg-muted/30" />
        ))}
      </div>

      {diagnostics && (
        <>
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1.1fr]">
            <div className="rounded-md border border-border bg-background/40 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Mail size={15} className="text-primary" />
                Gmail progress today
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div className="text-2xl font-semibold text-foreground">{diagnostics.emailSentToday} / {diagnostics.emailCap}</div>
                <div className="text-xs text-muted-foreground">{emailProgress}%</div>
              </div>
              <Progress value={emailProgress} className="mt-3 h-2" />
            </div>
            <div className="rounded-md border border-border bg-background/40 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <PhoneCall size={15} className="text-primary" />
                Connected calls today
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div className="text-2xl font-semibold text-foreground">{diagnostics.connectedCallsToday} / {diagnostics.callCap}</div>
                <div className="text-xs text-muted-foreground">{diagnostics.callsStartedToday} attempts started</div>
              </div>
              <Progress value={callProgress} className="mt-3 h-2" />
            </div>
            <div className="rounded-md border border-border bg-background/40 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Clock size={15} className="text-primary" />
                Why nothing may be sending
              </div>
              <div className="mt-2 space-y-1">
                {[...diagnostics.blockers, ...diagnostics.warnings].slice(0, 4).map((reason, index) => (
                  <div key={`${reason}-${index}`} className="flex gap-2 text-xs text-muted-foreground">
                    <AlertTriangle size={13} className={diagnostics.blockers.includes(reason) ? 'mt-0.5 text-destructive' : 'mt-0.5 text-amber-500'} />
                    <span>{reason}</span>
                  </div>
                ))}
                {diagnostics.blockers.length === 0 && diagnostics.warnings.length === 0 && (
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 size={13} className="mt-0.5 text-emerald-500" />
                    <span>No launch blockers found. {diagnostics.nextCheckLabel}.</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-md border border-border bg-background/40 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Database size={15} className="text-primary" />
                Lead supply buckets
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                <Bucket label="Ready email" value={diagnostics.buckets.readyEmail} tone="green" />
                <Bucket label="Ready call" value={diagnostics.buckets.readyCall} tone="green" />
                <Bucket label="Missing email" value={diagnostics.buckets.missingEmail} />
                <Bucket label="Missing phone" value={diagnostics.buckets.missingPhone} />
                <Bucket label="Already touched" value={diagnostics.buckets.alreadyContacted} />
                <Bucket label="Do not contact" value={diagnostics.buckets.doNotContact} tone="red" />
              </div>
            </div>

            <div className="rounded-md border border-border bg-background/40 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Activity size={15} className="text-primary" />
                Last 7 days
              </div>
              <div className="mt-3 grid grid-cols-7 gap-1.5">
                {diagnostics.daily.map(day => {
                  const max = Math.max(1, diagnostics.emailCap, diagnostics.callCap);
                  return (
                    <div key={day.date} className="rounded border border-border bg-card/60 p-2 text-center">
                      <div className="text-[10px] text-muted-foreground">{day.date}</div>
                      <div className="mt-2 flex h-16 items-end justify-center gap-1">
                        <div className="w-2 rounded-t bg-primary" style={{ height: `${Math.max(4, Math.min(64, (day.gmail / max) * 64))}px` }} title={`${day.gmail} Gmail`} />
                        <div className="w-2 rounded-t bg-emerald-500" style={{ height: `${Math.max(4, Math.min(64, (day.connected / Math.max(1, diagnostics.callCap)) * 64))}px` }} title={`${day.connected} connected`} />
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">{day.gmail} / {day.connected}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {!compact && (
            <div className="mt-4 rounded-md border border-border bg-background/40">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-medium text-foreground">
                <Bot size={15} className="text-primary" />
                Live automation history
              </div>
              <div className="divide-y divide-border/70">
                {diagnostics.logs.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">No automation events logged in the last 7 days.</div>
                ) : diagnostics.logs.map(log => (
                  <div key={log.id} className="grid gap-2 px-3 py-2 text-sm md:grid-cols-[5rem_6rem_1fr]">
                    <div className="font-mono text-xs text-muted-foreground">{formatTime(log.time)}</div>
                    <div className="flex items-center gap-1.5">
                      {statusIcon(log.status)}
                      <span className="text-xs font-medium text-muted-foreground">{log.source}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{log.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{log.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Bucket({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'red' }) {
  return (
    <div className="rounded border border-border bg-card/60 p-2">
      <div className={cn('text-lg font-semibold text-foreground', tone === 'green' && 'text-emerald-500', tone === 'red' && 'text-destructive')}>
        {value.toLocaleString()}
      </div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
