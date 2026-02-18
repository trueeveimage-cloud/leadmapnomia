import React from 'react';
import { Lead, LeadSection, LeadStatus, updateLead, deleteLead, determineSection } from '@/lib/supabase';
import { useCRM } from '@/context/CRMContext';
import { CallButton } from './CallButton';
import { Button } from '@/components/ui/button';
import { ExternalLink, Phone, Mail, Star, MapPin, Globe, Trash2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const STATUS_COLORS: Record<LeadStatus, string> = {
  not_contacted: 'bg-muted/50 text-muted-foreground border-muted',
  contacted: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  answered: 'bg-green-500/10 text-green-400 border-green-500/20',
  callback: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  interested: 'bg-green-500/10 text-green-400 border-green-500/20',
  not_interested: 'bg-red-500/10 text-red-400 border-red-500/20',
  unsure: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  closed_won: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  closed_lost: 'bg-red-900/20 text-red-400/70 border-red-900/30',
};

const STATUS_LABELS: Record<LeadStatus, string> = {
  not_contacted: 'Not Contacted',
  contacted: 'Contacted',
  answered: 'Answered',
  callback: 'Call Back',
  interested: 'Interested',
  not_interested: 'Not Interested',
  unsure: 'Unsure',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
};

const TRIAGE_BUTTONS: { section: LeadSection; label: string; color: string }[] = [
  { section: 'phone', label: 'Has Phone', color: 'hsl(142 69% 45%)' },
  { section: 'gmail', label: 'Has Gmail', color: 'hsl(0 72% 55%)' },
  { section: 'email', label: 'Has Email', color: 'hsl(213 94% 58%)' },
  { section: 'both', label: 'Both', color: 'hsl(262 83% 65%)' },
  { section: 'missing', label: 'Missing', color: 'hsl(38 95% 55%)' },
];

interface LeadRowProps {
  lead: Lead;
  showTriage?: boolean;
  onUpdate: (lead: Lead) => void;
  onDelete: (id: string) => void;
  selected?: boolean;
  onSelect?: (id: string, checked: boolean) => void;
}

export function LeadRow({ lead, showTriage, onUpdate, onDelete, selected, onSelect }: LeadRowProps) {
  const { refreshCounts } = useCRM();

  const handleTriage = async (section: LeadSection) => {
    try {
      const updated = await updateLead(lead.id, { section });
      onUpdate(updated);
      refreshCounts();
      toast.success(`Moved to ${section}`);
    } catch {
      toast.error('Failed to move lead');
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${lead.name}"?`)) return;
    try {
      await deleteLead(lead.id);
      onDelete(lead.id);
      refreshCounts();
      toast.success('Lead deleted');
    } catch {
      toast.error('Failed to delete lead');
    }
  };

  const isGmail = lead.email?.toLowerCase().includes('@gmail.com');
  const isOverdue = lead.next_action_at && new Date(lead.next_action_at) < new Date();

  return (
    <div className={cn('lead-row px-4 py-2.5 grid gap-3 items-start', showTriage ? 'grid-cols-[20px_1fr_auto]' : 'grid-cols-[20px_1fr_auto]')}>
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={e => onSelect?.(lead.id, e.target.checked)}
        className="mt-1 accent-primary h-3.5 w-3.5 cursor-pointer"
      />

      {/* Main info */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground text-sm truncate">{lead.name}</span>
          {lead.category && (
            <span className="text-xs text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded truncate max-w-[150px]">{lead.niche_label || lead.category}</span>
          )}
          <span className={cn('status-pill', STATUS_COLORS[lead.status as LeadStatus])}>
            {STATUS_LABELS[lead.status as LeadStatus]}
          </span>
          {lead.next_action_at && (
            <span className={cn('status-pill text-xs', isOverdue ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20')}>
              {isOverdue ? '⚠ ' : '📅 '}
              {format(new Date(lead.next_action_at), 'MMM d h:mma')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
          {lead.rating && (
            <span className="flex items-center gap-1">
              <Star size={10} className="text-amber-400 fill-amber-400" />
              {lead.rating} ({lead.reviews_count?.toLocaleString()})
            </span>
          )}
          {lead.phone && (
            <span className="flex items-center gap-1 text-green-400/80">
              <Phone size={10} />
              {lead.phone}
            </span>
          )}
          {lead.email && (
            <span className={cn('flex items-center gap-1', isGmail ? 'text-red-400/80' : 'text-blue-400/80')}>
              <Mail size={10} />
              {lead.email}
            </span>
          )}
          {lead.address && (
            <span className="flex items-center gap-1 truncate max-w-[200px]">
              <MapPin size={10} />
              {lead.address}
            </span>
          )}
          {lead.website && (
            <a href={lead.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-foreground transition-colors">
              <Globe size={10} />
              {new URL(lead.website).hostname}
            </a>
          )}
        </div>

        {/* Triage buttons */}
        {showTriage && (
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {TRIAGE_BUTTONS.map(t => (
              <button
                key={t.section}
                onClick={() => handleTriage(t.section)}
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-border/50 hover:border-border transition-colors"
                style={{ color: t.color }}
              >
                <ArrowRight size={10} />
                {t.label}
              </button>
            ))}
            <button
              onClick={async () => {
                const section = determineSection(lead);
                handleTriage(section);
              }}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors font-medium"
            >
              Auto
            </button>
          </div>
        )}

        {lead.notes && (
          <div className="text-xs text-muted-foreground mt-1 italic truncate max-w-[400px]">{lead.notes}</div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {lead.phone && <CallButton lead={lead} onUpdate={onUpdate} />}
        {lead.maps_url && (
          <a href={lead.maps_url} target="_blank" rel="noreferrer">
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
              <ExternalLink size={12} />
            </Button>
          </a>
        )}
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={handleDelete}>
          <Trash2 size={12} />
        </Button>
      </div>
    </div>
  );
}
