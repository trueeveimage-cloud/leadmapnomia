import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  BarChart3,
  CheckCircle,
  Globe,
  Layers,
  Loader2,
  Mail,
  MapPin,
  Radar,
  Search,
  SlidersHorizontal,
  StopCircle,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCRM } from '@/context/CRMContext';
import { createFinderRun, fetchFinderRuns, FinderRun, runFinderSearch } from '@/lib/finder';
import { COUNTRY_LABELS, Country, CityProfile, findCity, getCitiesByCountry } from '@/lib/cities';
import { createNotification, determineSection, Lead, updateLead } from '@/lib/supabase';

const COUNTRIES: Country[] = ['SE', 'NO', 'DK', 'UK', 'ES'];

const PRESETS = [
  {
    label: 'Leadmap best fit',
    description: 'Service businesses that usually publish emails and can buy websites or funnels.',
    niches: {
      SE: ['advokat', 'redovisningsbyra', 'maklare', 'tandlakare', 'marknadsbyra', 'webbyra', 'byggforetag'],
      NO: ['advokat', 'regnskapsforer', 'eiendomsmegler', 'tannlege', 'markedsbyra', 'webbyra', 'byggfirma'],
      DK: ['advokat', 'revisor', 'ejendomsmaegler', 'tandlaege', 'marketing bureau', 'webbureau', 'byggefirma'],
      UK: ['solicitor', 'accountant', 'estate agent', 'dental clinic', 'marketing agency', 'web design agency', 'builder'],
      ES: ['abogado', 'asesoria', 'inmobiliaria', 'clinica dental', 'agencia marketing', 'diseno web', 'constructora'],
    },
  },
  {
    label: 'Professional services',
    description: 'Law, finance, consulting, agencies, and B2B firms.',
    niches: {
      SE: ['advokat', 'jurist', 'redovisningsbyra', 'revisor', 'konsult', 'arkitekt', 'ingenjor'],
      NO: ['advokat', 'jurist', 'regnskapsforer', 'revisor', 'konsulent', 'arkitekt', 'ingenior'],
      DK: ['advokat', 'jurist', 'revisor', 'bogholder', 'konsulent', 'arkitekt', 'ingenior'],
      UK: ['solicitor', 'law firm', 'accountant', 'consultant', 'architect', 'engineering consultant'],
      ES: ['abogado', 'asesoria fiscal', 'consultor', 'arquitecto', 'ingenieria', 'gestoria'],
    },
  },
  {
    label: 'Health and beauty',
    description: 'Clinics with high inbound volume and strong booking value.',
    niches: {
      SE: ['tandlakare', 'klinik', 'fysioterapi', 'kiropraktor', 'frisor', 'hudvard'],
      NO: ['tannlege', 'klinikk', 'fysioterapi', 'kiropraktor', 'frisor', 'hudpleie'],
      DK: ['tandlaege', 'klinik', 'fysioterapi', 'kiropraktor', 'frisor', 'hudpleje'],
      UK: ['dental clinic', 'physiotherapy', 'chiropractor', 'beauty salon', 'skin clinic'],
      ES: ['clinica dental', 'fisioterapia', 'quiropractico', 'peluqueria', 'clinica estetica'],
    },
  },
  {
    label: 'Property and trades',
    description: 'Businesses where local demand and web visibility matter.',
    niches: {
      SE: ['maklare', 'fastighetsbyra', 'byggforetag', 'rorlaggare', 'elektriker', 'malare'],
      NO: ['eiendomsmegler', 'byggfirma', 'rorlegger', 'elektriker', 'maler', 'taktekker'],
      DK: ['ejendomsmaegler', 'byggefirma', 'vvs', 'elektriker', 'maler', 'tagdaekker'],
      UK: ['estate agent', 'builder', 'plumber', 'electrician', 'painter', 'roofer'],
      ES: ['inmobiliaria', 'constructora', 'fontanero', 'electricista', 'pintor', 'reformas'],
    },
  },
] satisfies Array<{
  label: string;
  description: string;
  niches: Record<Country, string[]>;
}>;

type SavedProductFilter = 'leadmap' | 'nomia' | 'all';
type SavedCountryFilter = Country | 'all';

type ScrapeLead = Pick<
  Lead,
  'id' | 'name' | 'website' | 'phone' | 'email' | 'section' | 'facebook_url' | 'instagram_url' | 'country' | 'city' | 'address'
> & {
  product?: string | null;
};

type SavedStats = {
  totalSaved: number;
  withWebsite: number;
  missingEmail: number;
  eligible: number;
  countryCounts: Record<Country, number>;
};

type ScrapeProgress = {
  done: number;
  eligible: number;
  found: number;
  failed: number;
  totalSaved: number;
  withWebsite: number;
  current: string;
};

function uniqueList(values: string[]) {
  return Array.from(new Set(values.map(v => v.trim()).filter(Boolean)));
}

function parseKeywords(text: string) {
  return uniqueList(text.split(/[\n,]+/).map(v => v.trim()));
}

function getCityKey(name: string) {
  return name.trim().toLowerCase();
}

function makeBatchId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function hasWebsite(lead: ScrapeLead) {
  return !!lead.website?.trim();
}

function missingEmail(lead: ScrapeLead) {
  return !lead.email?.trim();
}

function detectLeadMarket(lead: ScrapeLead): Country | null {
  const explicit = (lead.country || '').toUpperCase();
  if (COUNTRIES.includes(explicit as Country)) return explicit as Country;

  const text = `${lead.city || ''} ${lead.address || ''} ${lead.phone || ''}`.toLowerCase();
  if (/\+46|\b0[1-9]\d/.test(text) || text.includes('sweden') || text.includes('sverige')) return 'SE';
  if (/\+47/.test(text) || text.includes('norway') || text.includes('norge')) return 'NO';
  if (/\+45/.test(text) || text.includes('denmark') || text.includes('danmark')) return 'DK';
  if (/\+44/.test(text) || text.includes('united kingdom') || text.includes('england')) return 'UK';
  if (/\+34/.test(text) || text.includes('spain') || text.includes('espana')) return 'ES';

  for (const country of COUNTRIES) {
    if (getCitiesByCountry(country).some(city => text.includes(city.name.toLowerCase()))) return country;
  }

  return null;
}

function matchesSavedFilters(lead: ScrapeLead, country: SavedCountryFilter, city: string) {
  if (!hasWebsite(lead) || !missingEmail(lead)) return false;
  if (country !== 'all' && detectLeadMarket(lead) !== country) return false;
  const cityNeedle = city.trim().toLowerCase();
  if (!cityNeedle) return true;
  return `${lead.city || ''} ${lead.address || ''}`.toLowerCase().includes(cityNeedle);
}

async function fetchSavedLeadPool(product: SavedProductFilter): Promise<ScrapeLead[]> {
  const all: ScrapeLead[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    let query = supabase
      .from('leads')
      .select('id, name, website, phone, email, section, facebook_url, instagram_url, country, city, address, product')
      .order('created_at', { ascending: false });

    if (product !== 'all') query = query.eq('product', product);

    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;

    all.push(...(data as unknown as ScrapeLead[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

export default function EmailFinderPage() {
  const navigate = useNavigate();
  const { refreshCounts } = useCRM();
  const scrapeStopRef = useRef(false);

  const [country, setCountry] = useState<Country>('SE');
  const [presetIndex, setPresetIndex] = useState(0);
  const [keywordsText, setKeywordsText] = useState(PRESETS[0].niches.SE.join('\n'));
  const [selectedCityNames, setSelectedCityNames] = useState<string[]>(['Stockholm', 'Goteborg', 'Malmo']);
  const [citySearch, setCitySearch] = useState('');
  const [targetLeads, setTargetLeads] = useState(100);
  const [radius, setRadius] = useState(5000);
  const [maxPages, setMaxPages] = useState(4);
  const [maxCandidates, setMaxCandidates] = useState(400);
  const [maxDetails, setMaxDetails] = useState(180);
  const [minRating, setMinRating] = useState(3.4);
  const [minReviews, setMinReviews] = useState(5);
  const [requirePhone, setRequirePhone] = useState(false);
  const [running, setRunning] = useState(false);

  const [runs, setRuns] = useState<FinderRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);

  const [savedProduct, setSavedProduct] = useState<SavedProductFilter>('leadmap');
  const [savedCountry, setSavedCountry] = useState<SavedCountryFilter>('SE');
  const [savedCity, setSavedCity] = useState('');
  const [savedLimit, setSavedLimit] = useState(100);
  const [savedStats, setSavedStats] = useState<SavedStats>({ totalSaved: 0, withWebsite: 0, missingEmail: 0, eligible: 0, countryCounts: { SE: 0, NO: 0, DK: 0, UK: 0, ES: 0 } });
  const [loadingSavedStats, setLoadingSavedStats] = useState(false);
  const [scrapingExisting, setScrapingExisting] = useState(false);
  const [existingProgress, setExistingProgress] = useState<ScrapeProgress>({ done: 0, eligible: 0, found: 0, failed: 0, totalSaved: 0, withWebsite: 0, current: '' });

  useEffect(() => {
    fetchFinderRuns()
      .then(setRuns)
      .catch(error => {
        console.error('finder runs', error);
        toast.error('Could not load coverage history');
      })
      .finally(() => setRunsLoading(false));
  }, []);

  useEffect(() => {
    setKeywordsText(PRESETS[presetIndex].niches[country].join('\n'));
  }, [country, presetIndex]);

  useEffect(() => {
    const topCities = getCitiesByCountry(country).slice(0, 3).map(city => city.name);
    setSelectedCityNames(topCities);
    setSavedCountry(country);
  }, [country]);

  const availableCities = useMemo(() => getCitiesByCountry(country), [country]);
  const selectedCities = useMemo(() => {
    const selected = new Set(selectedCityNames.map(getCityKey));
    return availableCities.filter(city => selected.has(getCityKey(city.name)));
  }, [availableCities, selectedCityNames]);

  const countryRuns = useMemo(() => {
    return runs.filter(run => findCity(run.city)?.country === country);
  }, [runs, country]);

  const cityRunCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of countryRuns) counts.set(getCityKey(run.city), (counts.get(getCityKey(run.city)) || 0) + 1);
    return counts;
  }, [countryRuns]);

  const coverageStats = useMemo(() => {
    const covered = availableCities.filter(city => cityRunCounts.has(getCityKey(city.name)));
    const totalCandidates = countryRuns.reduce((sum, run) => sum + ((run.stats as any)?.candidatesFound || 0), 0);
    const savedLeads = countryRuns.reduce((sum, run) => {
      const stats = run.stats as any;
      return sum + (stats?.noWebsiteWithPhone || 0) + (stats?.noWebsiteEmailOnly || 0);
    }, 0);
    const nextCities = availableCities
      .filter(city => !cityRunCounts.has(getCityKey(city.name)))
      .sort((a, b) => b.population - a.population)
      .slice(0, 8);

    return { covered, totalCandidates, savedLeads, nextCities };
  }, [availableCities, cityRunCounts, countryRuns]);

  const filteredCities = useMemo(() => {
    const q = citySearch.trim().toLowerCase();
    const source = q ? availableCities.filter(city => `${city.name} ${city.type}`.toLowerCase().includes(q)) : availableCities;
    return source.slice(0, 28);
  }, [availableCities, citySearch]);

  const keywords = useMemo(() => parseKeywords(keywordsText), [keywordsText]);

  const estimatedSearches = Math.max(1, keywords.length) * selectedCities.length * maxPages;
  const estimatedDetails = selectedCities.length * maxDetails;

  const toggleCity = (city: CityProfile) => {
    const key = getCityKey(city.name);
    setSelectedCityNames(prev => {
      const exists = prev.some(name => getCityKey(name) === key);
      return exists ? prev.filter(name => getCityKey(name) !== key) : [...prev, city.name];
    });
  };

  const selectTopCities = (count: number) => {
    setSelectedCityNames(availableCities.slice(0, count).map(city => city.name));
  };

  const selectUncoveredCities = () => {
    const names = availableCities
      .filter(city => !cityRunCounts.has(getCityKey(city.name)))
      .sort((a, b) => b.population - a.population)
      .slice(0, 12)
      .map(city => city.name);
    setSelectedCityNames(names.length ? names : availableCities.slice(0, 6).map(city => city.name));
  };

  const loadSavedStats = async () => {
    setLoadingSavedStats(true);
    try {
      const leads = await fetchSavedLeadPool(savedProduct);
      const withWebsite = leads.filter(hasWebsite);
      const missing = withWebsite.filter(missingEmail);
      const countryCounts: Record<Country, number> = { SE: 0, NO: 0, DK: 0, UK: 0, ES: 0 };

      for (const lead of missing) {
        const market = detectLeadMarket(lead);
        if (market) countryCounts[market]++;
      }

      setSavedStats({
        totalSaved: leads.length,
        withWebsite: withWebsite.length,
        missingEmail: missing.length,
        eligible: missing.filter(lead => matchesSavedFilters(lead, savedCountry, savedCity)).length,
        countryCounts,
      });
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load saved lead stats');
    } finally {
      setLoadingSavedStats(false);
    }
  };

  useEffect(() => {
    loadSavedStats();
  }, [savedProduct, savedCountry, savedCity]);

  const startFinder = async () => {
    if (keywords.length === 0) {
      toast.error('Add at least one niche keyword');
      return;
    }
    if (selectedCities.length === 0) {
      toast.error('Choose at least one city');
      return;
    }

    setRunning(true);
    try {
      const cappedDetails = Math.max(maxDetails, targetLeads);
      const batchId = selectedCities.length > 1 ? makeBatchId() : null;
      const batchLabel = `Leadmap Email Finder - ${COUNTRY_LABELS[country]} - ${selectedCities.length} cities`;
      const createdRuns: FinderRun[] = [];

      for (const city of selectedCities) {
        const run = await createFinderRun({
          city: city.name,
          mode: 'niche',
          keywords,
          radius,
          maxPages,
          maxCandidates,
          maxDetails: cappedDetails,
          minRating,
          minReviews,
          requirePhone,
          findGmailOnly: true,
          batchId,
          batchLabel: batchId ? batchLabel : `Leadmap Email Finder - ${city.name}`,
        });
        createdRuns.push(run);
      }

      for (const run of createdRuns) {
        runFinderSearch(run.id, {
          city: run.city,
          keywords,
          radius,
          maxPages,
          maxCandidates,
          maxDetails: cappedDetails,
          minRating,
          minReviews,
          requirePhone,
          findGmailOnly: true,
        }).catch(error => console.error('finder-search', run.id, error));
      }

      toast.success(`Started ${createdRuns.length} Leadmap email finder run${createdRuns.length === 1 ? '' : 's'}`);
      navigate(batchId ? `/finder/batch/${batchId}` : `/finder/runs/${createdRuns[0].id}`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to start finder');
    } finally {
      setRunning(false);
    }
  };

  const stopScrapingExisting = () => {
    scrapeStopRef.current = true;
    toast.info('Stopping after the current batch finishes');
  };

  const scrapeExistingLeads = async () => {
    setScrapingExisting(true);
    scrapeStopRef.current = false;
    setExistingProgress({ done: 0, eligible: 0, found: 0, failed: 0, totalSaved: 0, withWebsite: 0, current: '' });

    try {
      const leads = await fetchSavedLeadPool(savedProduct);
      const targets = leads
        .filter(lead => matchesSavedFilters(lead, savedCountry, savedCity))
        .slice(0, savedLimit);

      const withWebsite = leads.filter(hasWebsite).length;
      const missing = leads.filter(lead => hasWebsite(lead) && missingEmail(lead)).length;

      setExistingProgress({ done: 0, eligible: targets.length, found: 0, failed: 0, totalSaved: leads.length, withWebsite, current: '' });
      setSavedStats(prev => ({ ...prev, totalSaved: leads.length, withWebsite, missingEmail: missing, eligible: targets.length }));

      if (targets.length === 0) {
        toast.info('No saved leads match those scrape filters');
        return;
      }

      let found = 0;
      let failed = 0;
      let done = 0;

      for (let i = 0; i < targets.length; i += 4) {
        if (scrapeStopRef.current) break;

        const batchTargets = targets.slice(i, i + 4);
        const batch = batchTargets.map(lead => ({
          leadId: lead.id,
          website: lead.website,
          businessName: lead.name,
        }));

        setExistingProgress({ done, eligible: targets.length, found, failed, totalSaved: leads.length, withWebsite, current: batchTargets[0]?.name || '' });

        try {
          const { data, error } = await supabase.functions.invoke('scrape-emails', { body: { urls: batch } });
          if (error) throw error;

          const results = Array.isArray(data?.results) ? data.results : [];
          const resultMap = new Map(results.map((result: any) => [result.leadId, result]));

          for (const lead of batchTargets) {
            const result: any = resultMap.get(lead.id);
            const email = result?.email || result?.emails?.[0];

            if (!email) {
              failed++;
              continue;
            }

            await updateLead(lead.id, {
              email,
              email_source: result.source || 'website_scrape',
              section: determineSection({ phone: lead.phone, email }),
              facebook_url: result.facebook_url || lead.facebook_url,
              instagram_url: result.instagram_url || lead.instagram_url,
            });
            found++;
          }
        } catch (error) {
          console.error('Existing lead scrape batch failed:', error);
          failed += batchTargets.length;
        }

        done = Math.min(i + 4, targets.length);
        setExistingProgress({ done, eligible: targets.length, found, failed, totalSaved: leads.length, withWebsite, current: '' });
      }

      await refreshCounts();
      await loadSavedStats();
      await createNotification({
        type: 'email_scrape_done',
        title: 'Leadmap email scrape finished',
        message: `Found ${found} emails from ${done} checked saved leads.`,
        payload: { found, checked: done, failed, filters: { savedProduct, savedCountry, savedCity, savedLimit } },
      });
      toast.success(`Found ${found} emails from ${done} checked leads`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to scrape saved leads');
    } finally {
      setScrapingExisting(false);
      scrapeStopRef.current = false;
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl p-4 sm:p-6 space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Mail className="h-6 w-6 text-primary" />
              Leadmap Email Scraper
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">Gmail-first</Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Choose markets, scan cities, scrape saved websites, and keep coverage visible while building Leadmap lists.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/finder/coverage">
                <Radar className="h-4 w-4 mr-2" />
                Coverage map
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/finder">
                <Search className="h-4 w-4 mr-2" />
                Old finder
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)] gap-5">
          <div className="space-y-5">
            <Card className="p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary" />
                    Market and city targeting
                  </h2>
                  <p className="text-sm text-muted-foreground">Pick the country, then choose one city or launch a whole batch.</p>
                </div>
                <Badge variant="secondary">{selectedCities.length} cities</Badge>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {COUNTRIES.map(item => {
                  const stats = savedStats.countryCounts[item] || 0;
                  const isActive = country === item;
                  return (
                    <button
                      key={item}
                      onClick={() => setCountry(item)}
                      className={`rounded-md border px-3 py-2 text-left transition-colors ${
                        isActive ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background hover:bg-accent'
                      }`}
                    >
                      <div className="text-sm font-semibold">{COUNTRY_LABELS[item]}</div>
                      <div className="text-[11px] text-muted-foreground">{stats.toLocaleString()} saved to scrape</div>
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1fr)]">
                <div className="space-y-3">
                  <Input
                    value={citySearch}
                    onChange={event => setCitySearch(event.target.value)}
                    placeholder="Search city..."
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => selectTopCities(5)} type="button">Top 5</Button>
                    <Button variant="outline" onClick={() => selectTopCities(12)} type="button">Top 12</Button>
                    <Button variant="outline" onClick={selectUncoveredCities} type="button">Uncovered</Button>
                    <Button variant="outline" onClick={() => setSelectedCityNames([])} type="button">Clear</Button>
                  </div>
                  <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
                    <div className="font-medium text-foreground mb-1">Recommended next</div>
                    {coverageStats.nextCities.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {coverageStats.nextCities.slice(0, 5).map(city => (
                          <button
                            key={city.name}
                            onClick={() => toggleCity(city)}
                            className="rounded-full border border-border px-2 py-1 hover:bg-accent"
                          >
                            {city.name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span>Every tracked city has coverage.</span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {filteredCities.map(city => {
                      const isSelected = selectedCityNames.some(name => getCityKey(name) === getCityKey(city.name));
                      const runsCount = cityRunCounts.get(getCityKey(city.name)) || 0;
                      return (
                        <button
                          key={city.name}
                          onClick={() => toggleCity(city)}
                          className={`min-h-[66px] rounded-md border px-3 py-2 text-left transition-colors ${
                            isSelected ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-accent'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium truncate">{city.name}</span>
                            {isSelected && <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-1">{city.type} - {city.population.toLocaleString()}</div>
                          <div className="text-[10px] text-muted-foreground">{runsCount ? `${runsCount} previous runs` : 'not scanned'}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-4 sm:p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  Finder run setup
                </h2>
                <p className="text-sm text-muted-foreground">Runs Google Places discovery, saves candidates, then lets the scraper pull emails from websites.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="space-y-2">
                    {PRESETS.map((preset, index) => (
                      <button
                        key={preset.label}
                        onClick={() => setPresetIndex(index)}
                        className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                          presetIndex === index ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'
                        }`}
                      >
                        <div className="text-sm font-semibold">{preset.label}</div>
                        <div className="text-[11px] text-muted-foreground">{preset.description}</div>
                      </button>
                    ))}
                  </div>
                  <Textarea
                    value={keywordsText}
                    onChange={event => setKeywordsText(event.target.value)}
                    className="min-h-[170px]"
                    placeholder="One niche keyword per line"
                  />
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">Target leads</span>
                      <Input type="number" min={10} max={1000} value={targetLeads} onChange={event => setTargetLeads(Number(event.target.value) || 100)} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">Radius meters</span>
                      <Input type="number" min={1000} step={500} value={radius} onChange={event => setRadius(Number(event.target.value) || 5000)} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">Pages per keyword</span>
                      <Input type="number" min={1} max={10} value={maxPages} onChange={event => setMaxPages(Number(event.target.value) || 4)} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">Max candidates</span>
                      <Input type="number" min={50} value={maxCandidates} onChange={event => setMaxCandidates(Number(event.target.value) || 400)} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">Max detail lookups</span>
                      <Input type="number" min={25} value={maxDetails} onChange={event => setMaxDetails(Number(event.target.value) || 180)} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">Min rating</span>
                      <Input type="number" min={0} max={5} step={0.1} value={minRating} onChange={event => setMinRating(Number(event.target.value) || 0)} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">Min reviews</span>
                      <Input type="number" min={0} value={minReviews} onChange={event => setMinReviews(Number(event.target.value) || 0)} />
                    </label>
                    <div className="rounded-md border border-border px-3 py-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Require phone</span>
                      <Switch checked={requirePhone} onCheckedChange={setRequirePhone} />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-md border border-border p-3">
                      <div className="text-[11px] text-muted-foreground">Keywords</div>
                      <div className="text-lg font-bold">{keywords.length}</div>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <div className="text-[11px] text-muted-foreground">Search pages</div>
                      <div className="text-lg font-bold">{estimatedSearches}</div>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <div className="text-[11px] text-muted-foreground">Detail cap</div>
                      <div className="text-lg font-bold">{estimatedDetails}</div>
                    </div>
                  </div>

                  <Button onClick={startFinder} disabled={running} className="w-full" size="lg">
                    {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                    Start Leadmap email run
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-5">
            <Card className="p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <Radar className="h-4 w-4 text-primary" />
                    Coverage snapshot
                  </h2>
                  <p className="text-sm text-muted-foreground">Use this to avoid hitting the same cities blind.</p>
                </div>
                {runsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-border p-3">
                  <div className="text-[11px] text-muted-foreground">Cities covered</div>
                  <div className="text-xl font-bold">{coverageStats.covered.length}/{availableCities.length}</div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="text-[11px] text-muted-foreground">Finder runs</div>
                  <div className="text-xl font-bold">{countryRuns.length}</div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="text-[11px] text-muted-foreground">Candidates</div>
                  <div className="text-xl font-bold">{coverageStats.totalCandidates.toLocaleString()}</div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="text-[11px] text-muted-foreground">Saved leads</div>
                  <div className="text-xl font-bold">{coverageStats.savedLeads.toLocaleString()}</div>
                </div>
              </div>

              <div className="rounded-md border border-border overflow-hidden">
                <div className="h-3 bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${availableCities.length ? (coverageStats.covered.length / availableCities.length) * 100 : 0}%` }}
                  />
                </div>
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {COUNTRY_LABELS[country]} map coverage is {availableCities.length ? Math.round((coverageStats.covered.length / availableCities.length) * 100) : 0}%.
                </div>
              </div>

              <Button variant="outline" className="w-full" asChild>
                <Link to="/finder/coverage">
                  <MapPin className="h-4 w-4 mr-2" />
                  Open full coverage map
                </Link>
              </Button>
            </Card>

            <Card className="p-4 sm:p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    Scrape saved CRM leads
                  </h2>
                  <p className="text-sm text-muted-foreground">Scan saved Leadmap websites that still have no email.</p>
                </div>
                <Button variant="outline" size="sm" onClick={loadSavedStats} disabled={loadingSavedStats}>
                  {loadingSavedStats ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Product</span>
                  <select
                    value={savedProduct}
                    onChange={event => setSavedProduct(event.target.value as SavedProductFilter)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="leadmap">Leadmap</option>
                    <option value="nomia">Nomia</option>
                    <option value="all">All CRM</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Country</span>
                  <select
                    value={savedCountry}
                    onChange={event => setSavedCountry(event.target.value as SavedCountryFilter)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="all">All countries</option>
                    {COUNTRIES.map(item => <option key={item} value={item}>{COUNTRY_LABELS[item]}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">City contains</span>
                  <Input value={savedCity} onChange={event => setSavedCity(event.target.value)} placeholder="Optional" />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Max to scrape now</span>
                  <Input type="number" min={4} max={1000} value={savedLimit} onChange={event => setSavedLimit(Number(event.target.value) || 100)} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md border border-border p-3">
                  <div className="text-[11px] text-muted-foreground">Saved leads</div>
                  <div className="font-bold">{savedStats.totalSaved.toLocaleString()}</div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="text-[11px] text-muted-foreground">With website</div>
                  <div className="font-bold">{savedStats.withWebsite.toLocaleString()}</div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="text-[11px] text-muted-foreground">Missing email</div>
                  <div className="font-bold">{savedStats.missingEmail.toLocaleString()}</div>
                </div>
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                  <div className="text-[11px] text-muted-foreground">Eligible now</div>
                  <div className="font-bold">{savedStats.eligible.toLocaleString()}</div>
                </div>
              </div>

              {scrapingExisting && (
                <div className="rounded-md border border-border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground truncate">{existingProgress.current || 'Scraping saved leads'}</span>
                    <span className="font-medium">{existingProgress.found}/{existingProgress.done} found</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${existingProgress.eligible ? (existingProgress.done / existingProgress.eligible) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {existingProgress.done.toLocaleString()} checked - {existingProgress.failed.toLocaleString()} no email or failed - {existingProgress.eligible.toLocaleString()} queued
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={scrapeExistingLeads} disabled={scrapingExisting} className="flex-1" size="lg">
                  {scrapingExisting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                  {scrapingExisting ? 'Scraping...' : 'Scrape saved leads'}
                </Button>
                {scrapingExisting && (
                  <Button onClick={stopScrapingExisting} variant="outline" size="lg">
                    <StopCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </Card>

            <Card className="p-4 sm:p-5 space-y-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                Fast workflow
              </h2>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="rounded-md border border-border p-3">1. Pick country and uncovered cities.</div>
                <div className="rounded-md border border-border p-3">2. Use Leadmap best fit or edit the keyword list.</div>
                <div className="rounded-md border border-border p-3">3. Run finder, then scrape saved leads with country filters.</div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
