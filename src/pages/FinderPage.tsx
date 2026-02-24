import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import InfoTip from '@/components/InfoTip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { createFinderRun, fetchFinderRuns, runFinderSearch, fetchFinderCandidates, FinderRun, FinderCandidate } from '@/lib/finder';
import { SWEDEN_CITIES, findCity, searchCities, getAreaLabel, CityProfile } from '@/lib/swedenCities';
import { computeAllPresets, adjustForLeadsTarget, estimateCostFromPreset, PresetConfig, PresetKey } from '@/lib/finderPresets';
import { getSetting, setSetting, addLead } from '@/lib/supabase';
import { useCRM } from '@/context/CRMContext';
import { toast } from 'sonner';
import { useNavigate, Link } from 'react-router-dom';
import { Search, Loader2, Clock, CheckCircle, XCircle, Square, History, ChevronDown, Settings2, MapPin, Target, Zap, X, UserPlus } from 'lucide-react';
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
  const { refreshCounts } = useCRM();

  // Auto-add tracking
  const autoAddedRunsRef = useRef<Set<string>>(new Set());
  const [autoAddProgress, setAutoAddProgress] = useState<Record<string, { added: number; total: number; done: boolean }>>({});

  // City selection — multi
  const [citySearch, setCitySearch] = useState('');
  const [selectedCities, setSelectedCities] = useState<CityProfile[]>([]);
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

  // Load saved defaults + poll active runs
  useEffect(() => {
    const loadRuns = () => fetchFinderRuns().then(setRuns).catch(() => {});
    loadRuns();
    getSetting('finder_default_keywords').then(v => { if (v) setKeywords(v); });
    getSetting('finder_default_city').then(v => {
      if (v) {
        const city = findCity(v);
        if (city) setSelectedCities([city]);
      }
    });
    getSetting('finder_default_leads_target').then(v => {
      if (v) setLeadsTarget(parseInt(v));
    });
    // Poll every 4s to pick up run completions
    const interval = setInterval(loadRuns, 4000);
    return () => clearInterval(interval);
  }, []);

  // Auto-add candidates to CRM when a run finishes
  const autoAddForRun = useCallback(async (run: FinderRun) => {
    if (autoAddedRunsRef.current.has(run.id)) return;
    autoAddedRunsRef.current.add(run.id);
    try {
      const candidates = await fetchFinderCandidates(run.id);
      const qualifying = candidates.filter(c =>
        c.outcome === 'no_website_phone' || c.outcome === 'no_website_no_phone' || c.outcome === 'no_website'
      );
      if (qualifying.length === 0) {
        setAutoAddProgress(p => ({ ...p, [run.id]: { added: 0, total: 0, done: true } }));
        return;
      }
      setAutoAddProgress(p => ({ ...p, [run.id]: { added: 0, total: qualifying.length, done: false } }));
      let added = 0;
      for (const c of qualifying) {
        try {
          const { lead, duplicate, error } = await addLead({
            place_id: c.place_id, maps_url: c.maps_url, name: c.name,
            category: c.category, niche_label: c.category?.split(',')[0]?.trim() || null,
            rating: c.rating, reviews_count: c.reviews_count,
            phone: c.phone, email: c.email || null, address: c.address, website: c.website,
            section: 'unsorted', status: 'not_contacted',
            call_outcome_last: null, next_action_at: null, notes: null, tags: [],
          });
          if (!duplicate && !error) added++;
        } catch {}
        setAutoAddProgress(p => ({ ...p, [run.id]: { added, total: qualifying.length, done: false } }));
      }
      setAutoAddProgress(p => ({ ...p, [run.id]: { added, total: qualifying.length, done: true } }));
      refreshCounts();
      if (added > 0) toast.success(`${run.city}: auto-added ${added} leads to CRM`);
    } catch (e: any) {
      console.error('Auto-add error:', e);
      setAutoAddProgress(p => ({ ...p, [run.id]: { added: 0, total: 0, done: true } }));
    }
  }, [refreshCounts]);

  // Trigger auto-add when runs transition to done/stopped
  useEffect(() => {
    for (const run of runs) {
      if ((run.status === 'done' || run.status === 'stopped') && !autoAddedRunsRef.current.has(run.id)) {
        autoAddForRun(run);
      }
    }
  }, [runs, autoAddForRun]);

  const keywordList = keywords.split('\n').map(k => k.trim()).filter(k => k.length > 0);

  // Use first selected city for preset computation (presets shown based on first city)
  const primaryCity = selectedCities[0] || null;

  // Compute presets when city changes
  const presets = useMemo(() => {
    if (!primaryCity) return null;
    return computeAllPresets(primaryCity);
  }, [primaryCity]);

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

  // Cost estimate (per city × number of cities)
  const costEstimate = useMemo(() => {
    if (!currentPreset) return null;
    const perCity = estimateCostFromPreset(currentPreset, keywordList.length);
    const count = selectedCities.length || 1;
    const totalCost = (parseFloat(perCity.totalUsd.replace('$', '')) * count);
    return { ...perCity, totalUsd: `$${totalCost.toFixed(2)}`, cityCount: count };
  }, [currentPreset, keywordList.length, selectedCities.length]);

  // City stats from previous runs
  const cityStats = useMemo(() => {
    const stats: Record<string, { runs: number; leads: number }> = {};
    for (const run of runs) {
      const name = run.city;
      if (!stats[name]) stats[name] = { runs: 0, leads: 0 };
      stats[name].runs += 1;
      const s = run.stats as any;
      stats[name].leads += (s?.noWebsiteWithPhone ?? 0) + (s?.noWebsiteEmailOnly ?? 0);
    }
    return stats;
  }, [runs]);

  // City search results — exclude already selected
  const filteredCities = useMemo(() => {
    const selectedNames = new Set(selectedCities.map(c => c.name));
    return searchCities(citySearch).filter(c => !selectedNames.has(c.name)).slice(0, 15);
  }, [citySearch, selectedCities]);

  const handleSelectCity = (city: CityProfile) => {
    setSelectedCities(prev => [...prev, city]);
    setCitySearch('');
    setShowCityDropdown(false);
  };

  const handleRemoveCity = (name: string) => {
    setSelectedCities(prev => prev.filter(c => c.name !== name));
  };

  const handleRun = async () => {
    if (selectedCities.length === 0) { toast.error('Select at least one city'); return; }
    if (keywordList.length === 0) { toast.error('Add at least one keyword'); return; }

    // Save defaults
    setSetting('finder_default_city', selectedCities[0].name);
    setSetting('finder_default_keywords', keywords);
    setSetting('finder_default_leads_target', String(leadsTarget));

    setRunning(true);
    try {
      // Create a run for each selected city
      const createdRuns: { id: string; city: string }[] = [];
      for (const city of selectedCities) {
        // Compute city-specific preset
        const cityPresets = computeAllPresets(city);
        const cityBase = cityPresets.find(p => p.key === activePreset) || cityPresets[0];
        const cityPreset = adjustForLeadsTarget(cityBase, leadsTarget);

        const run = await createFinderRun({
          city: city.name,
          mode: 'niche',
          keywords: keywordList,
          radius: cityPreset.radius,
          maxPages: cityPreset.maxPages,
          maxCandidates: cityPreset.maxCandidates,
          maxDetails: cityPreset.maxDetails,
          minRating: cityPreset.minRating || null,
          minReviews: cityPreset.minReviews || null,
          maxReviews: cityPreset.maxReviews || null,
          requirePhone: cityPreset.requirePhone,
          findGmailOnly,
        });
        createdRuns.push({ id: run.id, city: city.name });

        // Fire & forget the search
        runFinderSearch(run.id, {
          city: city.name,
          keywords: keywordList,
          radius: cityPreset.radius,
          maxPages: cityPreset.maxPages,
          maxCandidates: cityPreset.maxCandidates,
          maxDetails: cityPreset.maxDetails,
          minRating: cityPreset.minRating || undefined,
          minReviews: cityPreset.minReviews || undefined,
          maxReviews: cityPreset.maxReviews || undefined,
          requirePhone: cityPreset.requirePhone,
          findGmailOnly,
        }).catch(e => console.error(`Finder search error (${city.name}):`, e));
      }

      if (createdRuns.length === 1) {
        toast.success('Finder run started!');
        navigate(`/finder/runs/${createdRuns[0].id}`);
      } else {
        toast.success(`${createdRuns.length} finder runs started!`);
        // Refresh the runs list so user can see them
        fetchFinderRuns().then(setRuns).catch(() => {});
      }
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
          {/* City Selector — Multi */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
              <MapPin size={13} /> Cities / Areas
              <InfoTip text="Select one or more Swedish cities. Settings will auto-adjust based on city size. A separate run is created per city." />
            </label>

            {/* Selected city chips */}
            {selectedCities.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedCities.map(city => (
                  <span
                    key={city.name}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-primary/10 border border-primary/30 text-primary"
                  >
                    {city.name}
                    <button
                      onClick={() => handleRemoveCity(city.name)}
                      className="hover:text-destructive transition-colors"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="relative">
              <Input
                value={citySearch}
                onChange={e => {
                  setCitySearch(e.target.value);
                  setShowCityDropdown(true);
                }}
                onFocus={() => setShowCityDropdown(true)}
                placeholder={selectedCities.length > 0 ? 'Add another city…' : 'Search Swedish cities…'}
                className="h-10"
              />
              {showCityDropdown && (
                <div className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
                  {filteredCities.map(city => {
                    const cs = cityStats[city.name];
                    return (
                      <button
                        key={city.name}
                        onClick={() => handleSelectCity(city)}
                        className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors flex items-center justify-between text-sm"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{city.name}</span>
                          {cs && (
                            <span className="text-[10px] text-muted-foreground">{cs.runs} run{cs.runs !== 1 ? 's' : ''} · {cs.leads} lead{cs.leads !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">{city.type} · {city.density === 'HIGH' ? '🔴' : city.density === 'MED' ? '🟡' : '🟢'} {city.density}</span>
                      </button>
                    );
                  })}
                  {filteredCities.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No cities match</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Presets */}
          {presets && (
            <div>
              <label className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
                <Target size={13} /> Strategy Preset
                <InfoTip text="Presets auto-scale radius, candidate limits, and filters based on city size. Each city gets its own optimized settings." />
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
                        <div className="text-[10px] text-muted-foreground">~{adjusted.maxDetails} details/city</div>
                        <div className="text-[10px] font-medium text-primary">{cost.totalUsd}/city</div>
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
              <InfoTip text="How many call-ready leads do you want per city? Adjusts detail lookups automatically." />
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
                  {selectedCities.length > 1
                    ? `${selectedCities.length} cities · ~${maxDetails} details each`
                    : `~${maxDetails} detail lookups · ${keywordList.length * maxPages} searches`}
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
                <label className="text-sm text-foreground">Also find email-only businesses</label>
                <p className="text-[10px] text-muted-foreground">Include businesses that only have an email (any @domain) but no website</p>
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
              disabled={running || selectedCities.length === 0 || keywordList.length === 0}
              className="gap-1.5 flex-1 h-11"
              size="lg"
            >
              {running ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {running
                ? 'Starting…'
                : selectedCities.length === 0
                  ? 'Select cities to run'
                  : selectedCities.length === 1
                    ? `Run Finder — ${selectedCities[0].name}`
                    : `Run Finder — ${selectedCities.length} cities`}
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
