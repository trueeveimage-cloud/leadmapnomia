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
import { ALL_CITIES, getCitiesByCountry, findCity, searchCities, getAreaLabel, CityProfile, Country, COUNTRY_LABELS, COUNTRY_DEFAULT_KEYWORDS } from '@/lib/cities';
import { getRecommendedSearches, SearchRecommendation } from '@/lib/recommendedSearches';
import { computeAllPresets, adjustForLeadsTarget, estimateCostFromPreset, PresetConfig, PresetKey } from '@/lib/finderPresets';
import { getSetting, setSetting, addLead, determineSection } from '@/lib/supabase';
import { useCRM } from '@/context/CRMContext';
import { toast } from 'sonner';
import { useNavigate, Link } from 'react-router-dom';
import { Search, Loader2, Clock, CheckCircle, XCircle, Square, History, ChevronDown, Settings2, MapPin, Target, Zap, X, UserPlus, Map, Globe, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import CityPickerMap from '@/components/CityPickerMap';

const LEADS_TARGETS = [25, 50, 100, 200, 400];

export default function FinderPage() {
  const navigate = useNavigate();
  const { refreshCounts } = useCRM();

  // Country selection
  const [country, setCountry] = useState<Country>('SE');

  // Auto-add tracking
  const autoAddedRunsRef = useRef<Set<string>>(new Set());
  const [autoAddProgress, setAutoAddProgress] = useState<Record<string, { added: number; duplicated: number; total: number; done: boolean }>>({});

  // City selection — multi
  const [citySearch, setCitySearch] = useState('');
  const [selectedCities, setSelectedCities] = useState<CityProfile[]>([]);
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  // Preset + settings
  const [activePreset, setActivePreset] = useState<PresetKey>('balanced');
  const [leadsTarget, setLeadsTarget] = useState(50);
  const [keywords, setKeywords] = useState(COUNTRY_DEFAULT_KEYWORDS['SE']);

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
  const [mapOpen, setMapOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<FinderRun[]>([]);
  const [showUnsearchedOnly, setShowUnsearchedOnly] = useState(false);

  // When country changes, reset selected cities and update keywords
  const handleCountryChange = (c: Country) => {
    setCountry(c);
    setSelectedCities([]);
    setCitySearch('');
    setKeywords(COUNTRY_DEFAULT_KEYWORDS[c]);
  };

  // Load saved defaults + poll active runs
  useEffect(() => {
    const loadRuns = () => fetchFinderRuns().then(setRuns).catch(() => {});
    loadRuns();
    getSetting('finder_default_keywords').then(v => { if (v) setKeywords(v); });
    getSetting('finder_default_country').then(v => {
      if (v && (v === 'SE' || v === 'NO' || v === 'DK')) setCountry(v as Country);
    });
    getSetting('finder_default_city').then(v => {
      if (v) {
        const city = findCity(v);
        if (city) {
          setSelectedCities([city]);
          setCountry(city.country);
        }
      }
    });
    getSetting('finder_default_leads_target').then(v => {
      if (v) setLeadsTarget(parseInt(v));
    });
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
        setAutoAddProgress(p => ({ ...p, [run.id]: { added: 0, duplicated: 0, total: 0, done: true } }));
        return;
      }
      setAutoAddProgress(p => ({ ...p, [run.id]: { added: 0, duplicated: 0, total: qualifying.length, done: false } }));
      let added = 0;
      let duplicated = 0;
      for (const c of qualifying) {
        try {
          const leadData = {
            place_id: c.place_id, maps_url: c.maps_url, name: c.name,
            category: c.category, niche_label: c.category?.split(',')[0]?.trim() || null,
            rating: c.rating, reviews_count: c.reviews_count,
            phone: c.phone, email: c.email || null, address: c.address, website: c.website,
            status: 'not_contacted' as const,
            call_outcome_last: null, next_action_at: null, notes: null, tags: [],
          };
          const section = determineSection(leadData);
          const { lead, duplicate, error } = await addLead({ ...leadData, section });
          if (duplicate) duplicated++;
          if (!duplicate && !error) added++;
        } catch {}
        setAutoAddProgress(p => ({ ...p, [run.id]: { added, duplicated, total: qualifying.length, done: false } }));
      }
      setAutoAddProgress(p => ({ ...p, [run.id]: { added, duplicated, total: qualifying.length, done: true } }));
      refreshCounts();
      if (added > 0) toast.success(`${run.city}: added ${added} new leads`);
    } catch (e: any) {
      console.error('Auto-add error:', e);
      setAutoAddProgress(p => ({ ...p, [run.id]: { added: 0, duplicated: 0, total: 0, done: true } }));
    }
  }, [refreshCounts]);

  const initialDoneRunsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (initialDoneRunsRef.current === null) {
      if (runs.length === 0) return;
      initialDoneRunsRef.current = new Set(
        runs.filter(r => r.status === 'done' || r.status === 'stopped').map(r => r.id)
      );
      return;
    }
    for (const run of runs) {
      if ((run.status === 'done' || run.status === 'stopped')
        && !autoAddedRunsRef.current.has(run.id)
        && !initialDoneRunsRef.current.has(run.id)) {
        autoAddForRun(run);
      }
    }
  }, [runs, autoAddForRun]);

  const keywordList = keywords.split('\n').map(k => k.trim()).filter(k => k.length > 0);

  const primaryCity = selectedCities[0] || null;

  const presets = useMemo(() => {
    if (!primaryCity) return null;
    return computeAllPresets(primaryCity);
  }, [primaryCity]);

  const currentPreset = useMemo(() => {
    if (!presets) return null;
    const base = presets.find(p => p.key === activePreset) || presets[0];
    return adjustForLeadsTarget(base, leadsTarget);
  }, [presets, activePreset, leadsTarget]);

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

  const costEstimate = useMemo(() => {
    if (!currentPreset) return null;
    const perCity = estimateCostFromPreset(currentPreset, keywordList.length);
    const count = selectedCities.length || 1;
    const totalCost = (parseFloat(perCity.totalUsd.replace('$', '')) * count);
    return { ...perCity, totalUsd: `$${totalCost.toFixed(2)}`, cityCount: count };
  }, [currentPreset, keywordList.length, selectedCities.length]);

  const cityStats = useMemo(() => {
    const stats: Record<string, { runs: number; leads: number; candidates: number }> = {};
    for (const run of runs) {
      const name = run.city;
      if (!stats[name]) stats[name] = { runs: 0, leads: 0, candidates: 0 };
      stats[name].runs += 1;
      const s = run.stats as any;
      stats[name].leads += (s?.noWebsiteWithPhone ?? 0) + (s?.noWebsiteEmailOnly ?? 0);
      stats[name].candidates += (s?.candidatesFound ?? 0);
    }
    return stats;
  }, [runs]);

  const countryCities = useMemo(() => getCitiesByCountry(country), [country]);

  const filteredCities = useMemo(() => {
    const selectedNames = new Set(selectedCities.map(c => c.name));
    let results = searchCities(citySearch, country).filter(c => !selectedNames.has(c.name));
    if (showUnsearchedOnly) {
      results = results.filter(c => !cityStats[c.name]);
    }
    results.sort((a, b) => {
      const aSearched = !!cityStats[a.name];
      const bSearched = !!cityStats[b.name];
      if (aSearched !== bSearched) return aSearched ? 1 : -1;
      return 0;
    });
    return results.slice(0, 20);
  }, [citySearch, selectedCities, showUnsearchedOnly, cityStats, country]);

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

    setSetting('finder_default_city', selectedCities[0].name);
    setSetting('finder_default_keywords', keywords);
    setSetting('finder_default_leads_target', String(leadsTarget));
    setSetting('finder_default_country', country);

    setRunning(true);
    try {
      const batchId = selectedCities.length > 1 ? crypto.randomUUID() : null;
      const batchLabel = selectedCities.length > 1 ? selectedCities.map(c => c.name).join(', ') : null;

      const createdRuns: { id: string; city: string }[] = [];
      for (const city of selectedCities) {
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
          batchId,
          batchLabel,
        });
        createdRuns.push({ id: run.id, city: city.name });

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

      if (batchId && createdRuns.length > 1) {
        toast.success(`${createdRuns.length} city batch started!`);
        navigate(`/finder/batch/${batchId}`);
      } else if (createdRuns.length === 1) {
        toast.success('Finder run started!');
        navigate(`/finder/runs/${createdRuns[0].id}`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRunning(false);
    }
  };

  // Country stats for the header
  const countryStats = useMemo(() => {
    const stats: Record<Country, { runs: number; leads: number }> = {
      SE: { runs: 0, leads: 0 },
      NO: { runs: 0, leads: 0 },
      DK: { runs: 0, leads: 0 },
    };
    for (const run of runs) {
      const city = findCity(run.city);
      const c = city?.country || 'SE';
      stats[c].runs++;
      const s = run.stats as any;
      stats[c].leads += (s?.noWebsiteWithPhone ?? 0) + (s?.noWebsiteEmailOnly ?? 0);
    }
    return stats;
  }, [runs]);

  // Recommended searches
  const recommendations = useMemo(() => {
    return getRecommendedSearches(runs, cityStats).filter(r => r.country === country);
  }, [runs, cityStats, country]);

  const applyRecommendation = (rec: SearchRecommendation) => {
    const selectedNames = new Set(selectedCities.map(c => c.name));
    const newCities = rec.cities.filter(c => !selectedNames.has(c.name));
    if (newCities.length === 0) { toast.info('All recommended cities already selected'); return; }
    setSelectedCities(prev => [...prev, ...newCities]);
    toast.success(`Added ${newCities.length} recommended cities`);
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
          {/* Country selector */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
              <Globe size={13} /> Country
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['SE', 'NO', 'DK'] as Country[]).map(c => {
                const cs = countryStats[c];
                const isActive = country === c;
                return (
                  <button
                    key={c}
                    onClick={() => handleCountryChange(c)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      isActive
                        ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                        : 'border-border bg-card hover:border-primary/30'
                    }`}
                  >
                    <div className="text-sm font-medium text-foreground">{COUNTRY_LABELS[c]}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {getCitiesByCountry(c).length} cities
                      {cs.runs > 0 && ` · ${cs.leads} leads`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* City Selector — Multi */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
              <MapPin size={13} /> Cities / Areas
              <InfoTip text="Select one or more cities. Settings will auto-adjust based on city size." />
            </label>

            {selectedCities.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedCities.map(city => (
                  <span
                    key={city.name}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-primary/10 border border-primary/30 text-primary"
                  >
                    {city.name}
                    <button onClick={() => handleRemoveCity(city.name)} className="hover:text-destructive transition-colors">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="relative">
              <Input
                value={citySearch}
                onChange={e => { setCitySearch(e.target.value); setShowCityDropdown(true); }}
                onFocus={() => setShowCityDropdown(true)}
                placeholder={selectedCities.length > 0 ? 'Add another city…' : `Search ${COUNTRY_LABELS[country].split(' ')[1]} cities…`}
                className="h-10"
              />
              {showCityDropdown && (
                <div className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
                  <div className="sticky top-0 bg-popover border-b border-border px-3 py-2 flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">{filteredCities.filter(c => !cityStats[c.name]).length} unsearched</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowUnsearchedOnly(v => !v); }}
                      className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${showUnsearchedOnly ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                    >
                      {showUnsearchedOnly ? '✓ Unsearched only' : 'Show unsearched only'}
                    </button>
                  </div>
                  {filteredCities.map(city => {
                    const cs = cityStats[city.name];
                    const searched = !!cs;
                    const successRate = cs && cs.candidates > 0 ? ((cs.leads / cs.candidates) * 100).toFixed(0) : null;
                    return (
                      <button
                        key={city.name}
                        onClick={() => handleSelectCity(city)}
                        className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors flex items-center justify-between text-sm gap-2"
                      >
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${searched ? 'bg-green' : 'bg-muted-foreground/40'}`} />
                            <span className="font-medium text-foreground">{city.name}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground ml-3">
                            {searched
                              ? `${cs.runs} run${cs.runs !== 1 ? 's' : ''} · ${cs.leads} leads · ${successRate}% success`
                              : 'Not yet searched'}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{city.type} · {city.density === 'HIGH' ? '🔴' : city.density === 'MED' ? '🟡' : '🟢'} {city.density}</span>
                      </button>
                    );
                  })}
                  {filteredCities.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No cities match</div>
                  )}
                </div>
              )}
            </div>

            {/* Select all unsearched + Map picker */}
            <div className="flex items-center gap-2 mt-1.5">
              <button
                onClick={() => {
                  const selectedNames = new Set(selectedCities.map(c => c.name));
                  const unsearched = countryCities.filter(c => !cityStats[c.name] && !selectedNames.has(c.name));
                  if (unsearched.length === 0) { toast.info('All cities have been searched!'); return; }
                  setSelectedCities(prev => [...prev, ...unsearched]);
                  toast.success(`Added ${unsearched.length} unsearched cities`);
                }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <Target size={12} />
                Select all unsearched ({countryCities.filter(c => !cityStats[c.name] && !selectedCities.some(s => s.name === c.name)).length})
              </button>
              <span className="text-muted-foreground/30">·</span>
              <button
                onClick={() => setMapOpen(o => !o)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Map size={12} />
                {mapOpen ? 'Hide map' : 'Pick cities from map'}
                <ChevronDown size={10} className={`transition-transform ${mapOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {mapOpen && (
              <div className="h-[350px] mt-2 rounded-lg overflow-hidden border border-border">
                <CityPickerMap
                  selectedCities={selectedCities}
                  cityStats={cityStats}
                  onSelectCity={handleSelectCity}
                  onRemoveCity={handleRemoveCity}
                  country={country}
                />
              </div>
            )}
          </div>

          {/* Presets */}
          {presets && (
            <div>
              <label className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
                <Target size={13} /> Strategy Preset
                <InfoTip text="Presets auto-scale radius, candidate limits, and filters based on city size." />
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
              <InfoTip text="How many call-ready leads do you want per city?" />
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
              <InfoTip text="Each keyword becomes a separate Google search. More keywords = more businesses found." />
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
                <p className="text-[10px] text-muted-foreground">Include businesses that only have an email but no website</p>
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
                    <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">Radius (m)</label>
                    <Input type="number" value={radius} onChange={e => setRadius(Number(e.target.value))} className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">Max Pages/Query</label>
                    <Input type="number" value={maxPages} onChange={e => setMaxPages(Number(e.target.value))} min={1} max={3} className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">Max Candidates</label>
                    <Input type="number" value={maxCandidates} onChange={e => setMaxCandidates(Number(e.target.value))} className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">Max Detail Lookups</label>
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
              {(() => {
                const batches: Record<string, FinderRun[]> = {};
                const soloRuns: FinderRun[] = [];
                for (const run of runs) {
                  if (run.batch_id) {
                    if (!batches[run.batch_id]) batches[run.batch_id] = [];
                    batches[run.batch_id].push(run);
                  } else {
                    soloRuns.push(run);
                  }
                }
                type DisplayItem = { type: 'batch'; batchId: string; runs: FinderRun[]; created_at: string } | { type: 'solo'; run: FinderRun; created_at: string };
                const items: DisplayItem[] = [
                  ...Object.entries(batches).map(([batchId, bRuns]) => ({
                    type: 'batch' as const, batchId, runs: bRuns, created_at: bRuns[0].created_at,
                  })),
                  ...soloRuns.map(run => ({ type: 'solo' as const, run, created_at: run.created_at })),
                ];
                items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

                return items.map(item => {
                  if (item.type === 'batch') {
                    const bRuns = item.runs;
                    const cities = bRuns.map(r => r.city);
                    const doneCount = bRuns.filter(r => r.status === 'done').length;
                    const runningCount = bRuns.filter(r => r.status === 'running' || r.status === 'pending').length;
                    const totalLeads = bRuns.reduce((sum, r) => sum + ((r.stats as any)?.noWebsiteWithPhone ?? 0) + ((r.stats as any)?.noWebsiteEmailOnly ?? 0), 0);
                    const allDone = doneCount === bRuns.length;
                    const anyRunning = runningCount > 0;

                    return (
                      <Link key={item.batchId} to={`/finder/batch/${item.batchId}`} className="block p-3 bg-card border border-border rounded-lg hover:border-primary/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="shrink-0">
                            {allDone && <CheckCircle size={14} className="text-green" />}
                            {anyRunning && <Loader2 size={14} className="animate-spin text-primary" />}
                            {!allDone && !anyRunning && <Clock size={14} className="text-amber" />}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">
                              {cities.length} cities — {cities.slice(0, 4).join(', ')}{cities.length > 4 ? ` +${cities.length - 4}` : ''}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(item.created_at), 'MMM d, HH:mm')} · {doneCount}/{bRuns.length} done
                              {totalLeads > 0 && ` · ${totalLeads} leads`}
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  } else {
                    const run = item.run;
                    const progress = autoAddProgress[run.id];
                    const isAutoAdding = progress && !progress.done;
                    const autoAddDone = progress?.done && progress.total > 0;
                    return (
                      <Link key={run.id} to={`/finder/runs/${run.id}`} className="block p-3 bg-card border border-border rounded-lg hover:border-primary/30 transition-colors">
                        <div className="flex items-center gap-3">
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
                          {isAutoAdding && (
                            <span className="text-[10px] text-primary flex items-center gap-1 shrink-0">
                              <Loader2 size={10} className="animate-spin" /> Adding {progress.added}/{progress.total}
                            </span>
                          )}
                          {autoAddDone && (
                            <span className="text-[10px] flex items-center gap-1 shrink-0">
                              {progress.added > 0 ? (
                                <span className="text-green flex items-center gap-1"><UserPlus size={10} /> {progress.added} added</span>
                              ) : (
                                <span className="text-muted-foreground">{progress.duplicated > 0 ? `${progress.duplicated} already in CRM` : '0 new'}</span>
                              )}
                            </span>
                          )}
                        </div>
                        {isAutoAdding && (
                          <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary transition-all" style={{ width: `${(progress.added + progress.duplicated) / progress.total * 100}%` }} />
                          </div>
                        )}
                      </Link>
                    );
                  }
                });
              })()}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
