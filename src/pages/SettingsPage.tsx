import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSetting, setSetting } from '@/lib/supabase';
import { Settings, Save, Download, Check, AlertTriangle, Megaphone, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Lead } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import InfoTip from '@/components/InfoTip';

export default function SettingsPage() {
  const { user } = useAuth();
  const [gmailRule, setGmailRule] = React.useState('gmail');
  const [saved, setSaved] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  // Outreach settings
  const [defaultDailyCap, setDefaultDailyCap] = useState('100');
  const [defaultBatchCap, setDefaultBatchCap] = useState('200');
  const [defaultCooldownDays, setDefaultCooldownDays] = useState('14');
  const [defaultCallAfterHours, setDefaultCallAfterHours] = useState('48');
  const [optOutKeywords, setOptOutKeywords] = useState('STOP, AVSLUTA, SLUTA');

  // Finder defaults
  const [finderDefaultCity, setFinderDefaultCity] = useState('');
  const [finderDefaultLeadsTarget, setFinderDefaultLeadsTarget] = useState('50');
  const [finderDefaultKeywords, setFinderDefaultKeywords] = useState('');

  React.useEffect(() => {
    getSetting('gmail_triage_rule').then(v => { if (v) setGmailRule(v); });
    getSetting('default_daily_cap').then(v => { if (v) setDefaultDailyCap(v); });
    getSetting('default_batch_cap').then(v => { if (v) setDefaultBatchCap(v); });
    getSetting('default_cooldown_days').then(v => { if (v) setDefaultCooldownDays(v); });
    getSetting('default_call_after_hours').then(v => { if (v) setDefaultCallAfterHours(v); });
    getSetting('opt_out_keywords').then(v => { if (v) setOptOutKeywords(v); });
    getSetting('finder_default_city').then(v => { if (v) setFinderDefaultCity(v); });
    getSetting('finder_default_leads_target').then(v => { if (v) setFinderDefaultLeadsTarget(v); });
    getSetting('finder_default_keywords').then(v => { if (v) setFinderDefaultKeywords(v); });
  }, []);

  const handleSave = async () => {
    await Promise.all([
      setSetting('gmail_triage_rule', gmailRule),
      setSetting('default_daily_cap', defaultDailyCap),
      setSetting('default_batch_cap', defaultBatchCap),
      setSetting('default_cooldown_days', defaultCooldownDays),
      setSetting('default_call_after_hours', defaultCallAfterHours),
      setSetting('opt_out_keywords', optOutKeywords),
      setSetting('finder_default_city', finderDefaultCity),
      setSetting('finder_default_leads_target', finderDefaultLeadsTarget),
      setSetting('finder_default_keywords', finderDefaultKeywords),
    ]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast.success('Settings saved');
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
      if (!data) return;

      const leads = data as Lead[];
      const headers = ['name', 'category', 'phone', 'email', 'address', 'website', 'rating', 'reviews_count', 'section', 'status', 'outreach_stage', 'has_replied', 'needs_call', 'notes', 'tags', 'maps_url', 'created_at'];
      const rows = leads.map(l => headers.map(h => {
        const val = (l as any)[h];
        if (Array.isArray(val)) return `"${val.join(', ')}"`;
        if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
        return val ?? '';
      }).join(','));

      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `leadmap-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      toast.success(`Exported ${leads.length} leads`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-6 pt-10 pb-10">
        <div className="mb-8 flex items-center gap-2">
          <Settings size={20} className="text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        </div>

        <div className="space-y-6">
          {/* Account */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="font-semibold text-foreground mb-1">Account</h2>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>

          {/* Twilio / Provider Status */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="font-semibold text-foreground mb-1 flex items-center gap-2">
              <Megaphone size={15} /> SMS Provider
              <InfoTip text="Connect Twilio to send real SMS. Without it, the app uses a mock provider that simulates sending." />
            </h2>
            <div className="flex items-center gap-2 text-xs text-amber mt-2 bg-amber/10 border border-amber/30 rounded-md p-3">
              <AlertTriangle size={14} />
              <div>
                <p className="font-medium">Twilio not connected</p>
                <p className="text-muted-foreground mt-0.5">Campaigns use mock provider. To connect Twilio, add these secrets in your Lovable Cloud settings: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER</p>
              </div>
            </div>
          </div>

          {/* Outreach Defaults */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="font-semibold text-foreground mb-1 flex items-center gap-2">
              Outreach Defaults
              <InfoTip text="Default values used when creating new campaigns" />
            </h2>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Daily Cap</label>
                <Input value={defaultDailyCap} onChange={e => setDefaultDailyCap(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Batch Cap</label>
                <Input value={defaultBatchCap} onChange={e => setDefaultBatchCap(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Cooldown Days</label>
                <Input value={defaultCooldownDays} onChange={e => setDefaultCooldownDays(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Call After Hours</label>
                <Input value={defaultCallAfterHours} onChange={e => setDefaultCallAfterHours(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-xs text-muted-foreground mb-1 block">Opt-out Keywords <InfoTip text="Comma-separated words that trigger automatic opt-out when received" /></label>
              <Input value={optOutKeywords} onChange={e => setOptOutKeywords(e.target.value)} className="h-8 text-sm" placeholder="STOP, AVSLUTA, SLUTA" />
            </div>
          </div>

          {/* Triage Rules */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="font-semibold text-foreground mb-1">Triage Rules</h2>
            <p className="text-xs text-muted-foreground mb-4">When a lead has both a phone number and Gmail, which section should it go to?</p>

            <div className="space-y-2">
              {[
                { value: 'gmail', label: 'Gmail section', desc: 'Prioritize Gmail for outreach' },
                { value: 'both', label: 'Both section', desc: 'Place in "Has Both" section' },
                { value: 'phone', label: 'Phone section', desc: 'Prioritize calling' },
              ].map(opt => (
                <label key={opt.value} className="flex items-start gap-3 cursor-pointer p-3 rounded-md hover:bg-muted/50 transition-colors border border-transparent hover:border-border">
                  <input type="radio" name="gmailRule" value={opt.value} checked={gmailRule === opt.value} onChange={() => setGmailRule(opt.value)} className="mt-0.5 accent-primary" />
                  <div>
                    <div className="text-sm font-medium text-foreground">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Save button */}
          <Button onClick={handleSave} className="gap-2 h-8 text-sm">
            {saved ? <Check size={13} /> : <Save size={13} />}
            {saved ? 'Saved!' : 'Save All Settings'}
          </Button>

          {/* Google Places API */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="font-semibold text-foreground mb-1">Google Places API</h2>
            <p className="text-xs text-muted-foreground mb-3">Your Places API key is stored securely in the backend environment.</p>
            <div className="flex items-center gap-2 text-xs text-green">
              <Check size={12} /> API key configured
            </div>
          </div>

          {/* Export */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="font-semibold text-foreground mb-1">Export Data</h2>
            <p className="text-xs text-muted-foreground mb-3">Download all your leads as a CSV file.</p>
            <Button variant="outline" onClick={handleExport} disabled={exporting} className="gap-2 h-8 text-sm">
              <Download size={13} />
              {exporting ? 'Exporting...' : 'Export CSV'}
            </Button>
          </div>

          {/* Keyboard shortcuts */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="font-semibold text-foreground mb-3">Keyboard Shortcuts</h2>
            <div className="space-y-2">
              {[
                { key: '/', action: 'Focus search' },
                { key: 'N', action: 'Go to Add Lead' },
              ].map(s => (
                <div key={s.key} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{s.action}</span>
                  <kbd className="bg-muted border border-border px-2 py-0.5 rounded text-xs font-mono">{s.key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
