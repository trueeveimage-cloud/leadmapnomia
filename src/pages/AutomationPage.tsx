import React, { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { getSetting, setSetting } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Bot, Clock, Loader2, Mail, Play, RefreshCw, Save, ShieldCheck, SlidersHorizontal, Zap } from 'lucide-react';
import { toast } from 'sonner';

type AutomationSettings = {
  aiEnabled: boolean;
  aiDaily: string;
  aiPerRun: string;
  aiStartHour: string;
  aiEndHour: string;
  aiDays: string[];
  aiCountries: string[];
  aiMinScore: string;
  aiProduct: string;
  gmailEnabled: boolean;
  gmailDaily: string;
  gmailSubject: string;
  gmailBody: string;
};

type Stats = {
  callsToday: number;
  emailsToday: number;
  callEligible: number;
  emailEligible: number;
};

type PreviewLead = {
  id: string;
  name: string;
  phone: string;
  score?: number | null;
  tier?: string | null;
  country?: string | null;
};

const DEFAULTS: AutomationSettings = {
  aiEnabled: false,
  aiDaily: '15',
  aiPerRun: '3',
  aiStartHour: '9',
  aiEndHour: '17',
  aiDays: ['1', '2', '3', '4', '5'],
  aiCountries: ['SE'],
  aiMinScore: '0',
  aiProduct: 'leadmap',
  gmailEnabled: false,
  gmailDaily: '100',
  gmailSubject: 'En snabb fraga om era inkommande samtal',
  gmailBody: 'Hej {name}!\n\nVi bygger en AI-receptionist som svarar i telefon dygnet runt sa ni inte missar samtal fran nya kunder.\n\nVill du hora hur det fungerar? Tar 5 minuter.\n\n/Maged',
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
const EXCLUDED_CALL_STATUSES = ['interested', 'not_interested', 'callback', 'closed_won', 'closed_lost'];

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

function normalizePhone(value?: string | null) {
  const compact = String(value || '').trim().replace(/[^\d+]/g, '');
  if (!compact) return '';
  if (compact.startsWith('+')) return compact;
  if (compact.startsWith('00')) return `+${compact.slice(2)}`;
  if (compact.startsWith('0')) return `+46${compact.slice(1)}`;
  if (compact.startsWith('46')) return `+${compact}`;
  return '';
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

export default function AutomationPage() {
  const [settings, setSettings] = useState<AutomationSettings>(DEFAULTS);
  const [stats, setStats] = useState<Stats>({ callsToday: 0, emailsToday: 0, callEligible: 0, emailEligible: 0 });
  const [preview, setPreview] = useState<PreviewLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningAi, setRunningAi] = useState(false);
  const [runningGmail, setRunningGmail] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const callPercent = useMemo(() => {
    const cap = Number(settings.aiDaily) || 1;
    return Math.min(100, Math.round((stats.callsToday / cap) * 100));
  }, [settings.aiDaily, stats.callsToday]);

  const emailPercent = useMemo(() => {
    const cap = Number(settings.gmailDaily) || 1;
    return Math.min(100, Math.round((stats.emailsToday / cap) * 100));
  }, [settings.gmailDaily, stats.emailsToday]);

  const loadSettings = async () => {
    const keys = [
      'ai_calls_enabled',
      'ai_calls_daily',
      'ai_calls_per_run',
      'ai_calls_start_hour',
      'ai_calls_end_hour',
      'ai_calls_days',
      'ai_calls_countries',
      'ai_calls_min_score',
      'ai_calls_product',
      'gmail_autosend_enabled',
      'gmail_autosend_daily',
      'gmail_autosend_subject',
      'gmail_autosend_body',
    ];
    const values = await Promise.all(keys.map(key => getSetting(key)));
    const cfg = Object.fromEntries(keys.map((key, index) => [key, values[index]]));
    const next = {
      ...DEFAULTS,
      aiEnabled: cfg.ai_calls_enabled === 'true',
      aiDaily: cfg.ai_calls_daily || DEFAULTS.aiDaily,
      aiPerRun: cfg.ai_calls_per_run || DEFAULTS.aiPerRun,
      aiStartHour: cfg.ai_calls_start_hour || DEFAULTS.aiStartHour,
      aiEndHour: cfg.ai_calls_end_hour || DEFAULTS.aiEndHour,
      aiDays: parseCsv(cfg.ai_calls_days, DEFAULTS.aiDays),
      aiCountries: parseCsv(cfg.ai_calls_countries, DEFAULTS.aiCountries),
      aiMinScore: cfg.ai_calls_min_score || DEFAULTS.aiMinScore,
      aiProduct: cfg.ai_calls_product || DEFAULTS.aiProduct,
      gmailEnabled: cfg.gmail_autosend_enabled === 'true',
      gmailDaily: cfg.gmail_autosend_daily || DEFAULTS.gmailDaily,
      gmailSubject: cfg.gmail_autosend_subject || DEFAULTS.gmailSubject,
      gmailBody: cfg.gmail_autosend_body || DEFAULTS.gmailBody,
    };
    setSettings(next);
    return next;
  };

  const loadStats = async (nextSettings = settings) => {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const [{ count: emailsToday }, { count: callsToday }, emailEligibleRes, callRowsRes] = await Promise.all([
      supabase
        .from('message_logs')
        .select('id', { count: 'exact', head: true })
        .eq('channel', 'email')
        .eq('direction', 'outbound')
        .eq('status', 'sent')
        .gte('created_at', startOfDay.toISOString()),
      supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'ai_call_started')
        .gte('created_at', startOfDay.toISOString()),
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .not('email', 'is', null)
        .neq('email', '')
        .eq('outreach_opt_out', false)
        .or('do_not_contact.is.null,do_not_contact.eq.false')
        .neq('outreach_stage', 'email_sent')
        .neq('outreach_state', 'email_sent')
        .in('lead_tier', ['S', 'A+', 'A']),
      supabase
        .from('leads')
        .select('id, phone, phone_e164, country, address, product, status, call_attempts, call_status, outreach_opt_out, do_not_contact, potential_score, last_contacted_at, outreach_state')
        .or('phone.not.is.null,phone_e164.not.is.null')
        .eq('outreach_opt_out', false)
        .lt('call_attempts', 2)
        .limit(2000),
    ]);

    const callEligible = (callRowsRes.data || []).filter((lead: any) => {
      if (nextSettings.aiProduct !== 'all' && lead.product !== nextSettings.aiProduct) return false;
      if (Number(nextSettings.aiMinScore || 0) > 0 && (lead.potential_score || 0) < Number(nextSettings.aiMinScore)) return false;
      if (!nextSettings.aiCountries.includes(detectCountry(lead))) return false;
      if (lead.do_not_contact === true) return false;
      if (lead.call_status === 'Calling') return false;
      if (lead.last_contacted_at || lead.outreach_state === 'called') return false;
      if (EXCLUDED_CALL_STATUSES.includes(String(lead.status || ''))) return false;
      return !!normalizePhone(lead.phone_e164 || lead.phone);
    }).length;

    setStats({
      callsToday: callsToday || 0,
      emailsToday: emailsToday || 0,
      callEligible,
      emailEligible: emailEligibleRes.count || 0,
    });
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const next = await loadSettings();
      await loadStats(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load automation');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
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
        setSetting('ai_calls_per_run', next.aiPerRun),
        setSetting('ai_calls_start_hour', next.aiStartHour),
        setSetting('ai_calls_end_hour', next.aiEndHour),
        setSetting('ai_calls_days', csv(next.aiDays)),
        setSetting('ai_calls_countries', csv(next.aiCountries)),
        setSetting('ai_calls_min_score', next.aiMinScore),
        setSetting('ai_calls_product', next.aiProduct),
        setSetting('ai_calls_timezone', 'Europe/Stockholm'),
        setSetting('gmail_autosend_enabled', next.gmailEnabled ? 'true' : 'false'),
        setSetting('gmail_autosend_daily', next.gmailDaily),
        setSetting('gmail_daily_cap', next.gmailDaily),
        setSetting('gmail_autosend_subject', next.gmailSubject),
        setSetting('gmail_autosend_body', next.gmailBody),
      ]);
      toast.success('Automation saved');
      await loadStats(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setSaving(false);
    }
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
      toast.success(`${data?.eligible || 0} AI-call leads eligible`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  };

  const runAiNow = async () => {
    if (!window.confirm(`Start up to ${settings.aiPerRun} real AI calls now?`)) return;
    setRunningAi(true);
    try {
      const next = { ...settings, aiEnabled: true };
      setSettings(next);
      await save(next);
      const { data, error } = await supabase.functions.invoke('auto-start-ai-calls-daily', {
        body: { force: true },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'AI batch failed');
      toast.success(`AI calls: ${data?.started || 0} started, ${data?.skipped || 0} skipped, ${data?.failed || 0} failed`);
      await loadStats(next);
      await previewCalls(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI batch failed');
    } finally {
      setRunningAi(false);
    }
  };

  const runGmailNow = async () => {
    if (!window.confirm(`Send up to ${settings.gmailDaily} real Gmail emails now?`)) return;
    setRunningGmail(true);
    try {
      const next = { ...settings, gmailEnabled: true };
      setSettings(next);
      await save(next);
      await setSetting('gmail_autosend_force', 'true');
      const { data, error } = await supabase.functions.invoke('auto-send-gmail-daily', { body: {} });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Gmail batch failed');
      if (data?.skipped && data?.reason) toast.message(`Gmail skipped: ${data.reason}`);
      else toast.success(`Gmail: ${data?.sent || 0} sent, ${data?.skipped || 0} skipped, ${data?.failed || 0} failed`);
      await loadStats(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gmail batch failed');
    } finally {
      setRunningGmail(false);
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-6xl px-5 py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Leadmap AI</div>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">Outreach Automation</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={refresh} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <Button size="sm" className="gap-2" onClick={() => save()} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Metric title="AI calls today" value={`${stats.callsToday} / ${settings.aiDaily || 0}`} percent={callPercent} />
          <Metric title="Gmail sent today" value={`${stats.emailsToday} / ${settings.gmailDaily || 0}`} percent={emailPercent} />
          <Metric title="Call queue" value={String(stats.callEligible)} />
          <Metric title="Email queue" value={String(stats.emailEligible)} />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <Bot size={17} className="text-primary" />
                <h2 className="font-semibold text-foreground">AI call automation</h2>
                <Badge variant={settings.aiEnabled ? 'default' : 'outline'}>{settings.aiEnabled ? 'Enabled' : 'Paused'}</Badge>
              </div>
              <Switch checked={settings.aiEnabled} onCheckedChange={checked => update('aiEnabled', checked)} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Calls/day">
                <Input type="number" min="1" max="100" value={settings.aiDaily} onChange={event => update('aiDaily', event.target.value)} />
              </Field>
              <Field label="Calls/run">
                <Input type="number" min="1" max="10" value={settings.aiPerRun} onChange={event => update('aiPerRun', event.target.value)} />
              </Field>
              <Field label="Min score">
                <Input type="number" min="0" max="100" value={settings.aiMinScore} onChange={event => update('aiMinScore', event.target.value)} />
              </Field>
              <Field label="Start hour">
                <Input type="number" min="0" max="23" value={settings.aiStartHour} onChange={event => update('aiStartHour', event.target.value)} />
              </Field>
              <Field label="End hour">
                <Input type="number" min="1" max="24" value={settings.aiEndHour} onChange={event => update('aiEndHour', event.target.value)} />
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

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" className="gap-2" onClick={previewCalls} disabled={previewing}>
                {previewing ? <Loader2 size={14} className="animate-spin" /> : <SlidersHorizontal size={14} />}
                Preview queue
              </Button>
              <Button className="gap-2" onClick={runAiNow} disabled={runningAi}>
                {runningAi ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                Run AI batch
              </Button>
            </div>

            <div className="mt-5 rounded-md border border-border bg-background/40">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div className="text-sm font-medium text-foreground">Next AI call queue</div>
                <div className="text-xs text-muted-foreground">{preview.length} shown</div>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {preview.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">No preview loaded</div>
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
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <Mail size={17} className="text-primary" />
                <h2 className="font-semibold text-foreground">Gmail automation</h2>
                <Badge variant={settings.gmailEnabled ? 'default' : 'outline'}>{settings.gmailEnabled ? 'Enabled' : 'Paused'}</Badge>
              </div>
              <Switch checked={settings.gmailEnabled} onCheckedChange={checked => update('gmailEnabled', checked)} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Emails/day">
                <Input type="number" min="1" max="500" value={settings.gmailDaily} onChange={event => update('gmailDaily', event.target.value)} />
              </Field>
              <div className="rounded-md border border-border bg-background/40 px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck size={13} />
                  Gmail lock
                </div>
                <div className="mt-1 text-sm font-medium text-foreground">{stats.emailEligible} eligible leads</div>
              </div>
            </div>

            <div className="mt-3 space-y-3">
              <Field label="Subject">
                <Input value={settings.gmailSubject} onChange={event => update('gmailSubject', event.target.value)} />
              </Field>
              <Field label="Body">
                <Textarea
                  value={settings.gmailBody}
                  onChange={event => update('gmailBody', event.target.value)}
                  className="min-h-72 font-mono text-sm"
                />
              </Field>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" className="gap-2" onClick={() => save()} disabled={saving}>
                <Save size={14} />
                Save Gmail
              </Button>
              <Button className="gap-2" onClick={runGmailNow} disabled={runningGmail}>
                {runningGmail ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                Run Gmail batch
              </Button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <StatusTile icon={<Clock size={15} />} label="Daily window" value={`${settings.aiStartHour}:00-${settings.aiEndHour}:00`} />
              <StatusTile icon={<ShieldCheck size={15} />} label="Safety" value="Opt-out + dedupe locks" />
            </div>
          </section>
        </div>
      </div>
    </AppLayout>
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
