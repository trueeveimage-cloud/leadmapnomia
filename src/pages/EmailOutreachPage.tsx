import React, { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { getSetting, setSetting } from '@/lib/supabase';
import { Mail, Save, Send, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const STORAGE_KEY = 'nomia.emailOutreachDraft';

interface Draft {
  subject: string;
  body: string;
  senderName: string;
  dailyLimit: string;
  delaySeconds: string;
  testEmail: string;
}

const DEFAULT_DRAFT: Draft = {
  subject: 'Quick idea for {{business_name}}',
  body: 'Hi {{owner_name}},\n\nI noticed {{business_name}} in {{city}} and wanted to share a quick idea for getting more {{niche}} customers.\n\nBest,\nMaged',
  senderName: 'Maged',
  dailyLimit: '50',
  delaySeconds: '90',
  testEmail: '',
};

export default function EmailOutreachPage() {
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      setDraft({ ...DEFAULT_DRAFT, ...JSON.parse(local) });
      return;
    }
    getSetting('nomia_gmail_auto_send').then(value => {
      if (value) setDraft({ ...DEFAULT_DRAFT, ...JSON.parse(value) });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    setSaved(false);
    const timer = setTimeout(async () => {
      await setSetting('nomia_gmail_auto_send', JSON.stringify(draft));
      setSaved(true);
    }, 700);
    return () => clearTimeout(timer);
  }, [draft]);

  const variables = useMemo(() => ['business_name', 'city', 'niche', 'owner_name'], []);

  const update = (key: keyof Draft, value: string) => setDraft(prev => ({ ...prev, [key]: value }));

  const saveNow = async () => {
    setSaving(true);
    await setSetting('nomia_gmail_auto_send', JSON.stringify(draft));
    setSaved(true);
    setSaving(false);
    toast.success('Saved');
  };

  const sendTest = async () => {
    if (!draft.testEmail) {
      toast.error('Add a test email first');
      return;
    }
    const body = draft.body
      .replaceAll('{{business_name}}', 'Demo Business')
      .replaceAll('{{city}}', 'Goteborg')
      .replaceAll('{{niche}}', 'service')
      .replaceAll('{{owner_name}}', 'there');
    const { data, error } = await supabase.functions.invoke('send-gmail', {
      body: { to: draft.testEmail, subject: draft.subject.replaceAll('{{business_name}}', 'Demo Business'), body },
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

        <div className="grid lg:grid-cols-[1fr_280px] gap-5">
          <section className="border border-border bg-card rounded-lg p-5 space-y-4">
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
            <div className="text-xs text-muted-foreground leading-relaxed">
              Sending is blocked for leads already contacted by email. The draft is stored locally and in the settings table so it will not reset when you leave this page.
            </div>
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}
