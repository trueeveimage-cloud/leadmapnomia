import React, { useState, useEffect, useMemo, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { fetchFinderRuns, FinderRun } from '@/lib/finder';
import { ALL_CITIES, getCitiesByCountry, findCity, Country, COUNTRY_LABELS, COUNTRY_CENTER } from '@/lib/cities';
import { Link } from 'react-router-dom';
import { MapPin, Search, CheckCircle, Phone, Globe, BarChart2 } from 'lucide-react';
import { format } from 'date-fns';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import InfoTip from '@/components/InfoTip';

interface RunWithCoords extends FinderRun {
  lat: number;
  lng: number;
}

function LeafletMap({ runsWithCoords, runs, country }: { runsWithCoords: RunWithCoords[]; runs: FinderRun[]; country: Country }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const center = COUNTRY_CENTER[country];

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const map = L.map(mapRef.current, {
      center: [center.lat, center.lng],
      zoom: center.zoom,
      zoomControl: true,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    }).addTo(map);
    mapInstanceRef.current = map;
    return () => { map.remove(); mapInstanceRef.current = null; };
  }, []);

  // Re-center on country change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.setView([center.lat, center.lng], center.zoom);
  }, [country, center]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.eachLayer(layer => {
      if (layer instanceof L.Circle || layer instanceof L.CircleMarker) {
        map.removeLayer(layer);
      }
    });

    const cityRunMap = new Map<string, { runs: number; candidates: number; noWebPhone: number; noWebEmail: number }>();
    for (const run of runs) {
      const key = run.city.toLowerCase();
      const existing = cityRunMap.get(key) || { runs: 0, candidates: 0, noWebPhone: 0, noWebEmail: 0 };
      existing.runs++;
      existing.candidates += (run.stats as any)?.candidatesFound || 0;
      existing.noWebPhone += (run.stats as any)?.noWebsiteWithPhone || 0;
      existing.noWebEmail += (run.stats as any)?.noWebsiteEmailOnly || 0;
      cityRunMap.set(key, existing);
    }

    const countryCities = getCitiesByCountry(country);

    countryCities
      .filter(c => !cityRunMap.has(c.name.toLowerCase()))
      .forEach(city => {
        L.circleMarker([city.lat, city.lng], {
          radius: 5,
          color: 'hsl(0, 0%, 40%)',
          fillColor: 'hsl(0, 0%, 30%)',
          fillOpacity: 0.5,
          weight: 1.5,
        })
          .bindTooltip(`<strong>${city.name}</strong><br/><span style="color:#f87171;">Not yet scanned</span><br/>Pop: ${city.population.toLocaleString()}`, { direction: 'top' })
          .addTo(map);
      });

    runsWithCoords
      .filter(r => {
        const city = findCity(r.city);
        return city?.country === country;
      })
      .forEach(run => {
        const cityKey = run.city.toLowerCase();
        const agg = cityRunMap.get(cityKey);
        const totalLeads = agg ? agg.noWebPhone + agg.noWebEmail : 0;
        const totalCands = agg ? agg.candidates : 0;
        const successRate = totalCands > 0 ? ((totalLeads / totalCands) * 100).toFixed(1) : '0';
        const color = run.status === 'done' ? 'hsl(142, 69%, 45%)' : 'hsl(213, 94%, 58%)';

        L.circle([run.lat, run.lng], {
          radius: run.radius || 1500,
          color,
          fillColor: color,
          fillOpacity: 0.15,
          weight: 2,
        })
          .bindTooltip(`
            <div style="font-size:12px;line-height:1.5;">
              <strong style="font-size:13px;">${run.city}</strong><br/>
              Success rate: <strong>${successRate}%</strong><br/>
              Leads: ${totalLeads} / ${totalCands} candidates<br/>
              Runs: ${agg?.runs || 1}
            </div>
          `, { direction: 'top', sticky: true })
          .bindPopup(`
            <div style="min-width:180px;font-size:12px;">
              <strong style="font-size:13px;">${run.city}</strong><br/>
              Status: ${run.status}<br/>
              Keywords: ${(run.keywords || []).length}<br/>
              Candidates: ${(run.stats as any)?.candidatesFound || 0}<br/>
              No Web + Phone: ${(run.stats as any)?.noWebsiteWithPhone || 0}<br/>
              Success rate: <strong>${successRate}%</strong><br/>
              Radius: ${run.radius}m<br/>
              ${format(new Date(run.created_at), 'MMM d, HH:mm')}<br/>
              <a href="/finder/runs/${run.id}" style="color:#60a5fa;">View results →</a>
            </div>
          `)
          .addTo(map);
      });
  }, [runsWithCoords, runs, country]);

  return <div ref={mapRef} className="h-full w-full" />;
}

export default function FinderCoveragePage() {
  const [runs, setRuns] = useState<FinderRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState<Country>('SE');

  useEffect(() => {
    fetchFinderRuns().then(r => { setRuns(r); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const runsWithCoords = useMemo<RunWithCoords[]>(() => {
    return runs.map(run => {
      const city = findCity(run.city);
      if (!city) return null;
      return { ...run, lat: city.lat, lng: city.lng };
    }).filter(Boolean) as RunWithCoords[];
  }, [runs]);

  // Filter runs by country
  const countryRuns = useMemo(() => {
    return runs.filter(r => {
      const city = findCity(r.city);
      return city?.country === country;
    });
  }, [runs, country]);

  const countryCities = getCitiesByCountry(country);

  const totalRuns = countryRuns.length;
  const totalCandidates = countryRuns.reduce((s, r) => s + ((r.stats as any)?.candidatesFound || 0), 0);
  const totalDetails = countryRuns.reduce((s, r) => s + ((r.stats as any)?.detailsFetched || 0), 0);
  const totalNoWebPhone = countryRuns.reduce((s, r) => s + ((r.stats as any)?.noWebsiteWithPhone || 0), 0);
  const totalNoWebEmail = countryRuns.reduce((s, r) => s + ((r.stats as any)?.noWebsiteEmailOnly || 0), 0);
  const totalLeads = totalNoWebPhone + totalNoWebEmail;
  const avgSuccessRate = totalCandidates > 0 ? ((totalLeads / totalCandidates) * 100).toFixed(1) : '0';
  const estSpend = (totalDetails * 0.017 + totalRuns * 2 * 0.032).toFixed(2);
  const scannedCities = new Set(countryRuns.map(r => r.city.toLowerCase()));
  const unsearchedCount = countryCities.filter(c => !scannedCities.has(c.name.toLowerCase())).length;

  // Per-country summary for the tabs
  const perCountryStats = useMemo(() => {
    const stats: Record<Country, { runs: number; leads: number }> = { SE: { runs: 0, leads: 0 }, NO: { runs: 0, leads: 0 }, DK: { runs: 0, leads: 0 }, UK: { runs: 0, leads: 0 }, ES: { runs: 0, leads: 0 } };
    for (const run of runs) {
      const city = findCity(run.city);
      const c = city?.country || 'SE';
      stats[c].runs++;
      const s = run.stats as any;
      stats[c].leads += (s?.noWebsiteWithPhone ?? 0) + (s?.noWebsiteEmailOnly ?? 0);
    }
    return stats;
  }, [runs]);

  const cityStats = useMemo(() => {
    const map = new Map<string, { runs: number; noWebPhone: number; noWebEmail: number; totalCandidates: number }>();
    for (const run of countryRuns) {
      const key = run.city;
      const existing = map.get(key) || { runs: 0, noWebPhone: 0, noWebEmail: 0, totalCandidates: 0 };
      existing.runs++;
      existing.noWebPhone += (run.stats as any)?.noWebsiteWithPhone || 0;
      existing.noWebEmail += (run.stats as any)?.noWebsiteEmailOnly || 0;
      existing.totalCandidates += (run.stats as any)?.candidatesFound || 0;
      map.set(key, existing);
    }
    return Array.from(map.entries())
      .map(([city, stats]) => ({ city, ...stats, successRate: stats.totalCandidates > 0 ? ((stats.noWebPhone + stats.noWebEmail) / stats.totalCandidates * 100).toFixed(1) : '0' }))
      .sort((a, b) => b.noWebPhone - a.noWebPhone);
  }, [countryRuns]);

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-4 sm:px-6 pt-6 pb-4">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <MapPin size={20} className="text-primary" /> Coverage Map
            <InfoTip text="Visualize where you've scanned for businesses across Leadmap markets." />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Track coverage across supported Leadmap countries and spot the next cities to scan.</p>
        </div>

        {/* Country tabs */}
        <div className="px-4 sm:px-6 pb-4">
          <div className="flex gap-2">
            {(['SE', 'NO', 'DK', 'UK', 'ES'] as Country[]).map(c => {
              const cs = perCountryStats[c];
              const isActive = country === c;
              return (
                <button
                  key={c}
                  onClick={() => setCountry(c)}
                  className={`flex-1 p-3 rounded-lg border text-left transition-all ${
                    isActive
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                      : 'border-border bg-card hover:border-primary/30'
                  }`}
                >
                  <div className="text-sm font-medium text-foreground">{COUNTRY_LABELS[c]}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {cs.runs} runs · {cs.leads} leads
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Stats bar */}
        <div className="px-4 sm:px-6 pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: 'Total Runs', value: totalRuns, icon: <Search size={13} /> },
              { label: 'Cities Covered', value: `${scannedCities.size}/${countryCities.length}`, icon: <MapPin size={13} /> },
              { label: 'Unsearched', value: unsearchedCount, icon: <MapPin size={13} />, warn: unsearchedCount > 0 },
              { label: 'Candidates', value: totalCandidates, icon: <BarChart2 size={13} /> },
              { label: 'Leads Found', value: totalLeads, icon: <Phone size={13} />, highlight: true },
              { label: 'Success Rate', value: `${avgSuccessRate}%`, icon: <CheckCircle size={13} />, highlight: true },
              { label: 'Est. Spend', value: `$${estSpend}`, icon: <span className="text-xs">💰</span> },
            ].map(stat => (
              <div key={stat.label} className={`p-3 rounded-lg border ${stat.highlight ? 'bg-green/10 border-green/30' : stat.warn ? 'bg-amber/10 border-amber/30' : 'bg-card border-border'}`}>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  {stat.icon} {stat.label}
                </div>
                <div className={`text-lg font-bold ${stat.highlight ? 'text-green' : stat.warn ? 'text-amber' : 'text-foreground'}`}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Map */}
        <div className="px-4 sm:px-6 pb-4 flex-1 min-h-[400px]">
          <div className="h-full min-h-[400px] rounded-lg overflow-hidden border border-border bg-card">
            {!loading && <LeafletMap runsWithCoords={runsWithCoords} runs={runs} country={country} />}
          </div>
        </div>

        {/* City coverage table */}
        {cityStats.length > 0 && (
          <div className="px-4 sm:px-6 pb-6">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <BarChart2 size={14} /> {COUNTRY_LABELS[country]} City Rankings
            </h2>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2.5 font-medium">City</th>
                    <th className="text-center px-3 py-2.5 font-medium">Runs</th>
                    <th className="text-center px-3 py-2.5 font-medium">Candidates</th>
                    <th className="text-center px-3 py-2.5 font-medium">Leads</th>
                    <th className="text-center px-3 py-2.5 font-medium">Success Rate</th>
                    <th className="text-center px-3 py-2.5 font-medium">Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {cityStats.map(cs => {
                    const cityProfile = findCity(cs.city);
                    const coverageScore = cs.totalCandidates > 200 ? 'Good' : cs.totalCandidates > 50 ? 'Partial' : 'Low';
                    const coverageColor = coverageScore === 'Good' ? 'text-green' : coverageScore === 'Partial' ? 'text-amber' : 'text-muted-foreground';
                    const rateNum = parseFloat(cs.successRate);
                    const rateColor = rateNum >= 30 ? 'text-green' : rateNum >= 15 ? 'text-amber' : 'text-muted-foreground';
                    return (
                      <tr key={cs.city} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-foreground">
                          {cs.city}
                          {cityProfile && <span className="text-[10px] text-muted-foreground ml-1.5">{cityProfile.type}</span>}
                        </td>
                        <td className="text-center px-3 py-2.5 text-muted-foreground">{cs.runs}</td>
                        <td className="text-center px-3 py-2.5 text-muted-foreground">{cs.totalCandidates}</td>
                        <td className="text-center px-3 py-2.5 font-medium text-green">{cs.noWebPhone + cs.noWebEmail}</td>
                        <td className={`text-center px-3 py-2.5 text-xs font-bold ${rateColor}`}>{cs.successRate}%</td>
                        <td className={`text-center px-3 py-2.5 text-xs font-medium ${coverageColor}`}>{coverageScore}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
