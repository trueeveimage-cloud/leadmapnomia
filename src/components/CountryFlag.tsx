import React from 'react';

/**
 * SVG country flags that work on all platforms (Windows doesn't render flag emojis).
 */
const flagPaths: Record<string, { colors: string[]; layout: 'cross' | 'horizontal' }> = {
  SE: { colors: ['#006AA7', '#FECC02'], layout: 'cross' },
  NO: { colors: ['#BA0C2F', '#00205B', '#FFFFFF'], layout: 'cross' },
  DK: { colors: ['#C8102E', '#FFFFFF'], layout: 'cross' },
};

interface CountryFlagProps {
  country: string;
  size?: number;
  className?: string;
}

export default function CountryFlag({ country, size = 20, className }: CountryFlagProps) {
  const w = size;
  const h = Math.round(size * 0.67);

  if (country === 'SE') {
    return (
      <svg width={w} height={h} viewBox="0 0 16 10" className={className} style={{ borderRadius: 2, display: 'inline-block', verticalAlign: 'middle' }}>
        <rect width="16" height="10" fill="#006AA7" />
        <rect x="5" width="2" height="10" fill="#FECC02" />
        <rect y="4" width="16" height="2" fill="#FECC02" />
      </svg>
    );
  }

  if (country === 'NO') {
    return (
      <svg width={w} height={h} viewBox="0 0 16 10" className={className} style={{ borderRadius: 2, display: 'inline-block', verticalAlign: 'middle' }}>
        <rect width="16" height="10" fill="#BA0C2F" />
        <rect x="4.5" width="3" height="10" fill="#FFFFFF" />
        <rect y="3.5" width="16" height="3" fill="#FFFFFF" />
        <rect x="5" width="2" height="10" fill="#00205B" />
        <rect y="4" width="16" height="2" fill="#00205B" />
      </svg>
    );
  }

  if (country === 'DK') {
    return (
      <svg width={w} height={h} viewBox="0 0 16 10" className={className} style={{ borderRadius: 2, display: 'inline-block', verticalAlign: 'middle' }}>
        <rect width="16" height="10" fill="#C8102E" />
        <rect x="5" width="2" height="10" fill="#FFFFFF" />
        <rect y="4" width="16" height="2" fill="#FFFFFF" />
      </svg>
    );
  }

  // Fallback
  return <span className={className}>{country}</span>;
}

export function countryLabel(country: string): string {
  const names: Record<string, string> = { SE: 'Sweden', NO: 'Norway', DK: 'Denmark' };
  return names[country] || country;
}
