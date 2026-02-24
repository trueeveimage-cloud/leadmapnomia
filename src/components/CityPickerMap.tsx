import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SWEDEN_CITIES, CityProfile } from '@/lib/swedenCities';

interface CityPickerMapProps {
  selectedCities: CityProfile[];
  cityStats: Record<string, { runs: number; leads: number; candidates: number }>;
  onSelectCity: (city: CityProfile) => void;
  onRemoveCity: (name: string) => void;
}

export default function CityPickerMap({ selectedCities, cityStats, onSelectCity, onRemoveCity }: CityPickerMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);

  // Init map once
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const map = L.map(mapRef.current, {
      center: [62.5, 15.5],
      zoom: 5,
      zoomControl: true,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OSM',
    }).addTo(map);
    mapInstanceRef.current = map;
    return () => { map.remove(); mapInstanceRef.current = null; };
  }, []);

  // Update markers when selection or stats change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear old markers
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    const selectedNames = new Set(selectedCities.map(c => c.name));

    SWEDEN_CITIES.forEach(city => {
      const isSelected = selectedNames.has(city.name);
      const cs = cityStats[city.name];
      const searched = !!cs;
      const successRate = cs && cs.candidates > 0 ? ((cs.leads / cs.candidates) * 100).toFixed(0) : null;

      // Color: selected=primary, searched=green, unsearched=grey
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

      // Tooltip
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

      // Click to toggle selection
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
  }, [selectedCities, cityStats, onSelectCity, onRemoveCity]);

  return <div ref={mapRef} className="h-full w-full rounded-lg" />;
}
