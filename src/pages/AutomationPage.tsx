/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import LaunchReadinessPanel from '@/components/LaunchReadinessPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { fetchNotifications, getSetting, setSetting, type AppNotification } from '@/lib/supabase';
import { loadLeadmapSupplyStats } from '@/lib/leadSupply';
import { cn } from '@/lib/utils';
import {
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
  Mail,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Zap,
  Target,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { LEADMAP_EMAIL_BODY_SV, LEADMAP_EMAIL_SUBJECT_SV } from '@/lib/leadmapEmailTemplates';
import { connectedCallStatus, gmailTargetForToday, NORMAL_GMAIL_DAILY_TARGET } from '@/lib/outreachEligibility';

type AutomationSettings = {
  aiEnabled: boolean;
  aiDaily: string;
  aiPerRun: string;
  aiStartHour: string;
  aiStartMinute: string;
  aiEndHour: string;
  aiEndMinute: string;
  aiDays: string[];
  aiCountries: string[];
  aiMinScore: string;
  aiProduct: string;
  gmailEnabled: boolean;
  gmailDaily: string;
  gmailBatchSize: string;
  gmailDelaySeconds: string;
  gmailSubject: string;
  gmailBody: string;
  nicheRotationEnabled: boolean;
  nicheAdaptiveEnabled: boolean;
};

type Stats = {
  callsToday: number;
  emailsToday: number;
  callEligible: number;
  emailEligible: number;
  activeCalls: number;
};

type PreviewLead = {
  id: string;
  name: string;
  phone: string;
  score?: number | null;
  tier?: string | null;
  country?: string | null;
};

type QueueDiagnostics = {
  checked?: number;
  eligible?: number;
  message?: string;
  topReasons?: string[];
  rejectionSummary?: Record<string, number>;
};

type DailyOutreachStat = {
  date: string;
  gmailSent: number;
  aiStarted: number;
  aiConnected: number;
};

type IntegrationHealth = Record<string, string>;

const DEFAULTS: AutomationSettings = {
  aiEnabled: true,
  aiDaily: '15',
  aiPerRun: '1',
  aiStartHour: '10',
  aiStartMinute: '0',
  aiEndHour: '17',
  aiEndMinute: '30',
  aiDays: ['1', '2', '3', '4', '5'],
  aiCountries: ['SE'],
  aiMinScore: '0',
  aiProduct: 'leadmap',
  gmailEnabled: true,
  gmailDaily: String(NORMAL_GMAIL_DAILY_TARGET),
  gmailBatchSize: '10',
  gmailDelaySeconds: '120',
  gmailSubject: LEADMAP_EMAIL_SUBJECT_SV,
  gmailBody: LEADMAP_EMAIL_BODY_SV,
  nicheRotationEnabled: true,
  nicheAdaptiveEnabled: true,
};

const WEEKDAYS = [
  ['1', 'Mon'],
  ['2', 'Tue'],
  ['3', 'Wed'],
  ['4', 'Thu'],
  ['5', 'Fri'],
  ['6', 'Sat'],
  ['0', 'Sun'],
];

const COUNTRIES = ['SE', 'NO', 'DK', 'UK', 'ES'];
const AUTOMATION_INTERVAL_MINUTES = 5;
const NICHE_ROTATION_PLAN: Record<string, { key: string; day: string; label: string; shortLabel: string }> = {
  '1': { key: 'emergency_trades', day: 'Monday', label: 'VVS and emergency trades', shortLabel: 'VVS / emergency' },
  '2': { key: 'dental', day: 'Tuesday', label: 'Dental clinics', shortLabel: 'Dental' },
  '3': { key: 'electricians', day: 'Wednesday', label: 'Electricians', shortLabel: 'Electricians' },
  '4': { key: 'auto_services', day: 'Thursday', label: 'Auto workshops', shortLabel: 'Auto' },
  '5': { key: 'cleaning', day: 'Friday', label: 'Cleaning companies', shortLabel: 'Cleaning' },
};
const NICHE_ROTATION_JSON = JSON.stringify({
  '1': 'emergency_trades',
  '2': 'dental',
  '3': 'electricians',
  '4': 'auto_services',
  '5': 'cleaning',
});
const NICHE_PRIORITY = 'emergency_trades,dental,electricians,auto_services,cleaning';

function csv(values: string[]) {
  return values.join(',');
}

function parseCsv(value: string | null, fallback: string[]) {
  const parts = String(value || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  return parts.length ? parts : fallback;
}

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter(item => item !== value) : [...list, value];
}

function detectCountry(lead: any) {
  const explicit = String(lead.country || '').trim().toUpperCase();
  if (explicit) return explicit;
  const phone = String(lead.phone_e164 || lead.phone || '');
  const address = String(lead.address || '').toLowerCase();
  if (phone.startsWith('+47') || address.includes('norway') || address.includes('norge')) return 'NO';
  if (phone.startsWith('+45') || address.includes('denmark') || address.includes('danmark')) return 'DK';
  if (phone.startsWith('+44') || address.includes('united kingdom') || address.includes(' uk')) return 'UK';
  if (phone.startsWith('+34') || address.includes('spain') || address.includes('espa')) return 'ES';
  return 'SE';
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatShortTime(value: string | Date) {
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function startOfTodayIso() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

function startOfDaysAgoIso(days: number) {
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

function dayKey(value: string | Date) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function makeDailyBuckets(days = 14) {
  const rows = new Map<string, DailyOutreachStat>();
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    date.setHours(0, 0, 0, 0);
    rows.set(dayKey(date), {
      date: dayKey(date),
      gmailSent: 0,
      aiStarted: 0,
      aiConnected: 0,
    });
  }
  return rows;
}

function isAiAutomationNotification(item: AppNotification) {
  const payload = (item.payload || {}) as Record<string, any>;
  return item.type === 'ai_call_batch_done'
    || payload.automation === 'ai_calls'
    || item.title.toLowerCase().includes('ai call');
}

function isGmailAutomationNotification(item: AppNotification) {
  return item.type === 'gmail_batch_done' || item.title.toLowerCase().includes('gmail');
}

function sumHistory(
  items: AppNotification[],
  key: 'started' | 'sent' | 'skipped' | 'failed',
  predicate?: (item: AppNotification) => boolean,
) {
  return items
    .filter(item => (predicate ? predicate(item) : true))
    .reduce((sum, item) => sum + Number(((item.payload || {}) as Record<string, any>)[key] || 0), 0);
}

function getScheduleDaysText(days: string[]) {
  const selected = WEEKDAYS.filter(([value]) => days.includes(value)).map(([, label]) => label);
  return selected.length === 5 && selected.every(day => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(day))
    ? 'Mon-Fri'
    : selected.join(', ') || 'No days selected';
}

function activeNow(settings: AutomationSettings) {
  const now = new Date();
  const day = String(now.getDay());
  const current = minutesOfDay(now.getHours(), now.getMinutes());
  const start = minutesOfDay(Number(settings.aiStartHour || 0), Number(settings.aiStartMinute || 0));
  const end = minutesOfDay(Number(settings.aiEndHour || 0), Number(settings.aiEndMinute || 0));
  return settings.aiDays.includes(day)
    && current >= start
    && current < end;
}

function minutesOfDay(hour: number, minute: number) {
  return (hour * 60) + minute;
}

function formatWindow(settings: AutomationSettings) {
  const pad = (value: string) => String(Number(value || 0)).padStart(2, '0');
  return `${pad(settings.aiStartHour)}:${pad(settings.aiStartMinute)}-${pad(settings.aiEndHour)}:${pad(settings.aiEndMinute)} Stockholm`;
}

function todayRotation() {
  const day = String(new Date().getDay());
  return NICHE_ROTATION_PLAN[day] || null;
}

function nextRotationDay(days: string[]) {
  const now = new Date();
  for (let offset = 0; offset < 14; offset++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    const day = String(candidate.getDay());
    if (days.includes(day) && NICHE_ROTATION_PLAN[day]) return NICHE_ROTATION_PLAN[day];
  }
  return null;
}

function roundUpToInterval(date: Date, intervalMinutes: number) {
  const next = new Date(date);
  next.setSeconds(0, 0);
  const minutes = next.getMinutes();
  const rounded = Math.ceil(minutes / intervalMinutes) * intervalMinutes;
  if (rounded >= 60) {
    next.setHours(next.getHours() + 1, 0, 0, 0);
  } else {
    next.setMinutes(rounded, 0, 0);
  }
  return next;
}

function nextCheckTime(settings: AutomationSettings, intervalMinutes = 20) {
  const now = new Date();
  const startHour = Number(settings.aiStartHour || 10);
  const startMinute = Number(settings.aiStartMinute || 0);
  const endHour = Number(settings.aiEndHour || 17);
  const endMinute = Number(settings.aiEndMinute || 30);
  const days = settings.aiDays.length ? settings.aiDays : DEFAULTS.aiDays;

  for (let offset = 0; offset < 14; offset++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    const day = String(candidate.getDay());
    if (!days.includes(day)) continue;

    if (offset === 0) {
      const next = roundUpToInterval(now, intervalMinutes);
      const nextMinutes = minutesOfDay(next.getHours(), next.getMinutes());
      if (nextMinutes >= minutesOfDay(startHour, startMinute) && nextMinutes < minutesOfDay(endHour, endMinute)) return next;
      if (minutesOfDay(now.getHours(), now.getMinutes()) < minutesOfDay(startHour, startMinute)) {
        candidate.setHours(startHour, startMinute, 0, 0);
        return candidate;
      }
    } else {
      candidate.setHours(startHour, startMinute, 0, 0);
      return candidate;
    }
  }
  return null;
}

function windowProgress(settings: AutomationSettings) {
  if (!activeNow(settings)) return 0;
  const now = new Date();
  const startHour = Number(settings.aiStartHour || 10);
  const startMinute = Number(settings.aiStartMinute || 0);
  const endHour = Number(settings.aiEndHour || 17);
  const endMinute = Number(settings.aiEndMinute || 30);
  const start = minutesOfDay(startHour, startMinute);
  const end = minutesOfDay(endHour, endMinute);
  const current = minutesOfDay(now.getHours(), now.getMinutes());
  const minutesTotal = Math.max(1, end - start);
  const minutesDone = Math.max(0, current - start);
  return Math.min(100, Math.round((minutesDone / minutesTotal) * 100));
}

function clampNumber(value: string, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function reasonLabel(reason?: string) {
  const labels: Record<string, string> = {
    active_call_in_progress: 'waiting for current call to finish',
    daily_cap_reached: 'daily cap reached',
    outside_call_window: 'outside call window',
    outside_send_window: 'outside Gmail window',
    day_blocked: 'outside selected days',
    disabled: 'automation paused',
    no_candidates: 'no eligible leads',
    duplicate_business_identity: 'duplicate business skipped',
    outreach_locked: 'already contacted / locked',
    matching_lead_already_called: 'already in AI-call lane',
  };
  return reason ? (labels[reason] || reason.replace(/_/g, ' ')) : '';
}

function lastRunText(items: AppNotification[], predicate: (item: AppNotification) => boolean) {
  const item = items.find(predicate);
  if (!item) return 'No history yet';
  const payload = (item.payload || {}) as Record<string, any>;
  const reason = reasonLabel(payload.reason);
  const isGmail = isGmailAutomationNotification(item);
  const count = isGmail ? (payload.sent ?? 0) : (payload.started ?? 0);
  const action = isGmail ? 'sent' : 'started';
  const suffix = reason ? ` - ${reason}` : '';
  return `${formatShortTime(item.created_at)}: ${count} ${action}${suffix}`;
}

function latestPayload(items: AppNotification[], predicate: (item: AppNotification) => boolean) {
  const item = items.find(predicate);
  return (item?.payload || {}) as Record<string, any>;
}

function blockerList(payload?: Record<string, any>, diagnostics?: QueueDiagnostics | null) {
  const reasons = diagnostics?.topReasons?.length ? diagnostics.topReasons : payload?.topReasons;
  return Array.isArray(reasons) ? reasons.filter(Boolean).slice(0, 4) : [];
}

export default function AutomationPage() {
  const [settings, setSettings] = useState<AutomationSettings>(DEFAULTS);
  const [stats, setStats] = useState<Stats>({ callsToday: 0, emailsToday: 0, callEligible: 0, emailEligible: 0, activeCalls: 0 });
  const [preview, setPreview] = useState<PreviewLead[]>([]);
  const [previewDiagnostics, setPreviewDiagnostics] = useState<QueueDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningAi, setRunningAi] = useState(false);
  const [runningGmail, setRunningGmail] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [history, setHistory] = useState<AppNotification[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyOutreachStat[]>([]);
  const [integrationHealth, setIntegrationHealth] = useState<IntegrationHealth | null>(null);

  const callPercent = useMemo(() => {
    const cap = Number(settings.aiDaily) || 1;
    return Math.min(100, Math.round((stats.callsToday / cap) * 100));
  }, [settings.aiDaily, stats.callsToday]);

  const todayGmailTarget = useMemo(() => gmailTargetForToday(Number(settings.gmailDaily || NORMAL_GMAIL_DAILY_TARGET)), [settings.gmailDaily]);

  const emailPercent = useMemo(() => {
    return Math.min(100, Math.round((stats.emailsToday / Math.max(1, todayGmailTarget)) * 100));
  }, [stats.emailsToday, todayGmailTarget]);

  const scheduleDaysText = useMemo(() => getScheduleDaysText(settings.aiDays), [settings.aiDays]);
  const nextCallCheck = useMemo(() => settings.aiEnabled ? nextCheckTime(settings, AUTOMATION_INTERVAL_MINUTES) : null, [settings]);
  const nextGmailCheck = useMemo(() => settings.gmailEnabled ? nextCheckTime(settings, AUTOMATION_INTERVAL_MINUTES) : null, [settings]);
  const isWindowOpen = activeNow(settings);
  const dayProgress = windowProgress(settings);
  const latestAi = useMemo(() => latestPayload(history, isAiAutomationNotification), [history]);
  const latestGmail = useMemo(() => latestPayload(history, isGmailAutomationNotification), [history]);
  const aiBlockers = useMemo(() => blockerList(latestAi, previewDiagnostics), [latestAi, previewDiagnostics]);
  const gmailBlockers = useMemo(() => blockerList(latestGmail), [latestGmail]);
  const todaysNiche = useMemo(() => todayRotation(), []);
  const nextNiche = useMemo(() => nextRotationDay(settings.aiDays), [settings.aiDays]);
  const activeNicheLabel = latestAi.nicheLabel || latestGmail.nicheLabel || todaysNiche?.label || nextNiche?.label || 'Launch niches';
  const activeNicheMode = latestAi.nicheMode || latestGmail.nicheMode || (settings.nicheAdaptiveEnabled ? 'scheduled + adaptive' : 'scheduled');
  const hasResendSender = useMemo(() => {
    if (!integrationHealth) return false;
    const resendReady = !integrationHealth.RESEND_API_KEY?.toUpperCase().includes('MISSING');
    const fromReady = !integrationHealth.EMAIL_FROM?.toUpperCase().includes('MISSING');
    return resendReady && fromReady;
  }, [integrationHealth]);
  const missingGmailSecrets = useMemo(() => {
    if (!integrationHealth) return [];
    const resendReady = !integrationHealth.RESEND_API_KEY?.toUpperCase().includes('MISSING');
    const fromReady = !integrationHealth.EMAIL_FROM?.toUpperCase().includes('MISSING');
    if (resendReady && fromReady) return [];
    return ['LOVABLE_API_KEY', 'GOOGLE_MAIL_API_KEY'].filter(key => integrationHealth[key]?.toUpperCase().includes('MISSING'));
  }, [integrationHealth]);

  const aiRunsToday = useMemo(() => {
    const start = new Date(startOfTodayIso());
    return history.filter(item => isAiAutomationNotification(item) && new Date(item.created_at) >= start).length;
  }, [history]);

  const gmailRunsToday = useMemo(() => {
    const start = new Date(startOfTodayIso());
    return history.filter(item => isGmailAutomationNotification(item) && new Date(item.created_at) >= start).length;
  }, [history]);

  const smartSummary = useMemo(() => {
    const callsPerRun = clampNumber(settings.aiPerRun, 1, 1, 1);
    const callDaily = clampNumber(settings.aiDaily, 15, 1, 100);
    const emailDaily = gmailTargetForToday(clampNumber(settings.gmailDaily, NORMAL_GMAIL_DAILY_TARGET, 1, 500));
    const emailBatch = clampNumber(settings.gmailBatchSize, 10, 1, 20);
    const delay = clampNumber(settings.gmailDelaySeconds, 120, 0, 900);
    return {
      callsPerRun,
      callRunsNeeded: Math.ceil(callDaily / callsPerRun),
      emailDaily,
      emailBatch,
      delay,
      safeEmail: emailDaily <= 100 && emailBatch <= 20 && delay >= 60,
    };
  }, [settings.aiDaily, settings.aiPerRun, settings.gmailDaily, settings.gmailBatchSize, settings.gmailDelaySeconds]);

  const loadSettings = async () => {
    const keys = [
      'ai_calls_enabled',
      'ai_calls_daily',
      'ai_calls_daily_connected_cap',
      'ai_calls_per_run',
      'ai_calls_start_hour',
      'ai_calls_start_minute',
      'ai_calls_end_hour',
      'ai_calls_end_minute',
      'ai_calls_days',
      'ai_calls_countries',
      'ai_calls_min_score',
      'ai_calls_product',
      'gmail_autosend_enabled',
      'gmail_autosend_daily',
      'gmail_autosend_delay_seconds',
      'gmail_autosend_batch_size',
      'gmail_autosend_subject',
      'gmail_autosend_body',
      'outreach_niche_rotation_enabled',
      'outreach_niche_adaptive_enabled',
    ];
    const values = await Promise.all(keys.map(key => getSetting(key)));
    const cfg = Object.fromEntries(keys.map((key, index) => [key, values[index]]));
    const next: AutomationSettings = {
      ...DEFAULTS,
      aiEnabled: cfg.ai_calls_enabled === null ? DEFAULTS.aiEnabled : cfg.ai_calls_enabled === 'true',
      aiDaily: cfg.ai_calls_daily_connected_cap || cfg.ai_calls_daily || DEFAULTS.aiDaily,
      aiPerRun: cfg.ai_calls_per_run || DEFAULTS.aiPerRun,
      aiStartHour: cfg.ai_calls_start_hour || DEFAULTS.aiStartHour,
      aiStartMinute: cfg.ai_calls_start_minute || DEFAULTS.aiStartMinute,
      aiEndHour: cfg.ai_calls_end_hour || DEFAULTS.aiEndHour,
      aiEndMinute: cfg.ai_calls_end_minute || DEFAULTS.aiEndMinute,
      aiDays: parseCsv(cfg.ai_calls_days, DEFAULTS.aiDays),
      aiCountries: parseCsv(cfg.ai_calls_countries, DEFAULTS.aiCountries),
      aiMinScore: cfg.ai_calls_min_score || DEFAULTS.aiMinScore,
      aiProduct: cfg.ai_calls_product || DEFAULTS.aiProduct,
      gmailEnabled: cfg.gmail_autosend_enabled === null ? DEFAULTS.gmailEnabled : cfg.gmail_autosend_enabled === 'true',
      gmailDaily: cfg.gmail_autosend_daily || DEFAULTS.gmailDaily,
      gmailBatchSize: cfg.gmail_autosend_batch_size || DEFAULTS.gmailBatchSize,
      gmailDelaySeconds: cfg.gmail_autosend_delay_seconds || DEFAULTS.gmailDelaySeconds,
      gmailSubject: cfg.gmail_autosend_subject || DEFAULTS.gmailSubject,
      gmailBody: cfg.gmail_autosend_body || DEFAULTS.gmailBody,
      nicheRotationEnabled: cfg.outreach_niche_rotation_enabled === null ? DEFAULTS.nicheRotationEnabled : cfg.outreach_niche_rotation_enabled !== 'false',
      nicheAdaptiveEnabled: cfg.outreach_niche_adaptive_enabled === null ? DEFAULTS.nicheAdaptiveEnabled : cfg.outreach_niche_adaptive_enabled !== 'false',
    };
    setSettings(next);
    return next;
  };

  const loadStats = async (nextSettings = settings) => {
    const activeSince = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    const sb = supabase as any;
    const [{ count: emailsToday }, callsTodayRes, { count: activeCalls }, supply] = await Promise.all([
      sb
        .from('message_logs')
        .select('id', { count: 'exact', head: true })
        .eq('channel', 'email')
        .eq('direction', 'outbound')
        .eq('status', 'sent')
        .gte('created_at', startOfTodayIso()),
      sb
        .from('leads')
        .select('id, call_status, call_connected')
        .eq('last_contact_method', 'AI Call')
        .gte('last_contacted_at', startOfTodayIso())
        .limit(1000),
      sb
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('call_status', 'Calling')
        .gte('last_called_at', activeSince),
      loadLeadmapSupplyStats(),
    ]);

    const connectedCallsToday = (callsTodayRes.data || []).filter((lead: any) => lead.call_connected === true || connectedCallStatus(lead.call_status)).length;

    setStats({
      callsToday: connectedCallsToday,
      emailsToday: emailsToday || 0,
      callEligible: supply.readyCall,
      emailEligible: supply.readyEmail,
      activeCalls: activeCalls || 0,
    });
  };

  const loadHistory = async () => {
    const rows = await fetchNotifications(250);
    setHistory(rows.filter(item => isAiAutomationNotification(item) || isGmailAutomationNotification(item)).slice(0, 100));
  };

  const loadIntegrationHealth = async () => {
    const { data, error } = await supabase.functions.invoke('diag-env');
    if (error) {
      setIntegrationHealth(null);
      return;
    }
    setIntegrationHealth((data || {}) as IntegrationHealth);
  };

  const loadDailyStats = async () => {
    const since = startOfDaysAgoIso(13);
    const sb = supabase as any;
    const [{ data: emailRows }, { data: aiStartRows }, { data: connectedRows }] = await Promise.all([
      sb
        .from('message_logs')
        .select('id, created_at')
        .eq('channel', 'email')
        .eq('direction', 'outbound')
        .eq('status', 'sent')
        .gte('created_at', since)
        .limit(5000),
      sb
        .from('activities')
        .select('id, created_at')
        .eq('type', 'ai_call_started')
        .gte('created_at', since)
        .limit(5000),
      sb
        .from('leads')
        .select('id, last_contacted_at, call_status, call_connected')
        .eq('last_contact_method', 'AI Call')
        .gte('last_contacted_at', since)
        .limit(5000),
    ]);

    const buckets = makeDailyBuckets(14);
    for (const row of emailRows || []) {
      const key = dayKey(row.created_at);
      const bucket = buckets.get(key);
      if (bucket) bucket.gmailSent += 1;
    }
    for (const row of aiStartRows || []) {
      const key = dayKey(row.created_at);
      const bucket = buckets.get(key);
      if (bucket) bucket.aiStarted += 1;
    }
    for (const row of connectedRows || []) {
      if (row.call_connected !== true && !connectedCallStatus(row.call_status)) continue;
      const key = dayKey(row.last_contacted_at);
      const bucket = buckets.get(key);
      if (bucket) bucket.aiConnected += 1;
    }
    setDailyStats(Array.from(buckets.values()).reverse());
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const next = await loadSettings();
      await Promise.all([loadStats(next), loadHistory(), loadDailyStats(), loadIntegrationHealth()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load automation');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const intervalId = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const update = <K extends keyof AutomationSettings>(key: K, value: AutomationSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const save = async (next = settings) => {
    setSaving(true);
    try {
      await Promise.all([
        setSetting('ai_calls_enabled', next.aiEnabled ? 'true' : 'false'),
        setSetting('ai_calls_daily', next.aiDaily),
        setSetting('ai_calls_daily_connected_cap', next.aiDaily),
        setSetting('ai_calls_per_run', next.aiPerRun),
        setSetting('ai_calls_start_hour', next.aiStartHour),
        setSetting('ai_calls_start_minute', next.aiStartMinute),
        setSetting('ai_calls_end_hour', next.aiEndHour),
        setSetting('ai_calls_end_minute', next.aiEndMinute),
        setSetting('ai_calls_days', csv(next.aiDays)),
        setSetting('ai_calls_countries', csv(next.aiCountries)),
        setSetting('ai_calls_min_score', next.aiMinScore),
        setSetting('ai_calls_product', next.aiProduct),
        setSetting('ai_calls_timezone', 'Europe/Stockholm'),
        setSetting('gmail_autosend_enabled', next.gmailEnabled ? 'true' : 'false'),
        setSetting('gmail_autosend_daily', next.gmailDaily),
        setSetting('gmail_daily_cap', next.gmailDaily),
        setSetting('gmail_autosend_daily_se', '80'),
        setSetting('gmail_autosend_daily_uk', '20'),
        setSetting('gmail_autosend_daily_es', '0'),
        setSetting('gmail_autosend_supply_min', '500'),
        setSetting('gmail_autosend_delay_seconds', next.gmailDelaySeconds),
        setSetting('gmail_autosend_batch_size', next.gmailBatchSize),
        setSetting('gmail_autosend_subject', next.gmailSubject),
        setSetting('gmail_autosend_body', next.gmailBody),
        setSetting('gmail_autosend_subject_sv', next.gmailSubject),
        setSetting('gmail_autosend_body_sv', next.gmailBody),
        setSetting('outreach_niche_rotation_enabled', next.nicheRotationEnabled ? 'true' : 'false'),
        setSetting('outreach_niche_adaptive_enabled', next.nicheAdaptiveEnabled ? 'true' : 'false'),
        setSetting('outreach_niche_adaptive_min_contacts', '20'),
        setSetting('outreach_niche_rotation_plan', NICHE_ROTATION_JSON),
        setSetting('outreach_niche_priority', NICHE_PRIORITY),
      ]);
      toast.success('Automation saved');
      await Promise.all([loadStats(next), loadHistory(), loadDailyStats()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const applySmartDefaults = async () => {
    const next: AutomationSettings = {
      ...settings,
      aiEnabled: true,
      aiDaily: '15',
      aiPerRun: '1',
      aiStartHour: '10',
      aiStartMinute: '0',
      aiEndHour: '17',
      aiEndMinute: '30',
      aiDays: ['1', '2', '3', '4', '5'],
      aiCountries: settings.aiCountries.length ? settings.aiCountries : ['SE'],
      gmailEnabled: true,
      gmailDaily: String(NORMAL_GMAIL_DAILY_TARGET),
      gmailBatchSize: '10',
      gmailDelaySeconds: '120',
      nicheRotationEnabled: true,
      nicheAdaptiveEnabled: true,
    };
    setSettings(next);
    await save(next);
  };

  const previewCalls = async (next = settings) => {
    setPreviewing(true);
    try {
      await save(next);
      const { data, error } = await supabase.functions.invoke('auto-start-ai-calls-daily', {
        body: { preview: true },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Preview failed');
      setPreview(data?.leads || []);
      setPreviewDiagnostics(data?.diagnostics || null);
      if ((data?.eligible || 0) === 0 && data?.diagnostics?.message) toast.message(data.diagnostics.message);
      else toast.success(`${data?.eligible || 0} AI-call leads eligible`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  };

  const runAiNow = async () => {
    if (!window.confirm('Manual override: start exactly 1 real AI call now?')) return;
    setRunningAi(true);
    try {
      const next = { ...settings, aiEnabled: true };
      setSettings(next);
      await save(next);
      const { data, error } = await supabase.functions.invoke('auto-start-ai-calls-daily', {
        body: { force: true },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'AI batch failed');
      if ((data?.started || 0) === 0 && data?.diagnostics?.message) toast.message(data.diagnostics.message);
      else toast.success(`AI calls: ${data?.started || 0} started, ${data?.skipped || 0} skipped, ${data?.failed || 0} failed`);
      await Promise.all([loadStats(next), previewCalls(next), loadHistory(), loadDailyStats()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI batch failed');
    } finally {
      setRunningAi(false);
    }
  };

  const runGmailNow = async () => {
    if (!window.confirm(`Manual override: run one Gmail batch of up to ${settings.gmailBatchSize} emails now?`)) return;
    setRunningGmail(true);
    try {
      const next = { ...settings, gmailEnabled: true };
      setSettings(next);
      await save(next);
      await setSetting('gmail_autosend_force', 'true');
      const { data, error } = await supabase.functions.invoke('auto-send-gmail-daily', { body: {} });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Gmail batch failed');
      if ((data?.sent || 0) === 0 && data?.diagnostics?.message) toast.message(data.diagnostics.message);
      else if (data?.skipped && data?.reason) toast.message(`Gmail skipped: ${data.reason}`);
      else toast.success(`Gmail: ${data?.sent || 0} sent, ${data?.skipped || 0} skipped, ${data?.failed || 0} failed`);
      await Promise.all([loadStats(next), loadHistory(), loadDailyStats()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gmail batch failed');
    } finally {
      setRunningGmail(false);
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-5 sm:py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Leadmap AI</div>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">Outreach Automation</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Automatic calls and Gmail follow the saved Stockholm schedule and daily caps.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={refresh} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <Button variant="secondary" size="sm" className="gap-2" onClick={applySmartDefaults} disabled={saving}>
              <CheckCircle2 size={14} />
              Use smart auto setup
            </Button>
            <Button size="sm" className="gap-2" onClick={() => save()} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </Button>
          </div>
        </div>

        <section className="mb-5 rounded-lg border border-primary/25 bg-primary/5 p-4">
          <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={isWindowOpen ? 'default' : 'outline'}>
                  {isWindowOpen ? 'Window open now' : 'Waiting for next window'}
                </Badge>
                <Badge variant="secondary">{scheduleDaysText}</Badge>
                <Badge variant="secondary">Every {AUTOMATION_INTERVAL_MINUTES} min</Badge>
                <Badge variant="secondary">{formatWindow(settings)}</Badge>
              </div>
              <h2 className="mt-3 text-lg font-semibold text-foreground">Automatic schedule is the default</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Cron checks every {AUTOMATION_INTERVAL_MINUTES} minutes in the work window. AI calls are one-by-one only; Gmail spreads the same-day quota across the window with validation, dedupe, opt-out, suppression and no-call-overlap checks.
              </p>
            </div>
            <StatusTile
              icon={<Clock size={15} />}
              label="Next AI call check"
              value={nextCallCheck ? `${formatShortDate(nextCallCheck.toISOString())} at ${formatShortTime(nextCallCheck)}` : 'AI paused'}
            />
            <StatusTile
              icon={<Mail size={15} />}
              label="Next Gmail batch"
              value={nextGmailCheck ? `${formatShortDate(nextGmailCheck.toISOString())} at ${formatShortTime(nextGmailCheck)}` : 'Gmail paused'}
            />
            <div className="rounded-md border border-border bg-background/50 px-3 py-2 lg:col-span-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck size={15} />
                Smart safety
              </div>
              <div className="mt-1 grid gap-2 text-sm font-medium text-foreground md:grid-cols-4">
                <span>{stats.activeCalls ? 'AI call in progress now' : 'No active AI call right now'}</span>
                <span>Last AI: {lastRunText(history, isAiAutomationNotification)}</span>
                <span>Last Gmail: {lastRunText(history, isGmailAutomationNotification)}</span>
                <span>
                  Gmail connector:{' '}
                  {missingGmailSecrets.length > 0 ? (
                    <span className="text-destructive">blocked</span>
                  ) : integrationHealth ? (
                    <span className="text-emerald-600">{hasResendSender ? 'Resend ready' : 'ready'}</span>
                  ) : (
                    <span className="text-muted-foreground">checking</span>
                  )}
                </span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-muted">
                <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${dayProgress}%` }} />
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">Window progress today</div>
            </div>
          </div>
        </section>

        <div className="mb-5">
          <LaunchReadinessPanel />
        </div>

        <section className="mb-5 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <Target size={17} className="text-primary" />
                <h2 className="font-semibold text-foreground">Niche rotation for next week</h2>
                <Badge variant={settings.nicheRotationEnabled ? 'default' : 'outline'}>
                  {settings.nicheRotationEnabled ? 'Active' : 'Paused'}
                </Badge>
                <Badge variant={settings.nicheAdaptiveEnabled ? 'secondary' : 'outline'}>
                  {settings.nicheAdaptiveEnabled ? 'Adaptive focus on' : 'Fixed weekdays'}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Gmail and AI calls use the same daily niche: 80 Swedish emails, 20 UK emails, and 15 Swedish connected calls target one market each weekday. Missed volume does not roll into the next day.
              </p>
            </div>
            <div className="grid min-w-[17rem] gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2">
                <div>
                  <div className="text-xs text-muted-foreground">Use niche routing</div>
                  <div className="text-sm font-medium text-foreground">One niche per weekday</div>
                </div>
                <Switch checked={settings.nicheRotationEnabled} onCheckedChange={checked => update('nicheRotationEnabled', checked)} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2">
                <div>
                  <div className="text-xs text-muted-foreground">Winner focus</div>
                  <div className="text-sm font-medium text-foreground">Favor best success rate</div>
                </div>
                <Switch checked={settings.nicheAdaptiveEnabled} onCheckedChange={checked => update('nicheAdaptiveEnabled', checked)} />
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-5">
            {Object.entries(NICHE_ROTATION_PLAN).map(([day, niche]) => {
              const isToday = todaysNiche?.key === niche.key;
              const isNext = !todaysNiche && nextNiche?.key === niche.key;
              return (
                <div
                  key={day}
                  className={cn(
                    'rounded-md border px-3 py-3',
                    isToday || isNext ? 'border-primary bg-primary/5' : 'border-border bg-background/40'
                  )}
                >
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{niche.day}</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">{niche.shortLabel}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    80 SE + 20 UK Gmail, 15 SE connected calls
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <StatusTile icon={<Target size={15} />} label="Current focus" value={activeNicheLabel} />
            <StatusTile icon={<TrendingUp size={15} />} label="Focus mode" value={String(activeNicheMode).replace(/_/g, ' ')} />
            <StatusTile icon={<ShieldCheck size={15} />} label="Fallback rule" value="If a niche runs empty, use the next launch niche" />
          </div>
        </section>

        {missingGmailSecrets.length > 0 && (
          <section className="mb-5 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 text-destructive" size={18} />
                <div>
                  <h2 className="font-semibold text-foreground">Gmail automation is blocked by missing Supabase secrets</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The schedule is running and leads are available, but the live Gmail sender cannot connect until these edge-function secrets exist in this Supabase project: {missingGmailSecrets.join(', ')}.
                  </p>
                </div>
              </div>
              <Badge variant="destructive">0 emails can send</Badge>
            </div>
          </section>
        )}

        <div className="grid gap-3 md:grid-cols-4">
          <Metric title="AI calls today" value={`${stats.callsToday} / ${settings.aiDaily || 0}`} percent={callPercent} />
          <Metric title="Gmail sent today" value={`${stats.emailsToday} / ${todayGmailTarget}`} percent={emailPercent} />
          <Metric title="Call queue" value={stats.activeCalls ? `${stats.callEligible} queued, 1 active` : String(stats.callEligible)} />
          <Metric title="Email queue" value={String(stats.emailEligible)} />
        </div>

        {(stats.callEligible === 0 || stats.emailEligible === 0 || missingGmailSecrets.length > 0) && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {stats.callEligible === 0 && (
              <QueueBlocker
                icon={<Bot size={15} />}
                title="Why no AI calls started"
                message={previewDiagnostics?.message || (latestAi.reason === 'no_candidates' ? 'No eligible AI-call leads in the current queue.' : 'No eligible AI-call leads are available right now.')}
                reasons={aiBlockers}
                checked={previewDiagnostics?.checked ?? latestAi.checked}
              />
            )}
            {(stats.emailEligible === 0 || missingGmailSecrets.length > 0) && (
              <QueueBlocker
                icon={<Mail size={15} />}
                title="Why no Gmail was sent"
                message={missingGmailSecrets.length > 0
                  ? 'Gmail has eligible leads, but the sender is missing required connector secrets in Supabase.'
                  : latestGmail.reason === 'no_candidates'
                    ? 'No eligible Gmail leads in the current queue.'
                    : 'No saved leads with usable emails are available right now.'}
                reasons={missingGmailSecrets.length > 0 ? missingGmailSecrets.map(secret => `${secret} missing`) : gmailBlockers}
                checked={latestGmail.checked}
              />
            )}
          </div>
        )}

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_1fr_0.9fr]">
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Bot size={17} className="text-primary" />
                <h2 className="font-semibold text-foreground">AI call automation</h2>
                <Badge variant={settings.aiEnabled ? 'default' : 'outline'}>{settings.aiEnabled ? 'Auto on' : 'Paused'}</Badge>
              </div>
              <Switch checked={settings.aiEnabled} onCheckedChange={checked => update('aiEnabled', checked)} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Calls/day">
                <Input type="number" min="1" max="100" value={settings.aiDaily} onChange={event => update('aiDaily', event.target.value)} />
              </Field>
              <Field label="Calls/check">
                <Input type="number" min="1" max="1" value="1" disabled onChange={() => undefined} />
              </Field>
              <Field label="Min score">
                <Input type="number" min="0" max="100" value={settings.aiMinScore} onChange={event => update('aiMinScore', event.target.value)} />
              </Field>
              <Field label="Start hour">
                <Input type="number" min="0" max="23" value={settings.aiStartHour} onChange={event => update('aiStartHour', event.target.value)} />
              </Field>
              <Field label="Start min">
                <Input type="number" min="0" max="59" step="5" value={settings.aiStartMinute} onChange={event => update('aiStartMinute', event.target.value)} />
              </Field>
              <Field label="End hour">
                <Input type="number" min="1" max="24" value={settings.aiEndHour} onChange={event => update('aiEndHour', event.target.value)} />
              </Field>
              <Field label="End min">
                <Input type="number" min="0" max="59" step="5" value={settings.aiEndMinute} onChange={event => update('aiEndMinute', event.target.value)} />
              </Field>
              <Field label="Product">
                <select
                  value={settings.aiProduct}
                  onChange={event => update('aiProduct', event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="leadmap">Leadmap</option>
                  <option value="nomia">Nomia</option>
                  <option value="all">All</option>
                </select>
              </Field>
            </div>

            <ChipGroup
              title="Days"
              values={WEEKDAYS}
              selected={settings.aiDays}
              onToggle={value => update('aiDays', toggle(settings.aiDays, value))}
            />
            <ChipGroup
              title="Countries"
              values={COUNTRIES.map(country => [country, country])}
              selected={settings.aiCountries}
              onToggle={value => update('aiCountries', toggle(settings.aiCountries, value))}
            />

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <StatusTile icon={<Clock size={15} />} label="Cadence" value={`1 call every ${AUTOMATION_INTERVAL_MINUTES} min, up to ${settings.aiDaily}/day`} />
              <StatusTile icon={<ShieldCheck size={15} />} label="Calling guardrails" value="One active call, dedupe, opt-out, email exclusion" />
            </div>

            <div className="mt-4 rounded-md border border-border bg-background/40">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div className="text-sm font-medium text-foreground">Next AI call queue</div>
                <Button variant="outline" size="sm" className="h-7 gap-2" onClick={() => previewCalls()} disabled={previewing}>
                  {previewing ? <Loader2 size={13} className="animate-spin" /> : <SlidersHorizontal size={13} />}
                  Preview
                </Button>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {preview.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                    {previewDiagnostics?.message || 'No preview loaded'}
                  </div>
                ) : (
                  preview.map(lead => (
                    <div key={lead.id} className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">{lead.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{lead.phone}</div>
                      </div>
                      <Badge variant="outline">{lead.country || 'SE'}</Badge>
                      {(lead.score || lead.tier) && <Badge variant="secondary">{lead.tier || lead.score}</Badge>}
                    </div>
                  ))
                )}
              </div>
            </div>

            <details className="mt-4 rounded-md border border-border bg-background/40 p-3">
              <summary className="cursor-pointer text-sm font-medium text-foreground">Manual override</summary>
              <Button className="mt-3 gap-2" onClick={runAiNow} disabled={runningAi}>
                {runningAi ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                Start 1 AI call now
              </Button>
            </details>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Mail size={17} className="text-primary" />
                <h2 className="font-semibold text-foreground">Gmail automation</h2>
                <Badge variant={settings.gmailEnabled ? 'default' : 'outline'}>{settings.gmailEnabled ? 'Auto on' : 'Paused'}</Badge>
              </div>
              <Switch checked={settings.gmailEnabled} onCheckedChange={checked => update('gmailEnabled', checked)} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Emails/day">
                <Input type="number" min="1" max="500" value={settings.gmailDaily} onChange={event => update('gmailDaily', event.target.value)} />
              </Field>
              <Field label="Emails/hour">
                <Input type="number" min="1" max="20" value={settings.gmailBatchSize} onChange={event => update('gmailBatchSize', event.target.value)} />
              </Field>
              <Field label="Delay seconds">
                <Input type="number" min="60" max="900" value={settings.gmailDelaySeconds} onChange={event => update('gmailDelaySeconds', event.target.value)} />
              </Field>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <StatusTile icon={<Clock size={15} />} label="Frequency" value={`Every ${AUTOMATION_INTERVAL_MINUTES} min, max 20/run`} />
              <StatusTile icon={<ShieldCheck size={15} />} label="Deliverability" value="Validation, suppression, unsubscribe" />
            </div>

            <div className="mt-4 space-y-3">
              <Field label="Subject">
                <Input value={settings.gmailSubject} onChange={event => update('gmailSubject', event.target.value)} />
              </Field>
              <Field label="Body">
                <Textarea
                  value={settings.gmailBody}
                  onChange={event => update('gmailBody', event.target.value)}
                  className="min-h-64 font-mono text-sm"
                />
              </Field>
            </div>

            <div className="mt-4 rounded-md border border-border bg-background/40 p-3 text-xs text-muted-foreground leading-relaxed">
              Smart setup keeps Gmail controlled at 100/day every weekday, with email validation, duplicate prevention, no AI-call overlap, opt-out checks, suppression list, and unsubscribe footer.
            </div>

            <details className="mt-4 rounded-md border border-border bg-background/40 p-3">
              <summary className="cursor-pointer text-sm font-medium text-foreground">Manual override</summary>
              <Button className="mt-3 gap-2" onClick={runGmailNow} disabled={runningGmail}>
                {runningGmail ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                Run one Gmail batch now
              </Button>
            </details>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <CalendarDays size={17} className="text-primary" />
              <h2 className="font-semibold text-foreground">Daily progress</h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <StatusTile icon={<Bot size={15} />} label="AI checks today" value={String(aiRunsToday)} />
              <StatusTile icon={<Mail size={15} />} label="Gmail checks today" value={String(gmailRunsToday)} />
              <StatusTile icon={<Clock size={15} />} label="Window" value={formatWindow(settings).replace(' Stockholm', '')} />
              <StatusTile icon={<Zap size={15} />} label="Active mode" value={settings.aiEnabled || settings.gmailEnabled ? 'Automatic' : 'Paused'} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <MiniStat label="Total AI started" value={sumHistory(history, 'started', isAiAutomationNotification)} />
              <MiniStat label="Total emails sent" value={sumHistory(history, 'sent', isGmailAutomationNotification)} />
              <MiniStat label="Total skipped" value={sumHistory(history, 'skipped')} />
              <MiniStat label="Total failed" value={sumHistory(history, 'failed')} />
            </div>

            <div className="mt-4 rounded-md border border-border bg-background/40">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-foreground">Sent stats by date</div>
                  <div className="text-[11px] text-muted-foreground">No answer is not counted as a connected call.</div>
                </div>
                <div className="text-xs text-muted-foreground">Last 14 days</div>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {dailyStats.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">No daily stats loaded yet.</div>
                ) : (
                  dailyStats.map(row => {
                    const isToday = row.date === dayKey(new Date());
                    return (
                      <div key={row.date} className="grid grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr] items-center gap-2 border-b border-border/60 px-3 py-2 text-xs last:border-0">
                        <div>
                          <div className="font-medium text-foreground">
                            {isToday ? 'Today' : formatShortDate(`${row.date}T00:00:00`)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">{row.date}</div>
                        </div>
                        <MiniStat label="Gmail sent" value={row.gmailSent} />
                        <MiniStat label="AI started" value={row.aiStarted} />
                        <MiniStat label="Connected" value={row.aiConnected} />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-4 rounded-md border border-border bg-background/40">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div className="text-sm font-medium text-foreground">Automation history</div>
                <div className="text-xs text-muted-foreground">{history.length} events</div>
              </div>
              <div className="max-h-[34rem] overflow-y-auto">
                {history.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">No automation history yet.</div>
                ) : (
                  history.slice(0, 40).map(item => {
                    const payload = (item.payload || {}) as Record<string, any>;
                    const isGmail = isGmailAutomationNotification(item);
                    return (
                      <div key={item.id} className="border-b border-border/60 px-3 py-3 last:border-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-foreground">{item.title}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">{formatShortDate(item.created_at)} at {formatShortTime(item.created_at)}</div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <Badge variant={payload.forced ? 'secondary' : 'outline'}>{isGmail ? 'Gmail' : 'Calls'}</Badge>
                            {payload.nicheLabel && (
                              <Badge variant="secondary" className="max-w-32 truncate text-[10px]">
                                {payload.nicheLabel}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {item.message && <div className="mt-2 text-xs text-muted-foreground">{item.message}</div>}
                        {Array.isArray(payload.topReasons) && payload.topReasons.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {payload.topReasons.slice(0, 4).map((reason: string) => (
                              <Badge key={reason} variant="secondary" className="text-[10px]">{reason}</Badge>
                            ))}
                          </div>
                        )}
                        {Array.isArray(payload.errorSummary) && payload.errorSummary.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {payload.errorSummary.slice(0, 4).map((reason: string) => (
                              <Badge key={reason} variant="destructive" className="text-[10px]">{reason}</Badge>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                          <MiniStat label={isGmail ? 'Sent' : 'Started'} value={isGmail ? payload.sent ?? 0 : payload.started ?? 0} />
                          <MiniStat label="Skipped" value={payload.skipped ?? 0} />
                          <MiniStat label="Failed" value={payload.failed ?? 0} />
                        </div>
                        {Array.isArray(payload.details) && payload.details.length > 0 && (
                          <details className="mt-2 rounded border border-border bg-background/60 px-2 py-1.5">
                            <summary className="cursor-pointer text-xs font-medium text-foreground">Run details</summary>
                            <div className="mt-2 space-y-1">
                              {payload.details.slice(0, 8).map((detail: Record<string, any>, index: number) => (
                                <div key={`${detail.id || index}-${detail.status || 'row'}`} className="grid grid-cols-[1fr_auto] gap-2 text-[11px] text-muted-foreground">
                                  <span className="truncate">{detail.name || detail.id || `Lead ${index + 1}`}</span>
                                  <span className={detail.status === 'failed' ? 'text-destructive' : detail.status === 'started' || detail.status === 'sent' ? 'text-emerald-500' : ''}>
                                    {detail.status}{detail.error ? `: ${detail.error}` : detail.reason ? `: ${detail.reason}` : ''}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                        {(payload.remainingToday !== undefined || payload.remaining !== undefined || payload.checked !== undefined) && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            {payload.remainingToday !== undefined && <>Remaining today: <span className="text-foreground">{payload.remainingToday}</span></>}
                            {payload.remaining !== undefined && <>Remaining email cap: <span className="text-foreground">{payload.remaining}</span></>}
                            {payload.checked !== undefined && <> · Checked: <span className="text-foreground">{payload.checked}</span></>}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded border border-border bg-card px-2 py-1.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function QueueBlocker({
  icon,
  title,
  message,
  reasons,
  checked,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  reasons: string[];
  checked?: number;
}) {
  return (
    <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{message}</p>
      {reasons.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {reasons.map(reason => (
            <Badge key={reason} variant="secondary" className="text-[10px]">{reason}</Badge>
          ))}
        </div>
      )}
      {checked !== undefined && (
        <div className="mt-2 text-[11px] text-muted-foreground">
          Checked <span className="font-medium text-foreground">{checked}</span> saved leads against the filters.
        </div>
      )}
    </div>
  );
}

function Metric({ title, value, percent }: { title: string; value: string; percent?: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
      {percent !== undefined && (
        <div className="mt-3 h-1.5 rounded-full bg-muted">
          <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}

function ChipGroup({
  title,
  values,
  selected,
  onToggle,
}: {
  title: string;
  values: string[] | string[][];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="mt-4">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-2">
        {values.map(item => {
          const value = Array.isArray(item) ? item[0] : item;
          const label = Array.isArray(item) ? item[1] : item;
          const active = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              onClick={() => onToggle(value)}
              className={cn(
                'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                active ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatusTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
