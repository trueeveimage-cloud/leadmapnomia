export type OutreachNicheKey = 'emergency_trades' | 'dental' | 'electricians' | 'auto_services' | 'cleaning';

export type OutreachDayPlan = {
  day: number;
  label: string;
  shortLabel: string;
  niche: OutreachNicheKey;
};

export const OUTREACH_WORK_DAYS: OutreachDayPlan[] = [
  { day: 1, label: 'Monday', shortLabel: 'Mon', niche: 'emergency_trades' },
  { day: 2, label: 'Tuesday', shortLabel: 'Tue', niche: 'dental' },
  { day: 3, label: 'Wednesday', shortLabel: 'Wed', niche: 'electricians' },
  { day: 4, label: 'Thursday', shortLabel: 'Thu', niche: 'auto_services' },
  { day: 5, label: 'Friday', shortLabel: 'Fri', niche: 'cleaning' },
];

export const OUTREACH_NICHE_LABELS: Record<OutreachNicheKey, string> = {
  emergency_trades: 'VVS and emergency trades',
  dental: 'Dental clinics',
  electricians: 'Electricians',
  auto_services: 'Auto workshops',
  cleaning: 'Cleaning companies',
};

export const DEFAULT_OUTREACH_START_HOUR = 10;
export const DEFAULT_OUTREACH_START_MINUTE = 0;
export const DEFAULT_OUTREACH_END_HOUR = 17;
export const DEFAULT_OUTREACH_END_MINUTE = 30;
export const DEFAULT_GMAIL_DAILY = 100;
export const DEFAULT_CONNECTED_CALL_DAILY = 15;

export function dayKey(value: string | Date) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function minutesOfDay(hour: number, minute: number) {
  return (hour * 60) + minute;
}

export function getOutreachWeekStart(reference = new Date()) {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const offset = day === 0 ? 1 : day === 6 ? 2 : 1 - day;
  start.setDate(start.getDate() + offset);
  return start;
}

export function getOutreachWeekDays(reference = new Date()) {
  const monday = getOutreachWeekStart(reference);
  return OUTREACH_WORK_DAYS.map((plan, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      ...plan,
      date,
      dateKey: dayKey(date),
      nicheLabel: OUTREACH_NICHE_LABELS[plan.niche],
    };
  });
}

export function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

export function formatWindow(startHour: number, startMinute: number, endHour: number, endMinute: number) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(startHour)}:${pad(startMinute)}-${pad(endHour)}:${pad(endMinute)}`;
}

export function nextOutreachCheckpoint(input: {
  now?: Date;
  days?: number[];
  startHour?: number;
  startMinute?: number;
  endHour?: number;
  endMinute?: number;
}) {
  const now = input.now || new Date();
  const days = input.days?.length ? input.days : [1, 2, 3, 4, 5];
  const startHour = input.startHour ?? DEFAULT_OUTREACH_START_HOUR;
  const startMinute = input.startMinute ?? DEFAULT_OUTREACH_START_MINUTE;
  const endHour = input.endHour ?? DEFAULT_OUTREACH_END_HOUR;
  const endMinute = input.endMinute ?? DEFAULT_OUTREACH_END_MINUTE;
  const nowMinutes = minutesOfDay(now.getHours(), now.getMinutes());
  const startMinutes = minutesOfDay(startHour, startMinute);
  const endMinutes = minutesOfDay(endHour, endMinute);

  for (let offset = 0; offset < 14; offset++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    const day = candidate.getDay();
    if (!days.includes(day)) continue;

    if (offset === 0 && nowMinutes >= startMinutes && nowMinutes < endMinutes) {
      const next = new Date(now);
      next.setSeconds(0, 0);
      const rounded = Math.ceil(next.getMinutes() / 5) * 5;
      if (rounded >= 60) next.setHours(next.getHours() + 1, 0, 0, 0);
      else next.setMinutes(rounded, 0, 0);
      return { at: next, label: 'Next check', active: true };
    }

    if (offset === 0 && nowMinutes < startMinutes) {
      candidate.setHours(startHour, startMinute, 0, 0);
      return { at: candidate, label: 'Next day starts', active: false };
    }

    if (offset > 0) {
      candidate.setHours(startHour, startMinute, 0, 0);
      return { at: candidate, label: 'Next day starts', active: false };
    }
  }

  return null;
}
