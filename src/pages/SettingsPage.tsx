import React, { useState, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getSetting, setSetting, updateLead, determineSection } from '@/lib/supabase';
import { Settings, Save, Download, Check, AlertTriangle, Megaphone, Search, Mail, Zap, Sliders, Trash2 } from 'lucide-react';
import { setScoringWeights, calculateScore, generateWhyGoodLead } from '@/lib/leadScoring';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Lead } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import InfoTip from '@/components/InfoTip';
import { useCRM } from '@/context/CRMContext';

export default function SettingsPage() {
  const { refreshCounts } = useCRM();
  const { user } = useAuth();
  const [gmailRule, setGmailRule] = React.useState('gmail');
  const [saved, setSaved] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  // Bulk email scrape state
  const [scraping, setScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState({ done: 0, total: 0, found: 0 });
  const scrapeStopRef = useRef(false);

  const handleBulkScrapeEmails = async () => {
    scrapeStopRef.current = false;
    setScraping(true);
    setScrapeProgress({ done: 0, total: 0, found: 0 });

    try {
      // Fetch all leads with website but no email
      const allLeads: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('leads')
          .select('id, website, phone, section')
          .not('website', 'is', null)
          .neq('website', '')
          .or('email.is.null,email.eq.')
          .range(from, from + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allLeads.push(...data);
        if (data.length < 1000) break;
        from += 1000;
      }

      if (allLeads.length === 0) {
        toast.info('No leads need email scraping');
        setScraping(false);
        return;
      }

      setScrapeProgress({ done: 0, total: allLeads.length, found: 0 });
      let totalFound = 0;

      for (let i = 0; i < allLeads.length; i += 5) {
        if (scrapeStopRef.current) break;
        const batch = allLeads.slice(i, i + 5).map((l: any) => ({ leadId: l.id, website: l.website }));

        try {
          const { data } = await supabase.functions.invoke('scrape-emails', { body: { urls: batch } });
          if (data?.success && data.results) {
            for (const r of data.results) {
              if (r.email || (r.emails && r.emails.length > 0)) {
                const email = r.email || r.emails[0];
                const lead = allLeads.find((l: any) => l.id === r.leadId);
                if (lead) {
                  const newSection = determineSection({ phone: lead.phone, email });
                  await updateLead(r.leadId, { email, email_source: r.source || 'homepage', section: newSection });
                  totalFound++;
                }
              }
            }
          }
        } catch (e) {
          console.error('Scrape batch error:', e);
        }

        setScrapeProgress(p => ({ ...p, done: Math.min(i + 5, allLeads.length), found: totalFound }));
      }

      refreshCounts();
      toast.success(`Done! Found emails for ${totalFound} leads out of ${allLeads.length}`);
    } catch (e: any) {
      console.error('Bulk scrape error:', e);
      toast.error('Scrape failed: ' + (e.message || 'Unknown error'));
    } finally {
      setScraping(false);
    }
  };

  // Outreach settings
  const [defaultDailyCap, setDefaultDailyCap] = useState('100');
  const [defaultBatchCap, setDefaultBatchCap] = useState('200');
  const [defaultCooldownDays, setDefaultCooldownDays] = useState('14');
  const [defaultCallAfterHours, setDefaultCallAfterHours] = useState('48');
  const [optOutKeywords, setOptOutKeywords] = useState('STOP, AVSLUTA, SLUTA');
  const [gmailDailyCap, setGmailDailyCap] = useState('200');
  const [gmailSentToday, setGmailSentToday] = useState<number | null>(null);
  const [gmailFromAddress, setGmailFromAddress] = useState('leadmapai.se@gmail.com');

  // Scoring weights (multipliers, default 1.0)
  const [weights, setWeights] = useState({
    niche: 1, reviews: 1, rating: 1, phone: 1, email: 1, afterHours: 1, bookingGap: 1, website: 1,
  });
  const [rescoringWeights, setRescoringWeights] = useState(false);

  // Reset outreach stats
  const [resetting, setResetting] = useState(false);

  // Finder defaults
  const [finderDefaultCity, setFinderDefaultCity] = useState('');
  const [finderDefaultLeadsTarget, setFinderDefaultLeadsTarget] = useState('50');
  const [finderDefaultKeywords, setFinderDefaultKeywords] = useState('');

  // Auto follow-up settings
  const [followupEnabled, setFollowupEnabled] = useState(false);
  const [followupAfterHours, setFollowupAfterHours] = useState('24');
  const [followupTemplate, setFollowupTemplate] = useState('Hej {name}! Såg att du var intresserad — har du hunnit fundera? /Simon');

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
    getSetting('followup_enabled').then(v => { setFollowupEnabled(v === 'true'); });
    getSetting('followup_after_hours').then(v => { if (v) setFollowupAfterHours(v); });
    getSetting('followup_template').then(v => { if (v) setFollowupTemplate(v); });
    getSetting('gmail_daily_cap').then(v => { if (v) setGmailDailyCap(v); });
    getSetting('gmail_from_address').then(v => { if (v) setGmailFromAddress(v); });
    getSetting('scoring_weights').then(v => {
      if (!v) return;
      try { const p = JSON.parse(v); setWeights((w) => ({ ...w, ...p })); } catch {}
    });
    // Count today's sent emails (UTC day)
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
    supabase.from('message_logs')
      .select('id', { count: 'exact', head: true })
      .eq('channel', 'email').eq('direction', 'outbound').eq('status', 'sent')
      .gte('created_at', startOfDay.toISOString())
      .then(({ count }) => setGmailSentToday(count ?? 0));
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
      setSetting('followup_enabled', followupEnabled ? 'true' : 'false'),
      setSetting('followup_after_hours', followupAfterHours),
      setSetting('followup_template', followupTemplate),
      setSetting('gmail_daily_cap', gmailDailyCap),
      setSetting('gmail_from_address', gmailFromAddress),
      setSetting('scoring_weights', JSON.stringify(weights)),
    ]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast.success('Settings saved');
  };

  const saveWeightsAndRescore = async () => {
    setRescoringWeights(true);
    try {
      await setSetting('scoring_weights', JSON.stringify(weights));
      setScoringWeights(weights);
      // Re-rank all leads with new weights
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase.from('leads').select('*').range(from, from + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < 1000) break;
        from += 1000;
      }
      const BATCH = 200;
      for (let i = 0; i < all.length; i += BATCH) {
        const slice = all.slice(i, i + BATCH);
        await Promise.all(slice.map(async (l) => {
          const r = calculateScore(l);
          const why = generateWhyGoodLead(l, r);
          await supabase.from('leads').update({
            potential_score: r.score, lead_tier: r.tier, detected_niche: r.niche,
            estimated_value: r.estimatedValue, website_quality: r.websiteQuality, why_good_lead: why,
          } as any).eq('id', l.id);
        }));
      }
      toast.success(`Re-ranked ${all.length} leads with new weights`);
    } catch (e: any) {
      toast.error(e?.message || 'Re-rank failed');
    } finally { setRescoringWeights(false); }
  };

  const resetOutreachStats = async (mode: 'logs_only' | 'logs_and_leads') => {
    if (!confirm(mode === 'logs_only'
      ? 'Clear ALL outreach message logs? Leads themselves are kept.'
      : 'Clear ALL outreach logs AND reset every lead\'s outreach stage / "emailed" / "needs call" flags? This is irreversible.')) return;
    setResetting(true);
    try {
      // Delete all message logs
      const { error: delErr } = await supabase.from('message_logs').delete().not('id', 'is', null);
      if (delErr) throw delErr;
      // Also clear activities of email/sms type so history feels reset
      await supabase.from('activities').delete().in('type', ['email_sent', 'sms_sent', 'sms_inbound', 'email_received']);

      if (mode === 'logs_and_leads') {
        const { error: updErr } = await supabase.from('leads').update({
          outreach_stage: 'none',
          last_outbound_at: null,
          last_inbound_at: null,
          last_message_status: 'unknown',
          last_message_direction: null,
          last_message_preview: null,
          has_replied: false,
          needs_call: false,
          last_contacted_at: null,
          last_contact_method: null,
        } as any).not('id', 'is', null);
        if (updErr) throw updErr;
      }
      toast.success('Outreach stats reset');
      refreshCounts();
    } catch (e: any) {
      toast.error(e?.message || 'Reset failed');
    } finally { setResetting(false); }
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
              <InfoTip text="Twilio is connected and campaigns will send real SMS messages." />
            </h2>
            <div className="flex items-center gap-2 text-xs text-green mt-2 bg-green/10 border border-green/30 rounded-md p-3">
              <Check size={14} />
              <div>
                <p className="font-medium">Twilio connected</p>
                <p className="text-muted-foreground mt-0.5">Campaigns send real SMS via Twilio (+46731727192)</p>
              </div>
            </div>
          </div>

          {/* Bulk Email Scrape */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="font-semibold text-foreground mb-1 flex items-center gap-2">
              <Mail size={15} /> Bulk Email Scrape
              <InfoTip text="Scrape websites of all your CRM leads to find email addresses. Only processes leads that have a website but no email yet." />
            </h2>
            <p className="text-xs text-muted-foreground mb-3">Scan all lead websites for contact emails. Processes in batches of 5.</p>
            {scraping && (
              <div className="mb-3">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{scrapeProgress.done} / {scrapeProgress.total} checked</span>
                  <span>{scrapeProgress.found} emails found</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${scrapeProgress.total ? (scrapeProgress.done / scrapeProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant={scraping ? 'destructive' : 'outline'}
                onClick={() => {
                  if (scraping) { scrapeStopRef.current = true; }
                  else { handleBulkScrapeEmails(); }
                }}
                className="gap-2 h-8 text-sm"
              >
                <Mail size={13} />
                {scraping ? 'Stop Scraping' : 'Scrape All Leads'}
              </Button>
            </div>
          </div>

          {/* Gmail Sending Limit */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="font-semibold text-foreground mb-1 flex items-center gap-2">
              <Mail size={15} /> Gmail Daily Limit
              <InfoTip text="Hard cap on outbound emails sent per UTC day from the connected Gmail account. Once reached, further sends are skipped until midnight UTC." />
            </h2>
            <p className="text-xs text-muted-foreground mb-3">
              Sent today: <span className="font-medium text-foreground">{gmailSentToday ?? '…'}</span>
              {gmailSentToday !== null && ` / ${gmailDailyCap}`}
            </p>
            <div className="flex gap-2 items-end">
              <div className="flex-1 max-w-[160px]">
                <label className="text-xs text-muted-foreground mb-1 block">Max emails per day</label>
                <Input type="number" min="0" value={gmailDailyCap} onChange={e => setGmailDailyCap(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
          </div>

          {/* Gmail Sender Address */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="font-semibold text-foreground mb-1 flex items-center gap-2">
              <Mail size={15} /> Gmail Sender Address
              <InfoTip text="The 'From:' header on outbound emails. Note: Gmail will only allow sending from this address if it is configured as a 'Send As' alias on the connected Gmail account. Otherwise Gmail silently uses the connected account's primary address." />
            </h2>
            <p className="text-xs text-muted-foreground mb-3">
              The address that appears as the sender. Must be configured as a 'Send As' alias on the connected Gmail account.
            </p>
            <Input value={gmailFromAddress} onChange={(e) => setGmailFromAddress(e.target.value)} placeholder="leadmapai.se@gmail.com" className="h-8 text-sm max-w-sm" />
          </div>

          {/* Scoring Weights */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="font-semibold text-foreground mb-1 flex items-center gap-2">
              <Sliders size={15} /> Scoring Weights
              <InfoTip text="Multipliers applied to each scoring category. 1.0 = default. Increase a slider to make that signal matter more for the final score and tier." />
            </h2>
            <p className="text-xs text-muted-foreground mb-3">
              Adjust how much each signal matters. Click "Save & re-rank" to recompute every lead immediately.
            </p>
            <div className="space-y-3">
              {([
                ['niche', 'Niche value'],
                ['reviews', 'Review count'],
                ['rating', 'Rating'],
                ['phone', 'Phone presence'],
                ['email', 'Email presence'],
                ['afterHours', 'After-hours / emergency'],
                ['bookingGap', 'Booking / receptionist gap'],
                ['website', 'Website quality'],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono font-medium text-foreground">{weights[key].toFixed(1)}x</span>
                  </div>
                  <Slider
                    value={[weights[key]]}
                    onValueChange={([v]) => setWeights((w) => ({ ...w, [key]: v }))}
                    min={0} max={3} step={0.1}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={saveWeightsAndRescore} disabled={rescoringWeights} className="h-8 text-sm gap-2">
                {rescoringWeights ? <AlertTriangle size={13} className="animate-pulse" /> : <Save size={13} />}
                {rescoringWeights ? 'Re-ranking…' : 'Save & re-rank all leads'}
              </Button>
              <Button variant="ghost" onClick={() => setWeights({ niche: 1, reviews: 1, rating: 1, phone: 1, email: 1, afterHours: 1, bookingGap: 1, website: 1 })} className="h-8 text-sm">
                Reset to defaults
              </Button>
            </div>
          </div>

          {/* Reset Outreach Stats */}
          <div className="bg-card border border-destructive/30 rounded-lg p-5">
            <h2 className="font-semibold text-foreground mb-1 flex items-center gap-2">
              <Trash2 size={15} className="text-destructive" /> Reset Outreach Stats
              <InfoTip text="Use this when transitioning from one business (e.g. Nomia) to another (e.g. Leadline AI) to start outreach tracking from zero. Leads themselves are always kept." />
            </h2>
            <p className="text-xs text-muted-foreground mb-3">
              Clears outreach history so dashboard counts and "Emailed" / follow-up flags start fresh. Leads themselves stay in your CRM.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={resetting} onClick={() => resetOutreachStats('logs_only')} className="h-8 text-sm gap-2">
                <Trash2 size={13} /> Clear message logs only
              </Button>
              <Button variant="destructive" size="sm" disabled={resetting} onClick={() => resetOutreachStats('logs_and_leads')} className="h-8 text-sm gap-2">
                <Trash2 size={13} /> Full reset (logs + lead flags)
              </Button>
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

          {/* Auto Follow-Up */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="font-semibold text-foreground mb-1 flex items-center gap-2">
              <Zap size={15} /> Auto Follow-Up (Interested Leads)
              <InfoTip text="Automatically sends a nudge SMS to interested leads who haven't replied within the configured time. Runs every 30 minutes, max 20 per run." />
            </h2>
            <div className="flex items-center gap-3 mt-3">
              <Switch checked={followupEnabled} onCheckedChange={setFollowupEnabled} />
              <span className="text-sm text-muted-foreground">{followupEnabled ? 'Enabled' : 'Disabled'}</span>
            </div>
            {followupEnabled && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Send nudge after (hours)</label>
                  <Input value={followupAfterHours} onChange={e => setFollowupAfterHours(e.target.value)} className="h-8 text-sm w-32" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Nudge template <span className="text-muted-foreground/60">({'{name}'} = first name)</span></label>
                  <Textarea value={followupTemplate} onChange={e => setFollowupTemplate(e.target.value)} className="h-20 text-sm resize-none" />
                </div>
              </div>
            )}
          </div>

          {/* Triage info */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="font-semibold text-foreground mb-1">Triage Rules</h2>
            <p className="text-xs text-muted-foreground">Leads are auto-sorted into sections: Has Phone, Has Email, Both, or Missing — based on available contact info.</p>
          </div>

          {/* Save button */}
          <Button onClick={handleSave} className="gap-2 h-8 text-sm">
            {saved ? <Check size={13} /> : <Save size={13} />}
            {saved ? 'Saved!' : 'Save All Settings'}
          </Button>

          {/* Finder Defaults */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="font-semibold text-foreground mb-1 flex items-center gap-2">
              <Search size={15} /> Finder Defaults
              <InfoTip text="Default values used when opening the Business Finder. These are also saved automatically when you run a search." />
            </h2>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Default City</label>
                <Input value={finderDefaultCity} onChange={e => setFinderDefaultCity(e.target.value)} placeholder="e.g. Göteborg" className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Leads Target/Run</label>
                <Input value={finderDefaultLeadsTarget} onChange={e => setFinderDefaultLeadsTarget(e.target.value)} placeholder="50" className="h-8 text-sm" />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-xs text-muted-foreground mb-1 block">Default Keywords (one per line)</label>
              <Textarea value={finderDefaultKeywords} onChange={e => setFinderDefaultKeywords(e.target.value)} placeholder="frisör&#10;bilverkstad" className="h-20 text-sm font-mono resize-none" />
            </div>
          </div>

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
