import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { fetchNotifications, getSetting, type AppNotification } from '@/lib/supabase';
import {
  DEFAULT_CONNECTED_CALL_DAILY,
  DEFAULT_GMAIL_DAILY,
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
import { connectedCallStatus } from '@/lib/outreachEligibility';
import {
  Activity,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock,
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
  nicheLabel: string;
  gmailSent: number;
  emailInterested: number;
  emailDemo: number;
  aiStarted: number;
  aiConnected: number;
  callInterested: number;
  callDemo: number;
  callNotInterested: number;
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
  gmailDailySe: 100,
  gmailDailyUk: 10,
  gmailDailyEs: 10,
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

function isDemoStatus(status?: string | null) {
  const value = String(status || '').toLowerCase();
  return value.includes('demo') || value.includes('meeting') || value.includes('making_demo');
}

function gmailTargetForDay(day: Pick<DayStats, 'dateKey'>, settings: Settings) {
  const normalTarget = Math.max(settings.gmailDaily, settings.gmailDailySe + settings.gmailDailyUk + settings.gmailDailyEs);
  const date = new Date(`${day.dateKey}T00:00:00`);
  return date.getDay() === 2 ? Math.max(240, normalTarget * 2) : normalTarget;
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
  return { label: 'Waiting', tone: 'muted' as const };
}

function summarizeDay(day: DayStats, settings: Settings, emailTarget: number) {
  const emailLeft = Math.max(0, emailTarget - day.gmailSent);
  const callLeft = Math.max(0, settings.callDaily - day.aiConnected);
  if (emailLeft === 0 && callLeft === 0) return 'Daily quota hit.';
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
  const monday = days.find(day => day.dateKey === weekDays[0]?.dateKey);
  const tuesday = days.find(day => day.dateKey === weekDays[1]?.dateKey);
  const normalEmailTarget = Math.max(settings.gmailDaily, settings.gmailDailySe + settings.gmailDailyUk + settings.gmailDailyEs);
  const mondayEmailDeficit = Math.max(0, normalEmailTarget - (monday?.gmailSent || 0));
  const tuesdayCatchUpBudget = mondayEmailDeficit > 0 ? normalEmailTarget : 0;
  const tuesdayCatchUpProgress = Math.min(tuesdayCatchUpBudget, tuesday?.gmailSent || 0);
  const showTuesdayCatchUp = now.getDay() <= 2 && weekDays[1]?.dateKey >= now.toISOString().slice(0, 10);

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
        gmailDaily: intValue(cfg.gmail_autosend_daily, DEFAULT_SETTINGS.gmailDaily, 1, 500),
        gmailDailySe: intValue(cfg.gmail_autosend_daily_se, DEFAULT_SETTINGS.gmailDailySe, 0, 500),
        gmailDailyUk: intValue(cfg.gmail_autosend_daily_uk, DEFAULT_SETTINGS.gmailDailyUk, 0, 500),
        gmailDailyEs: intValue(cfg.gmail_autosend_daily_es, DEFAULT_SETTINGS.gmailDailyEs, 0, 500),
        callDaily: intValue(cfg.ai_calls_daily_connected_cap || cfg.ai_calls_daily, DEFAULT_SETTINGS.callDaily, 1, 100),
        startHour: intValue(cfg.ai_calls_start_hour, DEFAULT_SETTINGS.startHour, 0, 23),
        startMinute: intValue(cfg.ai_calls_start_minute, DEFAULT_SETTINGS.startMinute, 0, 59),
        endHour: intValue(cfg.ai_calls_end_hour, DEFAULT_SETTINGS.endHour, 1, 24),
        endMinute: intValue(cfg.ai_calls_end_minute, DEFAULT_SETTINGS.endMinute, 0, 59),
        days: parseCsvNumbers(cfg.ai_calls_days, DEFAULT_SETTINGS.days),
      };
      setSettings(nextSettings);

      const first = weekDays[0]?.date || new Date();
      const last = weekDays[4]?.date || new Date();
      const since = startOfDayIso(first);
      const until = endOfDayIso(last);
      const sb = supabase as any;
      const [{ data: emailRows }, { data: aiRows }, { data: connectedRows }, notifications] = await Promise.all([
        sb
          .from('message_logs')
          .select('id, created_at, lead_id, leads(status)')
          .eq('channel', 'email')
          .eq('direction', 'outbound')
          .eq('status', 'sent')
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
        fetchNotifications(300),
      ]);

      const buckets = new Map<string, DayStats>();
      for (const day of weekDays) {
        buckets.set(day.dateKey, {
          dateKey: day.dateKey,
          label: day.label,
          shortLabel: day.shortLabel,
          nicheLabel: day.nicheLabel,
          gmailSent: 0,
          emailInterested: 0,
          emailDemo: 0,
          aiStarted: 0,
          aiConnected: 0,
          callInterested: 0,
          callDemo: 0,
          callNotInterested: 0,
          failed: 0,
          skipped: 0,
          summary: '',
        });
      }

      for (const row of emailRows || []) {
        const bucket = buckets.get(row.created_at.slice(0, 10));
        if (bucket) {
          const status = row.leads?.status;
          bucket.gmailSent += 1;
          if (isInterestedStatus(status)) bucket.emailInterested += 1;
          if (isDemoStatus(status)) bucket.emailDemo += 1;
        }
      }
      for (const row of aiRows || []) {
        const bucket = buckets.get(row.created_at.slice(0, 10));
        if (bucket) bucket.aiStarted += 1;
      }
      for (const row of connectedRows || []) {
        if (row.call_connected !== true && !connectedCallStatus(row.call_status)) continue;
        const bucket = buckets.get(String(row.last_contacted_at || '').slice(0, 10));
        if (bucket) {
          bucket.aiConnected += 1;
          if (isInterestedStatus(row.status) || isInterestedStatus(row.call_status)) bucket.callInterested += 1;
          if (isDemoStatus(row.status) || isDemoStatus(row.call_status)) bucket.callDemo += 1;
          if (String(row.status || '').toLowerCase() === 'not_interested' || String(row.call_status || '').toLowerCase().includes('not interested')) bucket.callNotInterested += 1;
        }
      }

      const relevantNotifications = notifications.filter(item => {
        const key = item.created_at.slice(0, 10);
        return buckets.has(key) && (item.type === 'gmail_batch_done' || item.type === 'ai_call_batch_done');
      });
      for (const item of relevantNotifications) {
        const bucket = buckets.get(item.created_at.slice(0, 10));
        const payload = (item.payload || {}) as Record<string, any>;
        if (!bucket) continue;
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
            Tuesday is the catch-up exception: up to 240 Gmail total, with the send window extended to 18:00. Plus {settings.callDaily} connected AI calls/day (Sweden).
          </p>
        </section>

        {showTuesdayCatchUp && (
        <section className="mt-5 rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <RefreshCw size={17} className="text-primary" />
            <h2 className="font-semibold text-foreground">Tuesday catch-up</h2>
            <Badge variant={mondayEmailDeficit > 0 ? 'destructive' : 'secondary'} className="ml-auto">
              {mondayEmailDeficit > 0 ? `${mondayEmailDeficit} Monday emails missing` : 'No Monday gap'}
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <MiniStat label="Monday VVS sent" value={`${monday?.gmailSent || 0} / ${normalEmailTarget}`} />
            <MiniStat label="Tuesday catch-up allocation" value={mondayEmailDeficit > 0 ? `${tuesdayCatchUpBudget} max` : 'Not needed'} />
            <MiniStat label="Tuesday catch-up progress" value={mondayEmailDeficit > 0 ? `${tuesdayCatchUpProgress} / ${tuesdayCatchUpBudget}` : 'Complete'} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            If Monday Gmail missed quota, Tuesday can use the first {normalEmailTarget} Gmail slots for Monday's VVS and emergency trades catch-up, then switch to Tuesday's dental batch. Tuesday's special Gmail cap is 240; AI calls stay capped at {settings.callDaily} connected calls.
          </p>
        </section>
        )}

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

                  <div className="mt-4 space-y-3">
                    <ProgressLine label="Gmail" value={day.gmailSent} target={dayEmailTarget} percent={emailPct} />
                    <ProgressLine label="Connected calls" value={day.aiConnected} target={settings.callDaily} percent={callPct} />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <MiniStat label="Email interest" value={`${emailInterestPct}%`} />
                    <MiniStat label="Call interest" value={`${callInterestPct}%`} />
                    <MiniStat label="AI started" value={day.aiStarted} />
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
