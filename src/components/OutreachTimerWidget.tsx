import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Clock, Target } from 'lucide-react';
import { getSetting } from '@/lib/supabase';
import {
  DEFAULT_OUTREACH_END_HOUR,
  DEFAULT_OUTREACH_END_MINUTE,
  DEFAULT_OUTREACH_START_HOUR,
  DEFAULT_OUTREACH_START_MINUTE,
  formatCountdown,
  nextOutreachCheckpoint,
} from '@/lib/outreachPlan';
import { cn } from '@/lib/utils';

type TimerSettings = {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  days: number[];
};

const DEFAULTS: TimerSettings = {
  startHour: DEFAULT_OUTREACH_START_HOUR,
  startMinute: DEFAULT_OUTREACH_START_MINUTE,
  endHour: DEFAULT_OUTREACH_END_HOUR,
  endMinute: DEFAULT_OUTREACH_END_MINUTE,
  days: [1, 2, 3, 4, 5],
};

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

export default function OutreachTimerWidget() {
  const location = useLocation();
  const [settings, setSettings] = useState<TimerSettings>(DEFAULTS);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      getSetting('ai_calls_start_hour'),
      getSetting('ai_calls_start_minute'),
      getSetting('ai_calls_end_hour'),
      getSetting('ai_calls_end_minute'),
      getSetting('ai_calls_days'),
    ]).then(([startHour, startMinute, endHour, endMinute, days]) => {
      if (!mounted) return;
      setSettings({
        startHour: intValue(startHour, DEFAULTS.startHour, 0, 23),
        startMinute: intValue(startMinute, DEFAULTS.startMinute, 0, 59),
        endHour: intValue(endHour, DEFAULTS.endHour, 1, 24),
        endMinute: intValue(endMinute, DEFAULTS.endMinute, 0, 59),
        days: parseCsvNumbers(days, DEFAULTS.days),
      });
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  const checkpoint = useMemo(() => nextOutreachCheckpoint({
    now,
    days: settings.days,
    startHour: settings.startHour,
    startMinute: settings.startMinute,
    endHour: settings.endHour,
    endMinute: settings.endMinute,
  }), [now, settings]);

  if (location.pathname === '/outreach-progress') return null;
  if (!checkpoint) return null;

  return (
    <Link
      to="/outreach-progress"
      className={cn(
        'fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border px-3 py-2 shadow-lg backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-xl',
        checkpoint.active
          ? 'border-primary/35 bg-primary text-primary-foreground'
          : 'border-border bg-card/95 text-foreground'
      )}
      aria-label="Open outreach progress"
    >
      <div className={cn(
        'grid h-8 w-8 shrink-0 place-items-center rounded-md',
        checkpoint.active ? 'bg-primary-foreground/15' : 'bg-primary/10 text-primary'
      )}>
        {checkpoint.active ? <Target size={16} /> : <Clock size={16} />}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-[0.12em] opacity-80">
          {checkpoint.label}
        </div>
        <div className="truncate text-sm font-semibold">
          {formatCountdown(checkpoint.at.getTime() - now.getTime())}
        </div>
      </div>
    </Link>
  );
}
