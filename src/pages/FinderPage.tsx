import React, { useState, useEffect, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import InfoTip from '@/components/InfoTip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { createFinderRun, fetchFinderRuns, runFinderSearch, FinderRun } from '@/lib/finder';
import { SWEDEN_CITIES, findCity, searchCities, getAreaLabel, CityProfile } from '@/lib/swedenCities';
import { computeAllPresets, adjustForLeadsTarget, estimateCostFromPreset, PresetConfig, PresetKey } from '@/lib/finderPresets';
import { getSetting, setSetting } from '@/lib/supabase';
import { toast } from 'sonner';
import { useNavigate, Link } from 'react-router-dom';
import { Search, Loader2, Clock, CheckCircle, XCircle, Square, History, ChevronDown, Settings2, MapPin, Target, Zap } from 'lucide-react';
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

const LEADS_TARGETS = [25, 50, 100, 200, 400];

export default function FinderPage() {
  const navigate = useNavigate();

  // City selection
  const [citySearch, setCitySearch] = useState('');
  const [selectedCity, setSelectedCity] = useState<CityProfile | null>(null);
  const [customCity, setCustomCity] = useState('');
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  // Preset + settings
  const [activePreset, setActivePreset] = useState<PresetKey>('balanced');
  const [leadsTarget, setLeadsTarget] = useState(50);
  const [keywords, setKeywords] = useState(DEFAULT_KEYWORDS);

  // Advanced settings (populated from preset)
  const [radius, setRadius] = useState(5000);
  const [maxPages, setMaxPages] = useState(2);
  const [maxCandidates, setMaxCandidates] = useState(500);
  const [maxDetails, setMaxDetails] = useState(200);
  const [minRating, setMinRating] = useState('3.7');
  const [minReviews, setMinReviews] = useState('5');
  const [maxReviews, setMaxReviews] = useState('50');
  const [requirePhone, setRequirePhone] = useState(true);
  const [findGmailOnly, setFindGmailOnly] = useState(false);

  // UI state
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<FinderRun[]>([]);

  // Load saved defaults
  useEffect(() => {
    fetchFinderRuns().then(setRuns).catch(() => {});
    getSetting('finder_default_keywords').then(v => { if (v) setKeywords(v); });
    getSetting('finder_default_city').then(v => {
      if (v) {
        const city = findCity(v);
        if (city) setSelectedCity(city);
      }
    });
    getSetting('finder_default_leads_target').then(v => {
      if (v) setLeadsTarget(parseInt(v));
    });
  }, []);

  const keywordList = keywords.split('\n').map(k => k.trim()).filter(k => k.length > 0);
  const effectiveCity = selectedCity?.name || customCity;

  // Compute presets when city changes
  const presets = useMemo(() => {
    if (!selectedCity) return null;
    return computeAllPresets(selectedCity);
  }, [selectedCity]);

  // Apply preset + leads target
  const currentPreset = useMemo(() => {
    if (!presets) return null;
    const base = presets.find(p => p.key === activePreset) || presets[0];
    return adjustForLeadsTarget(base, leadsTarget);
  }, [presets, activePreset, leadsTarget]);

  // Sync advanced settings when preset changes
  useEffect(() => {
    if (!currentPreset) return;
    setRadius(currentPreset.radius);
    setMaxPages(currentPreset.maxPages);
    setMaxDetails(currentPreset.maxDetails);
    setMaxCandidates(currentPreset.maxCandidates);
    setMinRating(String(currentPreset.minRating));
    setMinReviews(String(currentPreset.minReviews));
    setMaxReviews(String(currentPreset.maxReviews));
    setRequirePhone(currentPreset.requirePhone);
  }, [currentPreset]);

  // Cost estimate
  const costEstimate = useMemo(() => {
    if (!currentPreset) return null;
    return estimateCostFromPreset(currentPreset, keywordList.length);
  }, [currentPreset, keywordList.length]);

  // City search results
  const filteredCities = useMemo(() => {
    return searchCities(citySearch).slice(0, 15);
  }, [citySearch]);

  const handleSelectCity = (city: CityProfile) => {
    setSelectedCity(city);
    setCitySearch('');
    setShowCityDropdown(false);
  };

  const handleRun = async () => {
    if (!effectiveCity.trim()) { toast.error('Select a city'); return; }
    if (keywordList.length === 0) { toast.error('Add at least one keyword'); return; }

    // Save defaults
    setSetting('finder_default_city', effectiveCity);
    setSetting('finder_default_keywords', keywords);
    setSetting('finder_default_leads_target', String(leadsTarget));

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
        maxReviews: maxReviews ? parseInt(maxReviews) : null,
        requirePhone,
        findGmailOnly,
      });

      toast.success('Finder run started!');
      navigate(`/finder/runs/${run.id}`);

      runFinderSearch(run.id, {
        city: effectiveCity,
        keywords: keywordList,
        radius,
        maxPages,
        maxCandidates,
        maxDetails,
        minRating: minRating ? parseFloat(minRating) : undefined,
        minReviews: minReviews ? parseInt(minReviews) : undefined,
        maxReviews: maxReviews ? parseInt(maxReviews) : undefined,
        requirePhone,
        findGmailOnly,
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
          <div className="flex items-center justify-between">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
              <Search size={20} className="text-primary" /> Business Finder
            </h1>
            <Link to="/finder/coverage">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <MapPin size={12} /> Coverage Map
              </Button>
            </Link>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Find businesses without a professional website — perfect leads for outreach.
          </p>
        </div>

        <div className="space-y-5">
          {/* City Selector */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
              <MapPin size={13} /> City / Area
              <InfoTip text="Select a Swedish city. Settings will auto-adjust based on city size and density." />
            </label>
            <div className="relative">
              <Input
                value={selectedCity ? selectedCity.name : citySearch}
                onChange={e => {
                  setCitySearch(e.target.value);
                  setSelectedCity(null);
                  setShowCityDropdown(true);
                }}
                onFocus={() => setShowCityDropdown(true)}
                placeholder="Search Swedish cities…"
                className="h-10"
              />
              {showCityDropdown && !selectedCity && (
                <div className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
                  {filteredCities.map(city => (
                    <button
                      key={city.name}
                      onClick={() => handleSelectCity(city)}
                      className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors flex items-center justify-between text-sm"
                    >
                      <span className="font-medium text-foreground">{city.name}</span>
                      <span className="text-xs text-muted-foreground">{city.type} · {city.density === 'HIGH' ? '🔴' : city.density === 'MED' ? '🟡' : '🟢'} {city.density}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => { setShowCityDropdown(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 border-t border-border"
                  >
                    Type a custom city name and press Enter…
                  </button>
                </div>
              )}
            </div>
            {/* Area profile badge */}
            {selectedCity && (
              <div className="mt-2 flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
                  selectedCity.density === 'HIGH' ? 'bg-red/10 border-red/30 text-red' :
                  selectedCity.density === 'MED' ? 'bg-amber/10 border-amber/30 text-amber' :
                  'bg-green/10 border-green/30 text-green'
                }`}>
                  <MapPin size={10} />
                  {selectedCity.name} — {getAreaLabel(selectedCity)}
                </span>
              </div>
            )}
          </div>

          {/* Presets */}
          {presets && (
            <div>
              <label className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
                <Target size={13} /> Strategy Preset
                <InfoTip text="Presets auto-scale radius, candidate limits, and filters based on city size. Bigger cities get wider searches with more results." />
              </label>
              <div className="grid grid-cols-3 gap-2">
                {presets.map(preset => {
                  const adjusted = adjustForLeadsTarget(preset, leadsTarget);
                  const cost = estimateCostFromPreset(adjusted, keywordList.length);
                  const isActive = activePreset === preset.key;
                  return (
                    <button
                      key={preset.key}
                      onClick={() => setActivePreset(preset.key)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        isActive
                          ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                          : 'border-border bg-card hover:border-primary/30'
                      }`}
                    >
                      <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        {preset.icon} {preset.label}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{preset.description}</p>
                      <div className="mt-2 space-y-0.5">
                        <div className="text-[10px] text-muted-foreground">~{adjusted.maxDetails} details</div>
                        <div className="text-[10px] font-medium text-primary">{cost.totalUsd}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Leads target slider */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
              <Zap size={13} /> Leads Target
              <InfoTip text="How many call-ready leads do you want from this run? Adjusts detail lookups automatically. Actual results depend on your market." />
            </label>
            <div className="space-y-3">
              <Slider
                value={[LEADS_TARGETS.indexOf(leadsTarget) >= 0 ? LEADS_TARGETS.indexOf(leadsTarget) : 1]}
                onValueChange={v => setLeadsTarget(LEADS_TARGETS[v[0]] || 50)}
                min={0}
                max={LEADS_TARGETS.length - 1}
                step={1}
              />
              <div className="flex justify-between text-xs text-muted-foreground px-1">
                {LEADS_TARGETS.map(t => (
                  <button
                    key={t}
                    onClick={() => setLeadsTarget(t)}
                    className={`transition-colors ${leadsTarget === t ? 'text-primary font-bold' : 'hover:text-foreground'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {costEstimate && (
              <div className="mt-2 p-2.5 bg-muted/50 rounded-lg flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  ~{maxDetails} detail lookups · {keywordList.length * maxPages} searches
                </span>
                <span className="font-medium text-primary">{costEstimate.totalUsd}</span>
              </div>
            )}
          </div>

          {/* Keywords */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
              Niche Keywords <span className="text-muted-foreground font-normal">(one per line)</span>
              <InfoTip text="Each keyword becomes a separate Google search. More keywords = more businesses found, but also more API cost." />
            </label>
            <Textarea
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="frisör&#10;bilverkstad&#10;pizzeria"
              className="h-28 text-sm font-mono resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">{keywordList.length} keywords</p>
          </div>

          {/* Toggles */}
          <div className="space-y-2">
            <div className="flex items-center justify-between py-1">
              <label className="text-sm text-foreground">Only include places with phone</label>
              <Switch checked={requirePhone} onCheckedChange={setRequirePhone} />
            </div>
            <div className="flex items-center justify-between py-1">
              <div>
                <label className="text-sm text-foreground">Also find Gmail-only businesses</label>
                <p className="text-[10px] text-muted-foreground">Detect businesses using @gmail.com instead of a custom domain</p>
              </div>
              <Switch checked={findGmailOnly} onCheckedChange={setFindGmailOnly} />
            </div>
          </div>

          {/* Advanced Settings */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full py-2">
              <Settings2 size={12} />
              Advanced Settings
              <ChevronDown size={12} className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-4 pt-2 pb-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      Radius (m)
                      <InfoTip text="Search radius from city center." />
                    </label>
                    <Input type="number" value={radius} onChange={e => setRadius(Number(e.target.value))} className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      Max Pages/Query
                    </label>
                    <Input type="number" value={maxPages} onChange={e => setMaxPages(Number(e.target.value))} min={1} max={3} className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      Max Candidates
                    </label>
                    <Input type="number" value={maxCandidates} onChange={e => setMaxCandidates(Number(e.target.value))} className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      Max Detail Lookups
                    </label>
                    <Input type="number" value={maxDetails} onChange={e => setMaxDetails(Number(e.target.value))} className="h-9 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1">Min Rating</label>
                    <Input type="number" value={minRating} onChange={e => setMinRating(e.target.value)} step="0.5" min="0" max="5" className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1">Min Reviews</label>
                    <Input type="number" value={minReviews} onChange={e => setMinReviews(e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1">Max Reviews</label>
                    <Input type="number" value={maxReviews} onChange={e => setMaxReviews(e.target.value)} className="h-9 text-sm" />
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Run button */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleRun}
              disabled={running || !effectiveCity.trim() || keywordList.length === 0}
              className="gap-1.5 flex-1 h-11"
              size="lg"
            >
              {running ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {running ? 'Starting…' : `Run Finder — ${effectiveCity || 'Select city'}`}
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
                    {run.status === 'done' && <CheckCircle size={14} className="text-green" />}
                    {run.status === 'running' && <Loader2 size={14} className="animate-spin text-primary" />}
                    {run.status === 'stopped' && <Square size={14} className="text-amber" />}
                    {run.status === 'failed' && <XCircle size={14} className="text-red" />}
                    {run.status === 'pending' && <Clock size={14} className="text-muted-foreground" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {run.city} — {(run.keywords || []).slice(0, 3).join(', ')}{(run.keywords || []).length > 3 ? '…' : ''}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(run.created_at), 'MMM d, HH:mm')} · {run.status}
                      {(run.stats as any)?.noWebsiteWithPhone != null && ` · ${(run.stats as any).noWebsiteWithPhone} leads`}
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
