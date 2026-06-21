/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import LaunchReadinessPanel from '@/components/LaunchReadinessPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { fetchNotifications, getSetting, type AppNotification } from '@/lib/supabase';
import {
  DEFAULT_CONNECTED_CALL_DAILY,
  DEFAULT_GMAIL_DAILY,
  DEFAULT_GMAIL_DAILY_ES,
  DEFAULT_GMAIL_DAILY_SE,
  DEFAULT_GMAIL_DAILY_UK,
  DEFAULT_OUTREACH_END_HOUR,
  DEFAULT_OUTREACH_END_MINUTE,
  DEFAULT_OUTREACH_START_HOUR,
  DEFAULT_OUTREACH_START_MINUTE,
  formatCountdown,
  formatWindow,
  getOutreachWeekDays,
  nextOutreachCheckpoint,
} from '@/lib/outreachPlan';
import { cn } from '@/lib/utils';
import { connectedCallStatus, detectCountry, isCallEligible, isEmailEligible } from '@/lib/outreachEligibility';
import {
  Activity,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock,
  Info,
  Mail,
  RefreshCw,
  Target,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';

type DayStats = {
  dateKey: string;
  label: string;
  shortLabel: string;
  niche: string;
  nicheLabel: string;
  gmailSent: number;
  gmailBatchSent: number;
  emailReplies: number;
  emailInterested: number;
  emailDemo: number;
  aiStarted: number;
  aiBatchStarted: number;
  aiConnected: number;
  callInterested: number;
  callDemo: number;
  callNotInterested: number;
  finderRuns: number;
  finderCandidates: number;
  finderSaved: number;
  supplySeEmails: number;
  supplyUkEmails: number;
  supplySePhones: number;
  failed: number;
  skipped: number;
  summary: string;
};

type Settings = {
  gmailDaily: number;
  gmailDailySe: number;
  gmailDailyUk: number;
  gmailDailyEs: number;
  callDaily: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  days: number[];
};

const DEFAULT_SETTINGS: Settings = {
  gmailDaily: DEFAULT_GMAIL_DAILY,
  gmailDailySe: DEFAULT_GMAIL_DAILY_SE,
  gmailDailyUk: DEFAULT_GMAIL_DAILY_UK,
  gmailDailyEs: DEFAULT_GMAIL_DAILY_ES,
  callDaily: DEFAULT_CONNECTED_CALL_DAILY,
  startHour: DEFAULT_OUTREACH_START_HOUR,
  startMinute: DEFAULT_OUTREACH_START_MINUTE,
  endHour: DEFAULT_OUTREACH_END_HOUR,
  endMinute: DEFAULT_OUTREACH_END_MINUTE,
  days: [1, 2, 3, 4, 5],
};

function startOfDayIso(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

function endOfDayIso(date: Date) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
}

function parseCsvNumbers(value: string | null, fallback: number[]) {
  const parts = String(value || '')
    .split(',')
    .map(part => Number(part.trim()))
    .filter(Number.isFinite);
  return parts.length ? parts : fallback;
}

function intValue(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function isInterestedStatus(status?: string | null) {
  const value = String(status || '').toLowerCase();
  return value.includes('interested') || value.includes('callback') || value.includes('demo') || value.includes('meeting');
}

function localDateKey(value?: string | Date | null) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isDemoStatus(status?: string | null) {
  const value = String(status || '').toLowerCase();
  return value.includes('demo') || value.includes('meeting') || value.includes('making_demo');
}

function stripMarks(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const NICHE_KEYWORDS: Record<string, string[]> = {
  emergency_trades: ['plumber', 'plumbing', 'vvs', 'ror', 'rorfirma', 'jour', 'locksmith', 'lasser', 'tak', 'roof', 'water damage', 'leak'],
  dental: ['dental', 'dentist', 'tand', 'tandlakare', 'implant', 'orthodont', 'clinic', 'klin'],
  electricians: ['electric', 'electrician', 'el ', 'el-', 'elinstallation', 'elektriker', 'belysning', 'automation', 'voltage'],
  auto_services: ['auto', 'car', 'vehicle', 'bil', 'verkstad', 'mechanic', 'garage', 'dack', 'rekond', 'detailing', 'repair'],
  cleaning: ['clean', 'cleaning', 'stad', 'stadning', 'hemstad', 'flyttstad', 'sanering', 'housekeeping', 'facility'],
};

function leadNicheText(lead: Record<string, unknown>) {
  return stripMarks([
    lead.category,
    lead.niche_label,
    lead.detected_niche,
    lead.business_type,
    lead.name,
    lead.website,
  ].filter(Boolean).join(' '));
}

function matchesNiche(lead: Record<string, unknown>, niche: string) {
  const text = leadNicheText(lead);
  const keywords = NICHE_KEYWORDS[niche] || [];
  return keywords.some(keyword => text.includes(stripMarks(keyword)));
}

async function loadLeadmapSupplyLeads(sb: any) {
  const columns = [
    'id',
    'created_at',
    'name',
    'email',
    'phone',
    'phone_e164',
    'lead_tier',
    'outreach_stage',
    'outreach_state',
    'outreach_opt_out',
    'do_not_contact',
    'last_called_at',
    'last_contacted_at',
    'last_contact_method',
    'last_message_status',
    'call_attempts',
    'no_answer_count',
    'next_call_after',
    'call_status',
    'call_connected',
    'product',
    'status',
    'potential_score',
    'country',
    'address',
    'city',
    'category',
    'niche_label',
    'detected_niche',
    'business_type',
    'website',
  ].join(',');
  const rows: any[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from('leads')
      .select(columns)
      .eq('product', 'leadmap')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function gmailTargetForDay(_day: Pick<DayStats, 'dateKey'>, settings: Settings) {
  return Math.max(settings.gmailDaily, settings.gmailDailySe + settings.gmailDailyUk + settings.gmailDailyEs);
}

function formatDate(value: Date) {
  return value.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function dayStatus(day: DayStats, settings: Settings, now: Date, emailTarget: number) {
  const date = new Date(`${day.dateKey}T00:00:00`);
  const end = new Date(date);
  end.setHours(settings.endHour, settings.endMinute, 0, 0);
  const emailDone = day.gmailSent >= emailTarget;
  const callsDone = day.aiConnected >= settings.callDaily;
  if (emailDone && callsDone) return { label: 'Complete', tone: 'good' as const };
  if (now > end) return { label: 'Needs review', tone: 'warn' as const };
  if (day.gmailSent > 0 || day.aiStarted > 0) return { label: 'In progress', tone: 'active' as const };
  if (day.finderRuns > 0) return { label: 'Supply run', tone: 'active' as const };
  return { label: 'Waiting', tone: 'muted' as const };
}

function summarizeDay(day: DayStats, settings: Settings, emailTarget: number) {
  const emailLeft = Math.max(0, emailTarget - day.gmailSent);
  const callLeft = Math.max(0, settings.callDaily - day.aiConnected);
  if (emailLeft === 0 && callLeft === 0) return 'Daily quota hit.';
  if (day.gmailSent === 0 && day.aiStarted === 0 && day.finderRuns > 0) {
    return `${day.finderRuns} finder run${day.finderRuns === 1 ? '' : 's'} logged. Supply found: ${day.finderSaved || day.finderCandidates}.`;
  }
  if (day.gmailSent === 0 && day.aiStarted === 0) return 'No outreach recorded yet.';
  return `${emailLeft} emails and ${callLeft} connected calls left.`;
}

function conclusion(days: DayStats[], settings: Settings, weekOver: boolean) {
  const totals = days.reduce((acc, day) => ({
    gmailSent: acc.gmailSent + day.gmailSent,
    aiStarted: acc.aiStarted + day.aiStarted,
    aiConnected: acc.aiConnected + day.aiConnected,
    failed: acc.failed + day.failed,
    skipped: acc.skipped + day.skipped,
  }), { gmailSent: 0, aiStarted: 0, aiConnected: 0, failed: 0, skipped: 0 });
  const emailTarget = days.reduce((sum, day) => sum + gmailTargetForDay(day, settings), 0);
  const callTarget = settings.callDaily * days.length;
  const completion = Math.round(((totals.gmailSent / Math.max(1, emailTarget)) * 0.55 + (totals.aiConnected / Math.max(1, callTarget)) * 0.45) * 100);
  const best = [...days].sort((a, b) => (b.gmailSent + b.aiConnected * 6) - (a.gmailSent + a.aiConnected * 6))[0];

  if (!weekOver) {
    return {
      title: 'Week still running',
      text: best ? `${best.nicheLabel} is currently carrying the strongest activity signal. Keep watching replies and connected-call outcomes before shifting focus too hard.` : 'The week has not started yet.',
      completion,
      totals,
    };
  }

  const hit = totals.gmailSent >= emailTarget && totals.aiConnected >= callTarget;
  return {
    title: hit ? 'Week complete' : 'Week finished with gaps',
    text: hit
      ? `All planned volume was reached. Use the best-response niche as next week's priority.`
      : `Some quota was missed. Review blockers, lead supply, and connector health before increasing spend.`,
    completion,
    totals,
  };
}

export default function OutreachProgressPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [days, setDays] = useState<DayStats[]>([]);
  const [history, setHistory] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<DayStats | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const weekDays = useMemo(() => getOutreachWeekDays(now), [now]);
  const weekStart = weekDays[0]?.date || now;
  const weekEnd = weekDays[4]?.date || now;
  const weekEndAt = useMemo(() => {
    const value = new Date(weekEnd);
    value.setHours(settings.endHour, settings.endMinute, 0, 0);
    return value;
  }, [weekEnd, settings.endHour, settings.endMinute]);
  const weekOver = now > weekEndAt;
  const next = nextOutreachCheckpoint({
    now,
    days: settings.days,
    startHour: settings.startHour,
    startMinute: settings.startMinute,
    endHour: settings.endHour,
    endMinute: settings.endMinute,
  });
  const report = conclusion(days, settings, weekOver);
  const emailTarget = days.length
    ? days.reduce((sum, day) => sum + gmailTargetForDay(day, settings), 0)
    : Math.max(settings.gmailDaily, settings.gmailDailySe + settings.gmailDailyUk + settings.gmailDailyEs) * Math.max(1, weekDays.length);
  const callTarget = settings.callDaily * Math.max(1, weekDays.length);
  const elapsedDays = Math.max(1, days.filter(day => now >= new Date(`${day.dateKey}T00:00:00`)).length);
  const elapsedEmailTarget = days
    .slice(0, elapsedDays)
    .reduce((sum, day) => sum + gmailTargetForDay(day, settings), 0) || Math.max(settings.gmailDaily, settings.gmailDailySe + settings.gmailDailyUk + settings.gmailDailyEs);
  const elapsedCallTarget = settings.callDaily * elapsedDays;
  const normalEmailTarget = Math.max(settings.gmailDaily, settings.gmailDailySe + settings.gmailDailyUk + settings.gmailDailyEs);

  const load = async () => {
    setLoading(true);
    try {
      const keys = [
        'gmail_autosend_daily',
        'gmail_autosend_daily_se',
        'gmail_autosend_daily_uk',
        'gmail_autosend_daily_es',
        'ai_calls_daily_connected_cap',
        'ai_calls_daily',
        'ai_calls_start_hour',
        'ai_calls_start_minute',
        'ai_calls_end_hour',
        'ai_calls_end_minute',
        'ai_calls_days',
      ];
      const values = await Promise.all(keys.map(key => getSetting(key)));
      const cfg = Object.fromEntries(keys.map((key, index) => [key, values[index]]));
      const nextSettings: Settings = {
        ...DEFAULT_SETTINGS,
        gmailDaily: intValue(cfg.gmail_autosend_daily, DEFAULT_SETTINGS.gmailDaily, 1, 500),
        gmailDailySe: DEFAULT_SETTINGS.gmailDailySe,
        gmailDailyUk: DEFAULT_SETTINGS.gmailDailyUk,
        gmailDailyEs: DEFAULT_SETTINGS.gmailDailyEs,
        callDaily: intValue(cfg.ai_calls_daily_connected_cap || cfg.ai_calls_daily, DEFAULT_SETTINGS.callDaily, 1, 100),
        startHour: intValue(cfg.ai_calls_start_hour, DEFAULT_SETTINGS.startHour, 0, 23),
        startMinute: intValue(cfg.ai_calls_start_minute, DEFAULT_SETTINGS.startMinute, 0, 59),
        endHour: intValue(cfg.ai_calls_end_hour, DEFAULT_SETTINGS.endHour, 1, 24),
        endMinute: intValue(cfg.ai_calls_end_minute, DEFAULT_SETTINGS.endMinute, 0, 59),
        days: parseCsvNumbers(cfg.ai_calls_days, DEFAULT_SETTINGS.days),
      };
      const hasCountrySplit = cfg.gmail_autosend_daily_se !== null || cfg.gmail_autosend_daily_uk !== null || cfg.gmail_autosend_daily_es !== null;
      nextSettings.gmailDailySe = intValue(cfg.gmail_autosend_daily_se, hasCountrySplit ? DEFAULT_SETTINGS.gmailDailySe : nextSettings.gmailDaily, 0, 500);
      nextSettings.gmailDailyUk = intValue(cfg.gmail_autosend_daily_uk, hasCountrySplit ? DEFAULT_SETTINGS.gmailDailyUk : 0, 0, 500);
      nextSettings.gmailDailyEs = intValue(cfg.gmail_autosend_daily_es, hasCountrySplit ? DEFAULT_SETTINGS.gmailDailyEs : 0, 0, 500);
      setSettings(nextSettings);

      const first = weekDays[0]?.date || new Date();
      const last = weekDays[4]?.date || new Date();
      const since = startOfDayIso(first);
      const until = endOfDayIso(last);
      const sb = supabase as any;
      const [{ data: emailRows }, { data: inboundEmailRows }, { data: aiRows }, { data: connectedRows }, { data: finderRows }, supplyLeads, notifications] = await Promise.all([
        sb
          .from('message_logs')
          .select('id, created_at, lead_id, leads(status, name, category, niche_label, detected_niche, business_type, website)')
          .eq('channel', 'email')
          .eq('direction', 'outbound')
          .eq('status', 'sent')
          .gte('created_at', since)
          .lte('created_at', until)
          .limit(10000),
        sb
          .from('message_logs')
          .select('id, created_at, lead_id, body, leads(status, name, category, niche_label, detected_niche, business_type, website)')
          .eq('channel', 'email')
          .eq('direction', 'inbound')
          .gte('created_at', since)
          .lte('created_at', until)
          .limit(10000),
        sb
          .from('activities')
          .select('id, created_at')
          .eq('type', 'ai_call_started')
          .gte('created_at', since)
          .lte('created_at', until)
          .limit(10000),
        sb
          .from('leads')
          .select('id, last_contacted_at, call_status, call_connected, status')
          .eq('last_contact_method', 'AI Call')
          .gte('last_contacted_at', since)
          .lte('last_contacted_at', until)
          .limit(10000),
        sb
          .from('finder_runs')
          .select('id, created_at, mode, keywords, status, stats')
          .gte('created_at', since)
          .lte('created_at', until)
          .order('created_at', { ascending: false })
          .limit(300),
        loadLeadmapSupplyLeads(sb),
        fetchNotifications(300),
      ]);

      const buckets = new Map<string, DayStats>();
      const bucketsByNiche = new Map<string, DayStats>();
      for (const day of weekDays) {
        const bucket = {
          dateKey: day.dateKey,
          label: day.label,
          shortLabel: day.shortLabel,
          niche: day.niche,
          nicheLabel: day.nicheLabel,
          gmailSent: 0,
          gmailBatchSent: 0,
          emailReplies: 0,
          emailInterested: 0,
          emailDemo: 0,
          aiStarted: 0,
          aiBatchStarted: 0,
          aiConnected: 0,
          callInterested: 0,
          callDemo: 0,
          callNotInterested: 0,
          finderRuns: 0,
          finderCandidates: 0,
          finderSaved: 0,
          supplySeEmails: 0,
          supplyUkEmails: 0,
          supplySePhones: 0,
          failed: 0,
          skipped: 0,
          summary: '',
        };
        buckets.set(day.dateKey, bucket);
        bucketsByNiche.set(day.niche, bucket);
      }

      for (const row of emailRows || []) {
        const bucket = buckets.get(localDateKey(row.created_at));
        if (bucket) {
          const status = row.leads?.status;
          bucket.gmailSent += 1;
          if (isInterestedStatus(status)) bucket.emailInterested += 1;
          if (isDemoStatus(status)) bucket.emailDemo += 1;
        }
      }
      for (const row of inboundEmailRows || []) {
        const foundNiche = weekDays.find(day => row.leads && matchesNiche(row.leads, day.niche));
        const bucket = (foundNiche ? bucketsByNiche.get(foundNiche.niche) : null) || buckets.get(localDateKey(row.created_at));
        if (bucket) {
          const status = row.leads?.status;
          bucket.emailReplies += 1;
          if (isInterestedStatus(status)) bucket.emailInterested += 1;
          if (isDemoStatus(status)) bucket.emailDemo += 1;
        }
      }
      for (const row of aiRows || []) {
        const bucket = buckets.get(localDateKey(row.created_at));
        if (bucket) bucket.aiStarted += 1;
      }
      for (const row of connectedRows || []) {
        if (row.call_connected !== true && !connectedCallStatus(row.call_status)) continue;
        const bucket = buckets.get(localDateKey(row.last_contacted_at));
        if (bucket) {
          bucket.aiConnected += 1;
          if (isInterestedStatus(row.status) || isInterestedStatus(row.call_status)) bucket.callInterested += 1;
          if (isDemoStatus(row.status) || isDemoStatus(row.call_status)) bucket.callDemo += 1;
          if (String(row.status || '').toLowerCase() === 'not_interested' || String(row.call_status || '').toLowerCase().includes('not interested')) bucket.callNotInterested += 1;
        }
      }
      for (const row of finderRows || []) {
        const stats = (row.stats || {}) as Record<string, any>;
        const keywords = Array.isArray(row.keywords) ? row.keywords.join(' ') : '';
        const foundNiche = weekDays.find(day => {
          const needle = `${day.niche} ${day.nicheLabel}`.toLowerCase();
          const hay = `${row.mode || ''} ${keywords} ${JSON.stringify(stats || {})}`.toLowerCase();
          return hay.includes(day.niche) || day.nicheLabel.toLowerCase().split(' ')[0] && needle.split(' ')[0] && hay.includes(needle.split(' ')[0]);
        });
        const bucket = (foundNiche ? bucketsByNiche.get(foundNiche.niche) : null) || buckets.get(localDateKey(row.created_at));
        if (bucket) {
          bucket.finderRuns += 1;
          bucket.finderCandidates += Number(stats.candidatesFound || stats.totalCandidates || 0);
          bucket.finderSaved += Number(stats.savedLeads || stats.emailsFound || stats.noWebsiteEmailOnly || stats.noWebsiteWithPhone || 0);
        }
      }

      for (const day of weekDays) {
        const bucket = bucketsByNiche.get(day.niche);
        if (!bucket) continue;
        const seenEmails = new Set<string>();
        for (const lead of supplyLeads || []) {
          if (!matchesNiche(lead, day.niche)) continue;
          const country = detectCountry(lead);
          if (isEmailEligible(lead, seenEmails)) {
            if (country === 'SE') bucket.supplySeEmails += 1;
            if (country === 'UK' || country === 'GB') bucket.supplyUkEmails += 1;
          }
          if (isCallEligible(lead, { product: 'leadmap', countries: ['SE'] })) {
            bucket.supplySePhones += 1;
          }
        }
      }

      const relevantNotifications = notifications.filter(item => {
        const key = localDateKey(item.created_at);
        return buckets.has(key) && (
          item.type === 'gmail_batch_done'
          || item.type === 'ai_call_batch_done'
          || item.type === 'finder_auto_replenish'
        );
      });
      for (const item of relevantNotifications) {
        const payload = (item.payload || {}) as Record<string, any>;
        const bucket = bucketsByNiche.get(String(payload.plannedNiche || payload.niche || '')) || buckets.get(localDateKey(item.created_at));
        if (!bucket) continue;
        if (item.type === 'gmail_batch_done') {
          bucket.gmailBatchSent += Number(payload.sent || 0);
          bucket.gmailSent = Math.max(bucket.gmailSent, bucket.gmailBatchSent);
        }
        if (item.type === 'ai_call_batch_done') {
          bucket.aiBatchStarted += Number(payload.started || 0);
          bucket.aiStarted = Math.max(bucket.aiStarted, bucket.aiBatchStarted);
        }
        if (item.type === 'finder_auto_replenish') {
          bucket.finderRuns += 1;
        }
        bucket.failed += Number(payload.failed || 0);
        bucket.skipped += Number(payload.skipped || 0);
      }

      const nextDays = Array.from(buckets.values()).map(day => ({
        ...day,
        summary: summarizeDay(day, nextSettings, gmailTargetForDay(day, nextSettings)),
      }));
      setDays(nextDays);
      setHistory(relevantNotifications.slice(0, 30));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load outreach progress');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const intervalId = window.setInterval(load, 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let timeoutId: number | undefined;
    const scheduleLoad = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(load, 800);
    };
    const channel = supabase
      .channel('outreach-progress-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_logs' }, scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finder_runs' }, scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: 'product=eq.leadmap' }, scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_notifications' }, scheduleLoad)
      .subscribe();

    return () => {
      window.clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-5 sm:py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Leadmap AI</div>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">Outreach Progress</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Daily progress, next run timing, and the weekly conclusion for the five-niche outreach plan.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>

        <div className="mb-5">
          <LaunchReadinessPanel />
        </div>

        <section className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={next?.active ? 'default' : 'outline'}>{next?.active ? 'Window open' : 'Waiting'}</Badge>
              <Badge variant="secondary">{formatWindow(settings.startHour, settings.startMinute, settings.endHour, settings.endMinute)} Stockholm</Badge>
              <Badge variant="secondary">Mon-Fri</Badge>
            </div>
            <h2 className="mt-4 text-xl font-semibold text-foreground">
              {next ? `${next.label}: ${formatCountdown(next.at.getTime() - now.getTime())}` : 'No upcoming check'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This timer tracks the next automation checkpoint. Calls remain one-by-one, Gmail keeps the daily cap, and both channels follow the same niche for that day.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Metric icon={<Mail size={15} />} label="Gmail so far" value={`${report.totals.gmailSent} / ${elapsedEmailTarget}`} />
              <Metric icon={<Bot size={15} />} label="Connected so far" value={`${report.totals.aiConnected} / ${elapsedCallTarget}`} />
              <Metric icon={<Activity size={15} />} label="Week completion" value={`${Math.min(100, report.completion)}%`} />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <TrendingUp size={17} className="text-primary" />
              <h2 className="font-semibold text-foreground">Summary</h2>
            </div>
            <div className="mt-4 rounded-md border border-border bg-background/40 p-4">
              <div className="text-sm font-semibold text-foreground">{report.title}</div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{report.text}</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniStat label="AI started" value={report.totals.aiStarted} />
              <MiniStat label="Skipped" value={report.totals.skipped} />
              <MiniStat label="Failed" value={report.totals.failed} />
              <MiniStat label="Week ends" value={formatDate(weekEndAt)} />
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Mail size={17} className="text-primary" />
            <h2 className="font-semibold text-foreground">Daily email split by country</h2>
            <Badge variant="secondary" className="ml-auto">Normal {normalEmailTarget}/day</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <CountryCap code="SE" label="Sweden" cap={settings.gmailDailySe} note="Main market — SE leads first" />
            <CountryCap code="UK" label="United Kingdom" cap={settings.gmailDailyUk} note="Test batch — English template" />
            <CountryCap code="ES" label="Spain" cap={settings.gmailDailyEs} note="Test batch — Spanish template" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Each weekday runs its own niche with {settings.gmailDailySe} Swedish emails, {settings.gmailDailyUk} UK emails, and {settings.callDaily} Swedish connected AI calls. Missed volume does not roll into the next day.
          </p>
        </section>

        <section className="mt-5 rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <CalendarDays size={17} className="text-primary" />
            <h2 className="font-semibold text-foreground">Five-day plan</h2>
          </div>
          <div className="grid gap-3 xl:grid-cols-5">
            {days.map(day => {
              const dayEmailTarget = gmailTargetForDay(day, settings);
              const status = dayStatus(day, settings, now, dayEmailTarget);
              const emailPct = Math.min(100, Math.round((day.gmailSent / Math.max(1, dayEmailTarget)) * 100));
              const callPct = Math.min(100, Math.round((day.aiConnected / Math.max(1, settings.callDaily)) * 100));
              const emailInterestPct = Math.round((day.emailInterested / Math.max(1, day.gmailSent)) * 100);
              const callInterestPct = Math.round((day.callInterested / Math.max(1, day.aiConnected)) * 100);
              return (
                <div key={day.dateKey} className="rounded-lg border border-border bg-background/40 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{day.shortLabel} {day.dateKey.slice(5)}</div>
                      <div className="mt-1 font-semibold text-foreground">{day.nicheLabel}</div>
                    </div>
                    <Badge
                      variant={status.tone === 'good' ? 'default' : status.tone === 'warn' ? 'destructive' : 'outline'}
                      className={cn(status.tone === 'active' && 'border-primary text-primary')}
                    >
                      {status.label}
                    </Badge>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-3 h-8 w-full justify-start gap-2 text-xs"
                    onClick={() => setSelectedDay(day)}
                  >
                    <Info size={13} />
                    View niche/day details
                  </Button>

                  <div className="mt-4 space-y-3">
                    <ProgressLine label="Gmail" value={day.gmailSent} target={dayEmailTarget} percent={emailPct} />
                    <ProgressLine label="Connected calls" value={day.aiConnected} target={settings.callDaily} percent={callPct} />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <MiniStat label="Email interest" value={`${emailInterestPct}%`} />
                    <MiniStat label="Replies" value={day.emailReplies} />
                    <MiniStat label="Call interest" value={`${callInterestPct}%`} />
                    <MiniStat label="AI started" value={day.aiStarted} />
                    <MiniStat label="SE emails ready" value={`${day.supplySeEmails}/${settings.gmailDailySe}`} />
                    <MiniStat label="UK emails ready" value={`${day.supplyUkEmails}/${settings.gmailDailyUk}`} />
                    <MiniStat label="SE phones ready" value={`${day.supplySePhones}/${settings.callDaily}`} />
                    <MiniStat label="Failed" value={day.failed} />
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{day.summary}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <Target size={17} className="text-primary" />
              <h2 className="font-semibold text-foreground">What to watch</h2>
            </div>
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              <p>1. If a niche gets replies or demo requests, keep the adaptive focus on.</p>
              <p>2. If Gmail sends are low, check connector health and eligible email supply.</p>
              <p>3. If calls started but connected calls are low, no-answer does not count toward the 15-call goal.</p>
              <p>4. If failures spike, pause automation and inspect the latest run details.</p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <Clock size={17} className="text-primary" />
              <h2 className="font-semibold text-foreground">Latest automation notes</h2>
            </div>
            <div className="mt-4 max-h-80 overflow-y-auto rounded-md border border-border bg-background/40">
              {history.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">No automation events in this workweek yet.</div>
              ) : history.map(item => {
                const payload = (item.payload || {}) as Record<string, any>;
                return (
                  <div key={item.id} className="border-b border-border/60 px-3 py-3 last:border-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{item.title}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{item.created_at.slice(0, 16).replace('T', ' ')}</div>
                      </div>
                      {payload.nicheLabel && <Badge variant="secondary" className="max-w-36 truncate text-[10px]">{payload.nicheLabel}</Badge>}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">{item.message}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <Dialog open={!!selectedDay} onOpenChange={(open) => !open && setSelectedDay(null)}>
          {selectedDay && (
            <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>{selectedDay.shortLabel} {selectedDay.dateKey.slice(5)} · {selectedDay.nicheLabel}</DialogTitle>
                <DialogDescription>
                  Niche-specific targets, lead supply, and measured outcomes for this day.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-3">
                <MiniStat label="Swedish email supply" value={`${selectedDay.supplySeEmails}/${settings.gmailDailySe}`} />
                <MiniStat label="UK email supply" value={`${selectedDay.supplyUkEmails}/${settings.gmailDailyUk}`} />
                <MiniStat label="Swedish call supply" value={`${selectedDay.supplySePhones}/${settings.callDaily}`} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border bg-background/40 p-4">
                  <div className="text-sm font-semibold text-foreground">Email outcome</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <MiniStat label="Sent" value={`${selectedDay.gmailSent}/${gmailTargetForDay(selectedDay, settings)}`} />
                    <MiniStat label="Replies" value={selectedDay.emailReplies} />
                    <MiniStat label="Interested" value={`${Math.round((selectedDay.emailInterested / Math.max(1, selectedDay.gmailSent)) * 100)}%`} />
                    <MiniStat label="Demo/meeting" value={selectedDay.emailDemo} />
                  </div>
                </div>
                <div className="rounded-md border border-border bg-background/40 p-4">
                  <div className="text-sm font-semibold text-foreground">AI call outcome</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <MiniStat label="Started" value={selectedDay.aiStarted} />
                    <MiniStat label="Connected" value={`${selectedDay.aiConnected}/${settings.callDaily}`} />
                    <MiniStat label="Interested" value={`${Math.round((selectedDay.callInterested / Math.max(1, selectedDay.aiConnected)) * 100)}%`} />
                    <MiniStat label="Not interested" value={selectedDay.callNotInterested} />
                  </div>
                </div>
              </div>
              <div className="rounded-md border border-border bg-background/40 p-4">
                <div className="text-sm font-semibold text-foreground">Run health</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  <MiniStat label="Finder runs" value={selectedDay.finderRuns} />
                  <MiniStat label="Supply found" value={selectedDay.finderSaved || selectedDay.finderCandidates} />
                  <MiniStat label="Skipped" value={selectedDay.skipped} />
                  <MiniStat label="Failed" value={selectedDay.failed} />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{selectedDay.summary}</p>
              </div>
            </DialogContent>
          )}
        </Dialog>
      </div>
    </AppLayout>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-background/60 px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded border border-border bg-card px-2 py-1.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function CountryCap({ code, label, cap, note }: { code: string; label: string; cap: number; note: string }) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-3">
      <div className="flex items-center gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-foreground">{code}</span>
        <div className="font-semibold text-foreground">{label}</div>
        <Badge variant="outline" className="ml-auto">{cap}/day</Badge>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}



function ProgressLine({ label, value, target, percent }: { label: string; value: number; target: number; percent: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{value} / {target}</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-muted">
        <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
