import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ALL_CITIES, getCitiesByCountry, CityProfile, Country, COUNTRY_CENTER } from '@/lib/cities';

interface CityPickerMapProps {
  selectedCities: CityProfile[];
  cityStats: Record<string, { runs: number; leads: number; candidates: number }>;
  onSelectCity: (city: CityProfile) => void;
  onRemoveCity: (name: string) => void;
  country: Country;
}

export default function CityPickerMap({ selectedCities, cityStats, onSelectCity, onRemoveCity, country }: CityPickerMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);

  const center = COUNTRY_CENTER[country];

  // Init map once
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const map = L.map(mapRef.current, {
      center: [center.lat, center.lng],
      zoom: center.zoom,
      zoomControl: true,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OSM',
    }).addTo(map);
    mapInstanceRef.current = map;
    return () => { map.remove(); mapInstanceRef.current = null; };
  }, []);

  // Re-center when country changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.setView([center.lat, center.lng], center.zoom);
  }, [country, center]);

  // Update markers when selection or stats change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    const selectedNames = new Set(selectedCities.map(c => c.name));
    const cities = getCitiesByCountry(country);

    cities.forEach(city => {
      const isSelected = selectedNames.has(city.name);
      const cs = cityStats[city.name];
      const searched = !!cs;
      const successRate = cs && cs.candidates > 0 ? ((cs.leads / cs.candidates) * 100).toFixed(0) : null;

      const color = isSelected
        ? 'hsl(217, 91%, 60%)'
        : searched
          ? 'hsl(142, 69%, 45%)'
          : 'hsl(215, 15%, 40%)';

      const radius = city.type === 'METRO' ? 8 : city.type === 'CITY' ? 6 : 5;

      const marker = L.circleMarker([city.lat, city.lng], {
        radius,
        color,
        fillColor: color,
        fillOpacity: isSelected ? 0.8 : searched ? 0.5 : 0.25,
        weight: isSelected ? 3 : 1.5,
      });

      let tooltipHtml = `<strong>${city.name}</strong>`;
      if (isSelected) {
        tooltipHtml += `<br/><span style="color:#60a5fa;">✓ Selected for search</span>`;
      }
      if (searched) {
        tooltipHtml += `<br/>${cs.runs} run${cs.runs !== 1 ? 's' : ''} · ${cs.leads} leads`;
        if (successRate) tooltipHtml += ` · ${successRate}% success`;
      } else {
        tooltipHtml += `<br/><span style="color:#9ca3af;">Not yet searched</span>`;
      }
      tooltipHtml += `<br/><span style="font-size:10px;color:#6b7280;">${city.type} · Pop ${city.population.toLocaleString()}</span>`;

      marker.bindTooltip(tooltipHtml, { direction: 'top', sticky: true });

      marker.on('click', () => {
        if (isSelected) {
          onRemoveCity(city.name);
        } else {
          onSelectCity(city);
        }
      });

      marker.addTo(map);
      markersRef.current.push(marker);
    });
  }, [selectedCities, cityStats, onSelectCity, onRemoveCity, country]);

  return <div ref={mapRef} className="h-full w-full rounded-lg" />;
}
