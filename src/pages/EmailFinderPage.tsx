import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Mail, Loader2, MapPin, Sparkles, Search } from 'lucide-react';
import { createFinderRun, runFinderSearch } from '@/lib/finder';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { createNotification, determineSection, updateLead } from '@/lib/supabase';
import { useCRM } from '@/context/CRMContext';

// Curated niches optimized for Gmail discovery:
// businesses that almost always have a website with a contact email,
// and where AI receptionist is a strong fit.
const EMAIL_FRIENDLY_NICHES = [
  'advokat', 'jurist', 'redovisningsbyrå', 'revisor', 'konsult',
  'tandläkare', 'klinik', 'fysioterapi', 'kiropraktor',
  'mäklare', 'fastighetsbyrå', 'arkitekt', 'ingenjör',
  'marknadsbyrå', 'webbyrå', 'reklambyrå', 'designbyrå',
];

const PRESETS = [
  { label: 'High-end services (lawyers, consultants, agencies)', niches: ['advokat', 'jurist', 'konsult', 'marknadsbyrå', 'webbyrå', 'reklambyrå'] },
  { label: 'Healthcare clinics', niches: ['tandläkare', 'klinik', 'fysioterapi', 'kiropraktor'] },
  { label: 'Real estate & property', niches: ['mäklare', 'fastighetsbyrå', 'arkitekt'] },
  { label: 'Accounting & finance', niches: ['redovisningsbyrå', 'revisor'] },
  { label: 'All email-friendly niches', niches: EMAIL_FRIENDLY_NICHES },
];

export default function EmailFinderPage() {
  const navigate = useNavigate();
  const { refreshCounts } = useCRM();
  const [city, setCity] = useState('Stockholm');
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [targetLeads, setTargetLeads] = useState(50);
  const [running, setRunning] = useState(false);
  const [scrapingExisting, setScrapingExisting] = useState(false);
  const [existingProgress, setExistingProgress] = useState({ done: 0, eligible: 0, found: 0, totalSaved: 0, withWebsite: 0 });

  const start = async () => {
    if (!city.trim()) { toast.error('Enter a city'); return; }
    setRunning(true);
    try {
      const keywords = PRESETS[selectedPreset].niches;
      const run = await createFinderRun({
        city: city.trim(),
        mode: 'niche',
        keywords,
        radius: 4000,
        maxPages: 3,
        maxCandidates: Math.max(targetLeads * 4, 200),
        maxDetails: Math.max(targetLeads * 2, 100),
        minRating: 3.5,
        minReviews: 5,
        requirePhone: false,
        findGmailOnly: true,
        batchLabel: `Email Finder — ${city}`,
      });
      toast.success('Email Finder run started — redirecting…');
      // Kick off the search (fire-and-forget; the run page polls progress)
      runFinderSearch(run.id, {
        city: city.trim(),
        keywords,
        radius: 4000,
        maxPages: 3,
        maxCandidates: Math.max(targetLeads * 4, 200),
        maxDetails: Math.max(targetLeads * 2, 100),
        minRating: 3.5,
        minReviews: 5,
        requirePhone: false,
        findGmailOnly: true,
      }).catch((e) => console.error('finder-search', e));
      navigate(`/finder/runs/${run.id}?autoScrape=1`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to start');
    } finally {
      setRunning(false);
    }
  };

  const scrapeExistingLeads = async () => {
    setScrapingExisting(true);
    setExistingProgress({ done: 0, eligible: 0, found: 0, totalSaved: 0, withWebsite: 0 });

    try {
      const [totalSavedResult, withWebsiteResult, eligibleResult] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }),
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .not('website', 'is', null)
          .neq('website', ''),
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .not('website', 'is', null)
          .neq('website', '')
          .or('email.is.null,email.eq.'),
      ]);

      if (totalSavedResult.error) throw totalSavedResult.error;
      if (withWebsiteResult.error) throw withWebsiteResult.error;
      if (eligibleResult.error) throw eligibleResult.error;

      const totalSaved = totalSavedResult.count ?? 0;
      const withWebsite = withWebsiteResult.count ?? 0;
      const eligible = eligibleResult.count ?? 0;
      setExistingProgress({ done: 0, eligible, found: 0, totalSaved, withWebsite });

      const targets: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('leads')
          .select('id, name, website, phone, email, section, facebook_url, instagram_url')
          .not('website', 'is', null)
          .neq('website', '')
          .or('email.is.null,email.eq.')
          .range(from, from + 999);

        if (error) throw error;
        if (!data?.length) break;
        targets.push(...data);
        if (data.length < 1000) break;
        from += 1000;
      }

      if (targets.length === 0) {
        toast.info('No saved leads need scraping. Leads need a website and an empty email field.');
        return;
      }

      setExistingProgress({ done: 0, eligible: targets.length, found: 0, totalSaved, withWebsite });
      let found = 0;

      for (let i = 0; i < targets.length; i += 4) {
        const batch = targets.slice(i, i + 4).map((lead) => ({
          leadId: lead.id,
          website: lead.website,
          businessName: lead.name,
        }));

        try {
          const { data, error } = await supabase.functions.invoke('scrape-emails', { body: { urls: batch } });
          if (error) throw error;

          if (data?.success && data.results) {
            for (const result of data.results) {
              const email = result.email || result.emails?.[0];
              if (!email) continue;

              const lead = targets.find((item) => item.id === result.leadId);
              if (!lead) continue;

              await updateLead(result.leadId, {
                email,
                email_source: result.source || 'website',
                section: determineSection({ phone: lead.phone, email }),
                facebook_url: result.facebook_url || lead.facebook_url,
                instagram_url: result.instagram_url || lead.instagram_url,
              });
              found++;
            }
          }
        } catch (error) {
          console.error('Existing lead scrape batch failed:', error);
        }

        setExistingProgress({ done: Math.min(i + 4, targets.length), eligible: targets.length, found, totalSaved, withWebsite });
      }

      await refreshCounts();
      await createNotification({
        type: 'email_scrape_done',
        title: 'Email scrape finished',
        message: `Found emails for ${found} of ${targets.length} eligible saved leads.`,
        payload: { found, checked: targets.length, totalSaved, withWebsite },
      });
      toast.success(`Found emails for ${found} of ${targets.length} eligible saved leads`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to scrape saved leads');
    } finally {
      setScrapingExisting(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" /> Email Finder
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded">Gmail-first</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Finds businesses that are likely to have a discoverable email. Auto-scrapes websites for emails after the run completes.
          </p>
        </div>

        <Card className="p-5 space-y-4 border-primary/25 bg-primary/5">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" />
              Scrape emails from saved leads
            </h2>
            <p className="text-sm text-muted-foreground">
              Scans every existing CRM lead that has a website but no email, then saves the best email and social links back to the lead.
            </p>
          </div>

          {scrapingExisting && (
            <div className="rounded-md bg-background/80 border border-border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Scraping saved leads</span>
                <span className="font-medium">
                  {existingProgress.found}/{existingProgress.done} found of {existingProgress.eligible} eligible
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {existingProgress.totalSaved.toLocaleString()} total saved leads · {existingProgress.withWebsite.toLocaleString()} with websites · {existingProgress.eligible.toLocaleString()} missing email
              </div>
              <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${existingProgress.eligible ? (existingProgress.done / existingProgress.eligible) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          <Button onClick={scrapeExistingLeads} disabled={scrapingExisting} className="w-full" size="lg">
            {scrapingExisting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
            {scrapingExisting ? 'Scraping existing leads...' : 'Scrape emails for existing CRM leads'}
          </Button>
        </Card>

        <Card className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
              <MapPin className="h-3.5 w-3.5" /> City
            </label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Stockholm" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Niche preset
            </label>
            <div className="space-y-1.5">
              {PRESETS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedPreset(i)}
                  className={`w-full text-left px-3 py-2 rounded border text-sm transition-colors ${
                    selectedPreset === i
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border hover:bg-accent text-muted-foreground'
                  }`}
                >
                  <div className="font-medium text-foreground">{p.label}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{p.niches.join(' · ')}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Target leads</label>
            <div className="flex gap-2">
              {[25, 50, 100, 200].map((n) => (
                <button
                  key={n}
                  onClick={() => setTargetLeads(n)}
                  className={`px-3 py-1.5 rounded border text-sm ${
                    targetLeads === n ? 'border-primary bg-primary/5 text-foreground' : 'border-border hover:bg-accent text-muted-foreground'
                  }`}
                >
                  ~{n}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <div><span className="font-medium text-foreground">Filters:</span> min rating 3.5 · min 5 reviews · radius 4 km</div>
            <div><span className="font-medium text-foreground">After search:</span> auto-scrapes every website for emails, then ranks by score.</div>
          </div>

          <Button onClick={start} disabled={running} className="w-full" size="lg">
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
            Find businesses with email
          </Button>
        </Card>
      </div>
    </AppLayout>
  );
}
