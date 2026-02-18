import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSetting, setSetting } from '@/lib/supabase';
import { Settings, Save, Download, Upload, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Lead } from '@/lib/supabase';

export default function SettingsPage() {
  const [gmailRule, setGmailRule] = React.useState('gmail');
  const [saved, setSaved] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  React.useEffect(() => {
    getSetting('gmail_triage_rule').then(v => { if (v) setGmailRule(v); });
  }, []);

  const handleSave = async () => {
    await setSetting('gmail_triage_rule', gmailRule);
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
      const headers = ['name', 'category', 'phone', 'email', 'address', 'website', 'rating', 'reviews_count', 'section', 'status', 'notes', 'tags', 'maps_url', 'created_at'];
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
      <div className="max-w-2xl mx-auto px-6 pt-10">
        <div className="mb-8 flex items-center gap-2">
          <Settings size={20} className="text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        </div>

        <div className="space-y-6">
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
                  <input
                    type="radio"
                    name="gmailRule"
                    value={opt.value}
                    checked={gmailRule === opt.value}
                    onChange={() => setGmailRule(opt.value)}
                    className="mt-0.5 accent-primary"
                  />
                  <div>
                    <div className="text-sm font-medium text-foreground">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            <Button onClick={handleSave} className="mt-4 gap-2 h-8 text-sm">
              {saved ? <Check size={13} /> : <Save size={13} />}
              {saved ? 'Saved!' : 'Save Settings'}
            </Button>
          </div>

          {/* Places API */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="font-semibold text-foreground mb-1">Google Places API</h2>
            <p className="text-xs text-muted-foreground mb-3">
              Your Places API key is stored securely in the backend environment. To update it, contact your workspace admin or use the Cloud secrets manager.
            </p>
            <div className="flex items-center gap-2 text-xs text-green-400">
              <Check size={12} />
              API key configured
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
                { key: 'Ctrl+K', action: 'Command palette (coming soon)' },
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
