import React from 'react';
import { cn } from '@/lib/utils';
import type { LeadTier } from '@/lib/supabase';

const TIER_STYLES: Record<LeadTier, string> = {
  'S':  'bg-gradient-to-br from-fuchsia-500 via-purple-600 to-indigo-600 text-white border-fuchsia-400/50 shadow-[0_0_18px_hsl(290_84%_60%/0.45)]',
  'A+': 'bg-gradient-to-br from-rose-500 to-orange-500 text-white border-rose-400/40 shadow-[0_0_14px_hsl(0_84%_60%/0.35)]',
  'A':  'bg-amber-500/15 text-amber-400 border-amber-500/30',
  'B':  'bg-sky-500/15 text-sky-400 border-sky-500/30',
  'C':  'bg-muted text-muted-foreground border-border',
  'D':  'bg-zinc-900/40 text-zinc-500 border-zinc-700/40',
};

export function TierBadge({ tier, className }: { tier: LeadTier | null | undefined; className?: string }) {
  if (!tier) return null;
  return (
    <span className={cn('inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[11px] font-bold border', TIER_STYLES[tier], className)}>
      {tier}
    </span>
  );
}

export function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const color =
    pct >= 85 ? 'hsl(0 84% 60%)' :
    pct >= 70 ? 'hsl(38 95% 55%)' :
    pct >= 50 ? 'hsl(213 94% 58%)' :
                'hsl(0 0% 50%)';
  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} stroke="hsl(var(--border))" strokeWidth={stroke} fill="none" />
        <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <span className="absolute text-sm font-bold tabular-nums" style={{ color }}>{pct}</span>
    </div>
  );
}

const BADGE_COLORS: Record<string, string> = {
  'S Tier':         'bg-gradient-to-r from-fuchsia-500/20 to-indigo-500/20 text-fuchsia-300 border-fuchsia-500/40',
  'A+ Hot Lead':    'bg-rose-500/15 text-rose-400 border-rose-500/30',
  'High Ticket':    'bg-amber-500/15 text-amber-400 border-amber-500/30',
  'Urgent Call':    'bg-orange-500/15 text-orange-400 border-orange-500/30',
  'Urgent Calls':   'bg-orange-500/15 text-orange-400 border-orange-500/30',
  'No Booking':     'bg-violet-500/15 text-violet-400 border-violet-500/30',
  'Weak Website':   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  'Email Found':    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  'No Email Found': 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  'Call First':     'bg-sky-500/15 text-sky-400 border-sky-500/30',
};

export function MetaBadge({ label }: { label: string }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border', BADGE_COLORS[label] || 'bg-muted text-muted-foreground border-border')}>
      {label}
    </span>
  );
}
