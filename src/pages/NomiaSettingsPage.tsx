import { useEffect, useState } from 'react';
import { LockKeyhole, Mail, PhoneCall, Save, ShieldCheck } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { getSetting, setSetting } from '@/lib/supabase';
import { toast } from 'sonner';

type SafetyState = { masterPaused: boolean; gmailPaused: boolean; aiPaused: boolean; smsPaused: boolean; partnerPaused: boolean; emailCap: number; aiCap: number };
const DEFAULTS: SafetyState = { masterPaused: true, gmailPaused: true, aiPaused: true, smsPaused: true, partnerPaused: true, emailCap: 10, aiCap: 5 };

export default function NomiaSettingsPage() {
  const [state, setState] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);
  useEffect(() => { Promise.all([getSetting('outreach_master_paused'), getSetting('nomia_gmail_paused'), getSetting('nomia_ai_calls_paused'), getSetting('nomia_sms_paused'), getSetting('partner_outreach_paused'), getSetting('nomia_gmail_batch_cap'), getSetting('nomia_ai_call_batch_cap')]).then(([master, gmail, ai, sms, partner, emailCap, aiCap]) => setState({ masterPaused: master !== 'false', gmailPaused: gmail !== 'false', aiPaused: ai !== 'false', smsPaused: sms !== 'false', partnerPaused: partner !== 'false', emailCap: Number(emailCap) || 10, aiCap: Number(aiCap) || 5 })); }, []);
  const toggle = (key: keyof SafetyState, next: boolean) => {
    if (typeof state[key] !== 'boolean') return;
    if (next === false && !window.confirm('This enables a real outreach channel. Backend locks still apply. Continue?')) return;
    setState(prev => ({ ...prev, [key]: next }));
  };
  const save = async () => {
    if ((state.emailCap > 10 || state.aiCap > 5) && !window.confirm('These limits exceed the safe launch defaults. Save the higher limits?')) return;
    setSaving(true);
    try {
      await Promise.all([
        setSetting('outreach_master_paused', String(state.masterPaused)), setSetting('nomia_gmail_paused', String(state.gmailPaused)), setSetting('nomia_ai_calls_paused', String(state.aiPaused)), setSetting('nomia_sms_paused', String(state.smsPaused)), setSetting('partner_outreach_paused', String(state.partnerPaused)), setSetting('nomia_gmail_batch_cap', String(Math.max(1, Math.min(50, state.emailCap)))), setSetting('nomia_ai_call_batch_cap', String(Math.max(1, Math.min(20, state.aiCap)))),
      ]);
      toast.success('Nomia safety settings saved');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save settings'); }
    finally { setSaving(false); }
  };
  return <AppLayout><div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6"><header className="border-b border-border pb-5"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Nomia</div><h1 className="mt-1 text-2xl font-semibold">Workspace safety</h1><p className="mt-1 text-sm text-muted-foreground">Outreach is paused by default. Settings persist in the database, not only this browser.</p></header><div className="mt-5 space-y-4"><section className={`border p-5 ${state.masterPaused ? 'border-amber-400/30 bg-amber-400/5' : 'border-red-400/30 bg-red-400/5'}`}><div className="flex items-center justify-between gap-4"><div className="flex items-start gap-3"><LockKeyhole size={19} className={state.masterPaused ? 'text-amber-300' : 'text-red-300'} /><div><h2 className="text-sm font-semibold">Master outreach pause</h2><p className="mt-1 text-xs text-muted-foreground">Blocks manual calls, Gmail, AI calls and SMS before provider contact.</p></div></div><Switch checked={state.masterPaused} onCheckedChange={next => toggle('masterPaused', next)} /></div></section><section className="border border-border bg-card"><div className="border-b border-border p-4"><h2 className="text-sm font-semibold">Channel pauses</h2></div>{[
        { key: 'gmailPaused' as const, label: 'Gmail', detail: 'Reviewed batches and manual email replies', icon: Mail },
        { key: 'aiPaused' as const, label: 'Retell AI calls', detail: 'Optional approved AI call reviews', icon: PhoneCall },
        { key: 'smsPaused' as const, label: 'Legacy SMS', detail: 'History remains visible; new sends stay secondary', icon: ShieldCheck },
        { key: 'partnerPaused' as const, label: 'Partner outreach', detail: 'Separate partner Gmail automation', icon: ShieldCheck },
      ].map(item => <div key={item.key} className="flex items-center justify-between gap-4 border-b border-border px-4 py-4 last:border-0"><div className="flex items-start gap-3"><item.icon size={17} className="mt-0.5 text-muted-foreground" /><div><div className="text-sm font-medium">{item.label}</div><div className="text-xs text-muted-foreground">{item.detail}</div></div></div><Switch checked={state[item.key]} onCheckedChange={next => toggle(item.key, next)} /></div>)}</section><section className="border border-border bg-card p-5"><h2 className="text-sm font-semibold">Approval limits</h2><p className="mt-1 text-xs text-muted-foreground">Sweden is the only enabled launch market. UK and Spain remain inactive.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-xs text-muted-foreground">Gmail recipients per batch<Input type="number" min={1} max={50} value={state.emailCap} onChange={e => setState(prev => ({ ...prev, emailCap: Number(e.target.value) }))} className="mt-1" /></label><label className="text-xs text-muted-foreground">AI calls per review<Input type="number" min={1} max={20} value={state.aiCap} onChange={e => setState(prev => ({ ...prev, aiCap: Number(e.target.value) }))} className="mt-1" /></label></div></section><Button onClick={save} disabled={saving} className="gap-2"><Save size={14} /> {saving ? 'Saving...' : 'Save safety settings'}</Button></div></div></AppLayout>;
}
