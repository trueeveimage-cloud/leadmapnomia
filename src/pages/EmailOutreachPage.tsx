import React, { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { getSetting, setSetting } from '@/lib/supabase';
import { AlertTriangle, Loader2, Mail, Play, Save, Send, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { LEADMAP_EMAIL_BODY_SV, LEADMAP_EMAIL_SUBJECT_SV } from '@/lib/leadmapEmailTemplates';
import { gmailTargetForToday, TUESDAY_GMAIL_DAILY_TARGET } from '@/lib/outreachEligibility';

const STORAGE_KEY = 'leadmap.gmailAutoSendDraft';

interface Draft {
  enabled: boolean;
  subject: string;
  body: string;
  senderName: string;
  dailyLimit: string;
  delaySeconds: string;
  batchSize: string;
  suppressionList: string;
  testEmail: string;
}

const DEFAULT_DRAFT: Draft = {
  enabled: false,
  subject: LEADMAP_EMAIL_SUBJECT_SV,
  body: LEADMAP_EMAIL_BODY_SV,
  senderName: 'Maged',
  dailyLimit: '120',
  delaySeconds: '120',
  batchSize: '10',
  suppressionList: '',
  testEmail: '',
};

export default function EmailOutreachPage() {
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [sentToday, setSentToday] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      const local = localStorage.getItem(STORAGE_KEY);
      const localDraft = local ? JSON.parse(local) : {};
      const [enabled, daily, subject, body, senderName, delaySeconds, batchSize, suppressionList] = await Promise.all([
        getSetting('gmail_autosend_enabled'),
        getSetting('gmail_autosend_daily'),
        getSetting('gmail_autosend_subject'),
        getSetting('gmail_autosend_body'),
        getSetting('gmail_sender_name'),
        getSetting('gmail_autosend_delay_seconds'),
        getSetting('gmail_autosend_batch_size'),
        getSetting('email_suppression_list'),
      ]);
      setDraft({
        ...DEFAULT_DRAFT,
        ...localDraft,
        enabled: enabled ? enabled === 'true' : localDraft.enabled ?? DEFAULT_DRAFT.enabled,
        dailyLimit: daily || localDraft.dailyLimit || DEFAULT_DRAFT.dailyLimit,
        subject: subject || localDraft.subject || DEFAULT_DRAFT.subject,
        body: body || localDraft.body || DEFAULT_DRAFT.body,
        senderName: senderName || localDraft.senderName || DEFAULT_DRAFT.senderName,
        delaySeconds: delaySeconds || localDraft.delaySeconds || DEFAULT_DRAFT.delaySeconds,
        batchSize: batchSize || localDraft.batchSize || DEFAULT_DRAFT.batchSize,
        suppressionList: suppressionList || localDraft.suppressionList || DEFAULT_DRAFT.suppressionList,
      });
    };
    load().catch(() => {});

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    supabase
      .from('message_logs')
      .select('id', { count: 'exact', head: true })
      .eq('channel', 'email')
      .eq('direction', 'outbound')
      .eq('status', 'sent')
      .gte('created_at', startOfDay.toISOString())
      .then(({ count }) => setSentToday(count ?? 0));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    setSaved(false);
    const timer = setTimeout(async () => {
      await persistDraft(draft);
      setSaved(true);
    }, 700);
    return () => clearTimeout(timer);
  }, [draft]);

  const variables = useMemo(() => ['business_name', 'owner_name', 'city', 'niche', 'name'], []);
  const dailyLimitNumber = Number(draft.dailyLimit) || 0;
  const delayNumber = Number(draft.delaySeconds) || 0;
  const batchSizeNumber = Number(draft.batchSize) || 0;
  const todayTarget = gmailTargetForToday(dailyLimitNumber);
  const needsSafetyAttention = dailyLimitNumber > TUESDAY_GMAIL_DAILY_TARGET || delayNumber < 60 || batchSizeNumber > 20;

  const persistDraft = async (next: Draft) => {
    await Promise.all([
      setSetting('gmail_autosend_enabled', next.enabled ? 'true' : 'false'),
      setSetting('gmail_autosend_daily', next.dailyLimit),
      setSetting('gmail_daily_cap', next.dailyLimit),
      setSetting('gmail_autosend_subject', next.subject),
      setSetting('gmail_autosend_body', next.body),
      setSetting('gmail_sender_name', next.senderName),
      setSetting('gmail_autosend_delay_seconds', next.delaySeconds),
      setSetting('gmail_autosend_batch_size', next.batchSize),
      setSetting('email_suppression_list', next.suppressionList),
      setSetting('leadmap_gmail_auto_send', JSON.stringify(next)),
    ]);
  };

  const update = (key: keyof Draft, value: string | boolean) => setDraft(prev => ({ ...prev, [key]: value }));

  const saveNow = async () => {
    setSaving(true);
    await persistDraft(draft);
    setSaved(true);
    setSaving(false);
    toast.success('Saved');
  };

  const runNow = async () => {
    setRunning(true);
    try {
      await persistDraft({ ...draft, enabled: true });
      await setSetting('gmail_autosend_force', 'true');
      const { data, error } = await supabase.functions.invoke('auto-send-gmail-daily', { body: {} });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Run failed');
      toast.success(`Auto send finished: ${data?.sent ?? 0} sent, ${data?.skipped ?? 0} skipped`);
      if (typeof data?.sentToday === 'number') setSentToday(data.sentToday);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Auto send failed');
    } finally {
      setRunning(false);
    }
  };

  const sendTest = async () => {
    if (!draft.testEmail) {
      toast.error('Add a test email first');
      return;
    }
    const body = draft.body
      .split('{{business_name}}').join('Demo Business')
      .split('{{city}}').join('Gothenburg')
      .split('{{niche}}').join('service')
      .split('{{owner_name}}').join('there')
      .split('{{name}}').join('Demo Business');
    const { data, error } = await supabase.functions.invoke('send-gmail', {
      body: { to: draft.testEmail, subject: draft.subject.split('{{business_name}}').join('Demo Business'), body },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Test failed');
      return;
    }
    toast.success('Test email sent');
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto w-full px-5 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Leadmap AI</div>
            <h1 className="text-2xl font-semibold text-foreground mt-1">Gmail Auto Send</h1>
            <p className="text-sm text-muted-foreground mt-1">Safer Gmail automation with caps, delays, validation and suppression controls.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck size={14} />
            {saved ? 'Saved' : 'Saving draft...'}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-5">
          <section className="border border-border bg-card rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background/40 p-4">
              <div>
                <div className="text-sm font-medium text-foreground">Auto send</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {draft.enabled ? 'Enabled for business-day sending' : 'Paused. Drafts are still saved.'}
                </div>
              </div>
              <Switch checked={draft.enabled} onCheckedChange={checked => update('enabled', checked)} />
            </div>

            <div>
              <Label>Subject</Label>
              <Input value={draft.subject} onChange={e => update('subject', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Email body</Label>
              <Textarea value={draft.body} onChange={e => update('body', e.target.value)} className="mt-1 min-h-72 font-mono text-sm" />
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <Label>Sender name</Label>
                <Input value={draft.senderName} onChange={e => update('senderName', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Daily limit</Label>
                <Input type="number" min={1} max={500} value={draft.dailyLimit} onChange={e => update('dailyLimit', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Delay seconds</Label>
                <Input type="number" min={60} max={900} value={draft.delaySeconds} onChange={e => update('delaySeconds', e.target.value)} className="mt-1" />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Batch size per run</Label>
                <Input type="number" min={1} max={20} value={draft.batchSize} onChange={e => update('batchSize', e.target.value)} className="mt-1" />
              </div>
              <div className="rounded-lg border border-border bg-background/40 p-3 text-xs leading-relaxed text-muted-foreground">
                <div className="font-medium text-foreground">Recommended</div>
                The automation target is 120/day on normal weekdays and 240 on Tuesday catch-up. Keep 120+ seconds between emails and a batch size of 10 while warming up the sender.
              </div>
            </div>

            {needsSafetyAttention && (
              <div className="rounded-lg border border-amber/30 bg-amber/10 p-3 text-xs text-muted-foreground flex gap-2">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber" />
                <span>These settings are aggressive. Keep the normal daily limit at 120 or lower, use at least 60 seconds between emails, and keep batches small to protect sender reputation.</span>
              </div>
            )}

            <div>
              <Label>Suppression list</Label>
              <Textarea
                value={draft.suppressionList}
                onChange={e => update('suppressionList', e.target.value)}
                placeholder="one email or domain per line"
                className="mt-1 min-h-24 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">Emails and domains here are blocked before sending. Example: blocked@example.com or example.com.</p>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={saveNow} disabled={saving} className="gap-2"><Save size={14} /> Save</Button>
              <Button onClick={runNow} disabled={running} variant="secondary" className="gap-2">
                {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {running ? 'Running...' : 'Run now'}
              </Button>
              <Button onClick={sendTest} variant="outline" className="gap-2"><Send size={14} /> Test email</Button>
            </div>
          </section>

          <aside className="border border-border bg-card rounded-lg p-4 space-y-5">
            <div>
              <h2 className="text-sm font-medium text-foreground flex items-center gap-2"><Mail size={14} /> Variables</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {variables.map(v => <span key={v} className="text-xs border border-border rounded px-2 py-1 text-muted-foreground">{`{{${v}}}`}</span>)}
              </div>
            </div>
            <div>
              <Label>Test email</Label>
              <Input value={draft.testEmail} onChange={e => update('testEmail', e.target.value)} placeholder="you@example.com" className="mt-1" />
            </div>
            <div className="rounded-lg border border-border bg-background/40 p-3 text-xs">
              <div className="text-muted-foreground">Sent today</div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {sentToday ?? '...'} / {todayTarget || '0'}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background/40 p-3 text-xs text-muted-foreground leading-relaxed space-y-2">
              <div className="font-medium text-foreground flex items-center gap-2"><ShieldCheck size={14} /> Safer sending checklist</div>
              <p>Use a real sender name, include an unsubscribe line, validate emails, avoid duplicates, and never send to opt-outs or unverified/private contacts.</p>
              <p>Set SPF, DKIM and DMARC for the sender domain before scaling. Watch bounces and complaints, then lower limits if deliverability drops.</p>
            </div>
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}
