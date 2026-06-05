import React, { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { getSetting, setSetting } from '@/lib/supabase';
import { Loader2, Mail, Play, Save, Send, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const STORAGE_KEY = 'leadmap.gmailAutoSendDraft';

interface Draft {
  enabled: boolean;
  subject: string;
  body: string;
  senderName: string;
  dailyLimit: string;
  delaySeconds: string;
  testEmail: string;
}

const DEFAULT_DRAFT: Draft = {
  enabled: false,
  subject: 'En snabb fråga om era inkommande samtal',
  body: 'Hej {name}!\n\nVi bygger en AI-receptionist som svarar i telefon dygnet runt så ni inte missar några samtal från nya kunder.\n\nVill du höra hur det fungerar? Tar 5 minuter.\n\n/Maged',
  senderName: 'Maged',
  dailyLimit: '100',
  delaySeconds: '90',
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
      const [
        enabled,
        daily,
        subject,
        body,
        senderName,
      ] = await Promise.all([
        getSetting('gmail_autosend_enabled'),
        getSetting('gmail_autosend_daily'),
        getSetting('gmail_autosend_subject'),
        getSetting('gmail_autosend_body'),
        getSetting('gmail_sender_name'),
      ]);
      setDraft({
        ...DEFAULT_DRAFT,
        ...localDraft,
        enabled: enabled ? enabled === 'true' : localDraft.enabled ?? DEFAULT_DRAFT.enabled,
        dailyLimit: daily || localDraft.dailyLimit || DEFAULT_DRAFT.dailyLimit,
        subject: subject || localDraft.subject || DEFAULT_DRAFT.subject,
        body: body || localDraft.body || DEFAULT_DRAFT.body,
        senderName: senderName || localDraft.senderName || DEFAULT_DRAFT.senderName,
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

  const variables = useMemo(() => ['name', 'business_name', 'city', 'niche', 'owner_name'], []);

  const persistDraft = async (next: Draft) => {
    await Promise.all([
      setSetting('gmail_autosend_enabled', next.enabled ? 'true' : 'false'),
      setSetting('gmail_autosend_daily', next.dailyLimit),
      setSetting('gmail_daily_cap', next.dailyLimit),
      setSetting('gmail_autosend_subject', next.subject),
      setSetting('gmail_autosend_body', next.body),
      setSetting('gmail_sender_name', next.senderName),
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
      .split('{{city}}').join('Goteborg')
      .split('{{niche}}').join('service')
      .split('{{owner_name}}').join('there');
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
            <p className="text-sm text-muted-foreground mt-1">Gmail auto-send configuration, saved as you type.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck size={14} />
            {saved ? 'Saved' : 'Saving draft...'}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_300px] gap-5">
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
                <Input type="number" value={draft.dailyLimit} onChange={e => update('dailyLimit', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Delay between emails</Label>
                <Input type="number" value={draft.delaySeconds} onChange={e => update('delaySeconds', e.target.value)} className="mt-1" />
              </div>
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
                {sentToday ?? '...'} / {draft.dailyLimit || '0'}
              </div>
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              This page controls the real Gmail auto-send settings. Sending is blocked for leads already contacted by email, and drafts persist after refresh.
            </div>
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}
