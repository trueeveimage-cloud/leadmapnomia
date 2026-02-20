import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { createFinderRun, fetchFinderRuns, runFinderSearch, estimateFinderCost, FinderRun } from '@/lib/finder';
import { toast } from 'sonner';
import { useNavigate, Link } from 'react-router-dom';
import { Search, Loader2, Clock, CheckCircle, XCircle, Square, History } from 'lucide-react';
import { format } from 'date-fns';

const DEFAULT_KEYWORDS = `frisör
bilverkstad
pizzeria
tandläkare
restaurang
cafe
elektriker
rörmokare
städfirma
blomsterhandel`;

const CITIES = ['Göteborg', 'Malmö', 'Stockholm', 'Uppsala', 'Linköping', 'Västerås', 'Örebro', 'Helsingborg', 'Norrköping', 'Jönköping', 'Lund'];

export default function FinderPage() {
  const navigate = useNavigate();
  const [city, setCity] = useState('Göteborg');
  const [customCity, setCustomCity] = useState('');
  const [keywords, setKeywords] = useState(DEFAULT_KEYWORDS);
  const [radius, setRadius] = useState(1500);
  const [maxPages, setMaxPages] = useState(2);
  const [maxCandidates, setMaxCandidates] = useState(300);
  const [maxDetails, setMaxDetails] = useState(100);
  const [minRating, setMinRating] = useState('');
  const [minReviews, setMinReviews] = useState('');
  const [requirePhone, setRequirePhone] = useState(false);
  const [running, setRunning] = useState(false);
  const [estimate, setEstimate] = useState<string | null>(null);
  const [runs, setRuns] = useState<FinderRun[]>([]);

  useEffect(() => {
    fetchFinderRuns().then(setRuns).catch(() => {});
  }, []);

  const effectiveCity = city === 'custom' ? customCity : city;
  const keywordList = keywords.split('\n').map(k => k.trim()).filter(k => k.length > 0);

  const handleEstimate = async () => {
    if (keywordList.length === 0) { toast.error('Add at least one keyword'); return; }
    try {
      const est = await estimateFinderCost({ keywords: keywordList, maxPages, maxCandidates, maxDetails });
      setEstimate(est.estimatedCost);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleRun = async () => {
    if (!effectiveCity.trim()) { toast.error('Select a city'); return; }
    if (keywordList.length === 0) { toast.error('Add at least one keyword'); return; }

    setRunning(true);
    try {
      const run = await createFinderRun({
        city: effectiveCity,
        mode: 'niche',
        keywords: keywordList,
        radius,
        maxPages,
        maxCandidates,
        maxDetails,
        minRating: minRating ? parseFloat(minRating) : null,
        minReviews: minReviews ? parseInt(minReviews) : null,
        requirePhone,
      });

      toast.success('Finder run started!');
      navigate(`/finder/runs/${run.id}`);

      // Fire and forget — the edge function runs in the background
      runFinderSearch(run.id, {
        city: effectiveCity,
        keywords: keywordList,
        radius,
        maxPages,
        maxCandidates,
        maxDetails,
        minRating: minRating ? parseFloat(minRating) : undefined,
        minReviews: minReviews ? parseInt(minReviews) : undefined,
        requirePhone,
      }).catch(e => console.error('Finder search error:', e));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 pb-10">
        <div className="mb-5">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Search size={20} className="text-primary" /> Find Businesses Without Website
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Search Swedish cities for businesses missing a website — perfect leads for web design.
          </p>
        </div>

        <div className="space-y-4">
          {/* City */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">City</label>
            <div className="flex flex-wrap gap-2">
              {CITIES.map(c => (
                <button
                  key={c}
                  onClick={() => setCity(c)}
                  className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                    city === c ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
                  }`}
                >
                  {c}
                </button>
              ))}
              <button
                onClick={() => setCity('custom')}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                  city === 'custom' ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                Custom…
              </button>
            </div>
            {city === 'custom' && (
              <Input
                value={customCity}
                onChange={e => setCustomCity(e.target.value)}
                placeholder="Enter city name…"
                className="mt-2 h-9 text-sm"
              />
            )}
          </div>

          {/* Keywords */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Niche Keywords <span className="text-muted-foreground font-normal">(one per line)</span></label>
            <Textarea
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="frisör\nbilverkstad\npizzeria"
              className="h-32 text-sm font-mono resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">{keywordList.length} keywords</p>
          </div>

          {/* Budget controls */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Radius (m)</label>
              <Input type="number" value={radius} onChange={e => setRadius(Number(e.target.value))} className="h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Max Pages/Query</label>
              <Input type="number" value={maxPages} onChange={e => setMaxPages(Number(e.target.value))} min={1} max={3} className="h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Max Candidates</label>
              <Input type="number" value={maxCandidates} onChange={e => setMaxCandidates(Number(e.target.value))} className="h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Max Detail Lookups</label>
              <Input type="number" value={maxDetails} onChange={e => setMaxDetails(Number(e.target.value))} className="h-9 text-sm" />
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Min Rating</label>
              <Input type="number" value={minRating} onChange={e => setMinRating(e.target.value)} placeholder="e.g. 3.5" step="0.5" min="0" max="5" className="h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Min Reviews</label>
              <Input type="number" value={minReviews} onChange={e => setMinReviews(e.target.value)} placeholder="e.g. 5" className="h-9 text-sm" />
            </div>
          </div>

          <div className="flex items-center justify-between py-1">
            <label className="text-sm text-foreground">Only include places with phone</label>
            <Switch checked={requirePhone} onCheckedChange={setRequirePhone} />
          </div>

          {/* Estimate */}
          {estimate && (
            <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
              💰 {estimate}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={handleEstimate} disabled={running} className="gap-1.5">
              💰 Estimate Cost
            </Button>
            <Button onClick={handleRun} disabled={running || !effectiveCity.trim() || keywordList.length === 0} className="gap-1.5 flex-1">
              {running ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {running ? 'Starting…' : 'Run Finder'}
            </Button>
          </div>
        </div>

        {/* Previous runs */}
        {runs.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <History size={14} /> Previous Runs
            </h2>
            <div className="space-y-2">
              {runs.map(run => (
                <Link
                  key={run.id}
                  to={`/finder/runs/${run.id}`}
                  className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg hover:border-primary/30 transition-colors"
                >
                  <span className="shrink-0">
                    {run.status === 'done' && <CheckCircle size={14} className="text-green-400" />}
                    {run.status === 'running' && <Loader2 size={14} className="animate-spin text-primary" />}
                    {run.status === 'stopped' && <Square size={14} className="text-amber-400" />}
                    {run.status === 'failed' && <XCircle size={14} className="text-red-400" />}
                    {run.status === 'pending' && <Clock size={14} className="text-muted-foreground" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {run.city} — {(run.keywords || []).slice(0, 3).join(', ')}{(run.keywords || []).length > 3 ? '…' : ''}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(run.created_at), 'MMM d, HH:mm')} · {run.status}
                      {run.stats?.noWebsiteWithPhone != null && ` · ${run.stats.noWebsiteWithPhone} no-website leads`}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
