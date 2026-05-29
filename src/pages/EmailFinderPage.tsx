import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Mail, Loader2, MapPin, Sparkles } from 'lucide-react';
import { createFinderRun, runFinderSearch } from '@/lib/finder';
import { toast } from 'sonner';

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
  const [city, setCity] = useState('Stockholm');
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [targetLeads, setTargetLeads] = useState(50);
  const [running, setRunning] = useState(false);

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
