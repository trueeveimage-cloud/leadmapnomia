export type NicheKey = 'emergency_trades' | 'dental' | 'electricians' | 'auto_services' | 'cleaning';

export type NicheDefinition = {
  key: NicheKey;
  label: string;
  shortLabel: string;
  keywords: string[];
};

export type NichePlanResult = {
  enabled: boolean;
  adaptiveEnabled: boolean;
  day: number;
  mode: 'off' | 'scheduled' | 'adaptive' | 'fallback';
  selectedKey: NicheKey | null;
  selectedLabel: string;
  plannedKey: NicheKey | null;
  plannedLabel: string;
  reason?: string;
  stats?: NichePerformance[];
};

export type NichePerformance = {
  key: NicheKey;
  label: string;
  attempts: number;
  successes: number;
  connectedCalls: number;
  successRate: number;
  score: number;
};

export const LAUNCH_NICHES: NicheDefinition[] = [
  {
    key: 'emergency_trades',
    label: 'VVS and emergency trades',
    shortLabel: 'VVS / emergency',
    keywords: [
      'plumber', 'plumbing', 'vvs', 'ror', 'rorfirma', 'pipes', 'drain', 'jour',
      'locksmith', 'lasser', 'tak', 'roof', 'water damage', 'leak',
    ],
  },
  {
    key: 'dental',
    label: 'Dental clinics',
    shortLabel: 'Dental',
    keywords: [
      'dental', 'dentist', 'tand', 'tandlakare', 'implant', 'orthodont',
      'clinic', 'klin',
    ],
  },
  {
    key: 'electricians',
    label: 'Electricians',
    shortLabel: 'Electricians',
    keywords: [
      'electric', 'electrician', 'el ', 'el-', 'elinstallation', 'elektriker',
      'belysning', 'automation', 'voltage',
    ],
  },
  {
    key: 'auto_services',
    label: 'Auto workshops',
    shortLabel: 'Auto',
    keywords: [
      'auto', 'car', 'vehicle', 'bil', 'verkstad', 'mechanic', 'garage',
      'dack', 'rekond', 'detailing', 'repair',
    ],
  },
  {
    key: 'cleaning',
    label: 'Cleaning companies',
    shortLabel: 'Cleaning',
    keywords: [
      'clean', 'cleaning', 'stad', 'stadning', 'hemstad', 'flyttstad',
      'sanering', 'housekeeping', 'facility',
    ],
  },
];

const DEFAULT_PLAN: Record<string, NicheKey> = {
  '1': 'emergency_trades',
  '2': 'dental',
  '3': 'electricians',
  '4': 'auto_services',
  '5': 'cleaning',
};

const DEFAULT_PRIORITY: NicheKey[] = ['emergency_trades', 'dental', 'electricians', 'auto_services', 'cleaning'];

const SUCCESS_LEAD_STATUSES = ['interested', 'callback', 'closed_won'];
const SUCCESS_CALL_STATUSES = ['interested', 'demo requested', 'meeting requested'];
const ATTEMPT_STATES = ['called', 'email_sent', 'follow_up_needed', 'do_not_contact'];

function stripMarks(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function nicheByKey(key?: string | null) {
  return LAUNCH_NICHES.find((niche) => niche.key === key) || null;
}

export function labelForNiche(key?: string | null) {
  return nicheByKey(key)?.label || 'All launch niches';
}

export function shortLabelForNiche(key?: string | null) {
  return nicheByKey(key)?.shortLabel || 'All';
}

export function parseNichePlan(value?: string | null): Record<string, NicheKey> {
  if (!value) return DEFAULT_PLAN;
  try {
    const parsed = JSON.parse(value);
    const plan = { ...DEFAULT_PLAN };
    for (const [day, key] of Object.entries(parsed || {})) {
      if (nicheByKey(String(key))) plan[String(day)] = key as NicheKey;
    }
    return plan;
  } catch {
    return DEFAULT_PLAN;
  }
}

export function parseNichePriority(value?: string | null): NicheKey[] {
  const keys = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is NicheKey => !!nicheByKey(item));
  return keys.length ? keys : DEFAULT_PRIORITY;
}

export function plannedNicheForDay(day: number, settings: Record<string, string>) {
  const plan = parseNichePlan(settings.outreach_niche_rotation_plan);
  return plan[String(day)] || null;
}

export function leadNicheText(lead: Record<string, unknown>) {
  return stripMarks([
    lead.category,
    lead.niche_label,
    lead.detected_niche,
    lead.business_type,
    lead.name,
    lead.website,
  ].filter(Boolean).join(' '));
}

export function matchesNiche(lead: Record<string, unknown>, key: NicheKey) {
  const text = leadNicheText(lead);
  if (!text) return false;
  const niche = nicheByKey(key);
  return !!niche && niche.keywords.some((keyword) => text.includes(stripMarks(keyword)));
}

export function classifyLeadNiche(lead: Record<string, unknown>): NicheKey | null {
  for (const niche of LAUNCH_NICHES) {
    if (matchesNiche(lead, niche.key)) return niche.key;
  }
  return null;
}

export function filterCandidatesByNiche<T extends Record<string, unknown>>(
  candidates: T[],
  plan: NichePlanResult,
  settings: Record<string, string>,
) {
  if (!plan.enabled || !plan.selectedKey) {
    return { candidates, plan };
  }

  const selected = candidates.filter((lead) => matchesNiche(lead, plan.selectedKey!));
  if (selected.length > 0) return { candidates: selected, plan };

  const priority = parseNichePriority(settings.outreach_niche_priority);
  for (const key of priority) {
    const fallback = candidates.filter((lead) => matchesNiche(lead, key));
    if (fallback.length > 0) {
      return {
        candidates: fallback,
        plan: {
          ...plan,
          selectedKey: key,
          selectedLabel: labelForNiche(key),
          mode: 'fallback' as const,
          reason: `No eligible ${plan.selectedLabel} leads, fell back to ${labelForNiche(key)}.`,
        },
      };
    }
  }

  return {
    candidates,
    plan: {
      ...plan,
      selectedKey: null,
      selectedLabel: 'All launch niches',
      mode: 'fallback' as const,
      reason: `No launch-niche matches were found, using the highest scored eligible leads.`,
    },
  };
}

function connectedCallStatus(status?: unknown) {
  const value = String(status || '').toLowerCase();
  return !!value && !['no answer', 'calling', 'error', 'dead (3x no answer)', 'failed', 'busy'].includes(value);
}

function timestampMs(value: unknown) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function lastAttemptMs(lead: Record<string, unknown>) {
  const times = [
    timestampMs(lead.last_contacted_at),
    timestampMs(lead.last_called_at),
  ].filter((time): time is number => time !== null);
  return times.length ? Math.max(...times) : null;
}

function leadAttempted(lead: Record<string, unknown>, sinceMs: number | null) {
  const attempted = !!lead.last_contacted_at
    || !!lead.last_called_at
    || Number(lead.call_attempts || 0) > 0
    || ATTEMPT_STATES.includes(String(lead.outreach_state || '').toLowerCase())
    || String(lead.outreach_stage || '').toLowerCase() === 'email_sent'
    || String(lead.last_contact_method || '').toLowerCase() === 'email'
    || String(lead.last_contact_method || '').toLowerCase() === 'ai call';
  if (!attempted) return false;
  if (!sinceMs) return true;
  const attemptMs = lastAttemptMs(lead);
  return attemptMs !== null && attemptMs >= sinceMs;
}

function leadSucceeded(lead: Record<string, unknown>) {
  const status = String(lead.status || '').toLowerCase();
  const callStatus = String(lead.call_status || '').toLowerCase();
  return SUCCESS_LEAD_STATUSES.includes(status)
    || SUCCESS_CALL_STATUSES.includes(callStatus);
}

export async function chooseNichePlan(
  supabase: any,
  settings: Record<string, string>,
  day: number,
): Promise<NichePlanResult> {
  const enabled = settings.outreach_niche_rotation_enabled !== 'false';
  const adaptiveEnabled = settings.outreach_niche_adaptive_enabled !== 'false';
  const plannedKey = plannedNicheForDay(day, settings);
  const plannedLabel = labelForNiche(plannedKey);
  const base: NichePlanResult = {
    enabled,
    adaptiveEnabled,
    day,
    mode: enabled ? 'scheduled' : 'off',
    selectedKey: enabled ? plannedKey : null,
    selectedLabel: enabled ? plannedLabel : 'All launch niches',
    plannedKey,
    plannedLabel,
  };

  if (!enabled || !adaptiveEnabled) return base;

  const minContacts = Math.max(1, Math.min(500, Number.parseInt(settings.outreach_niche_adaptive_min_contacts || '', 10) || 20));
  const adaptiveSinceMs = timestampMs(settings.outreach_niche_adaptive_since);
  const { data } = await supabase
    .from('leads')
    .select('id, name, category, niche_label, detected_niche, business_type, website, status, call_status, call_connected, call_attempts, outreach_state, outreach_stage, last_contacted_at, last_called_at, last_contact_method')
    .limit(5000);

  const rows = (data || []) as Record<string, unknown>[];
  const stats = LAUNCH_NICHES.map((niche) => {
    const matching = rows.filter((lead) => matchesNiche(lead, niche.key) && leadAttempted(lead, adaptiveSinceMs));
    const successes = matching.filter(leadSucceeded).length;
    const connectedCalls = matching.filter((lead) => Boolean(lead.call_connected) || connectedCallStatus(lead.call_status)).length;
    const attempts = matching.length;
    const successRate = attempts > 0 ? successes / attempts : 0;
    return {
      key: niche.key,
      label: niche.label,
      attempts,
      successes,
      connectedCalls,
      successRate,
      score: ((successes + 1) / (attempts + 4)) + Math.min(0.05, connectedCalls * 0.002),
    };
  });

  const totalAttempts = stats.reduce((sum, item) => sum + item.attempts, 0);
  if (totalAttempts < minContacts) {
    return {
      ...base,
      stats,
      reason: `Scheduled rotation stays active until ${minContacts} launch-niche contacts are measured.`,
    };
  }

  const minNicheAttempts = Math.max(3, Math.floor(minContacts / 5));
  const ranked = stats
    .filter((item) => item.attempts >= minNicheAttempts)
    .sort((a, b) => b.successRate - a.successRate || b.score - a.score || b.attempts - a.attempts);
  const best = ranked[0];
  if (!best) return { ...base, stats };

  return {
    ...base,
    mode: 'adaptive',
    selectedKey: best.key,
    selectedLabel: best.label,
    stats,
    reason: `${best.label} has the strongest measured success rate (${Math.round(best.successRate * 100)}%).`,
  };
}
