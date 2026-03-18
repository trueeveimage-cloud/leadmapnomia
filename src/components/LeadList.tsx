import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Lead, LeadSection, LeadStatus, fetchLeads, updateLead, deleteLead, determineSection, getSetting } from '@/lib/supabase';
import { useCRM } from '@/context/CRMContext';
import { LeadRow } from './LeadRow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, SortDesc, ChevronDown, CheckSquare, Square, Zap, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const STATUSES: LeadStatus[] = [
  'not_contacted', 'contacted', 'answered', 'callback', 'interested',
  'not_interested', 'unsure', 'demo', 'closed_won', 'closed_lost',
];

const STATUS_LABELS: Record<LeadStatus, string> = {
  not_contacted: 'Not Contacted',
  contacted: 'Contacted',
  answered: 'Answered',
  callback: 'Call Back',
  interested: 'Interested',
  not_interested: 'Not Interested',
  unsure: 'Unsure',
  demo: 'Demo',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
};

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'rating', label: 'Rating' },
  { value: 'reviews', label: 'Reviews' },
  { value: 'followup', label: 'Follow-up' },
];

interface LeadListProps {
  section?: LeadSection;
  /** When true, fetch ALL sections (for the Unsorted overview page) */
  allSections?: boolean;
  status?: LeadStatus;
  /** When true, show leads with outreach_opt_out = true */
  optOut?: boolean;
  showTriage?: boolean;
  title: string;
  emptyMessage?: string;
  /** Exclude leads from this section (e.g. 'missing' on Not Contacted page) */
  excludeSection?: LeadSection;
}

export default function LeadList({ section, allSections, status, optOut, showTriage, title, emptyMessage, excludeSection }: LeadListProps) {
  const { refreshCounts } = useCRM();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<LeadStatus | ''>('');
  const [filterStatus, setFilterStatus] = useState<LeadStatus | ''>('');
  const [filterCategory, setFilterCategory] = useState('');
  const [autoSorting, setAutoSorting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // If allSections, fetch all leads (no section filter)
      let data = await fetchLeads(allSections ? { status } : { section, status });
      if (excludeSection) {
        data = data.filter(l => l.section !== excludeSection);
      }
      if (optOut) {
        data = data.filter(l => l.outreach_opt_out);
      }
      setLeads(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [section, allSections, status, excludeSection, optOut]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let result = leads;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(l =>
        l.name.toLowerCase().includes(q) ||
        (l.phone && l.phone.includes(q)) ||
        (l.email && l.email.toLowerCase().includes(q)) ||
        (l.address && l.address.toLowerCase().includes(q)) ||
        (l.category && l.category.toLowerCase().includes(q))
      );
    }
    if (filterStatus) result = result.filter(l => l.status === filterStatus);

    switch (sort) {
      case 'rating': return [...result].sort((a, b) => (b.rating || 0) - (a.rating || 0));
      case 'reviews': return [...result].sort((a, b) => (b.reviews_count || 0) - (a.reviews_count || 0));
      case 'followup': return [...result].sort((a, b) => {
        if (!a.next_action_at) return 1;
        if (!b.next_action_at) return -1;
        return new Date(a.next_action_at).getTime() - new Date(b.next_action_at).getTime();
      });
      default: return [...result].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  }, [leads, search, sort, filterStatus]);

  const handleUpdate = useCallback((updated: Lead) => {
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
  }, []);

  const handleDelete = useCallback((id: string) => {
    setLeads(prev => prev.filter(l => l.id !== id));
    setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
  }, []);

  const handleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      checked ? s.add(id) : s.delete(id);
      return s;
    });
  }, []);

  const allSelected = filtered.length > 0 && filtered.every(l => selectedIds.has(l.id));

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(l => l.id)));
  };

  const applyBulkStatus = async () => {
    if (!bulkStatus || selectedIds.size === 0) return;
    try {
      await Promise.all([...selectedIds].map(id => updateLead(id, { status: bulkStatus as LeadStatus })));
      setLeads(prev => prev.map(l => selectedIds.has(l.id) ? { ...l, status: bulkStatus as LeadStatus } : l));
      refreshCounts();
      toast.success(`Updated ${selectedIds.size} leads`);
      setSelectedIds(new Set());
      setBulkStatus('');
    } catch {
      toast.error('Bulk update failed');
    }
  };

  const applyBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} lead${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
    try {
      await Promise.all([...selectedIds].map(id => deleteLead(id)));
      setLeads(prev => prev.filter(l => !selectedIds.has(l.id)));
      refreshCounts();
      toast.success(`Deleted ${selectedIds.size} leads`);
      setSelectedIds(new Set());
    } catch {
      toast.error('Bulk delete failed');
    }
  };

  /** Auto-sort all visible leads based on their contact info */
  const handleAutoSort = async () => {
    const unsortedLeads = filtered.filter(l => l.section === 'unsorted' || allSections);
    if (unsortedLeads.length === 0) {
      toast.info('No leads to sort');
      return;
    }
    setAutoSorting(true);
    try {
      const updates = await Promise.all(
        unsortedLeads.map(async lead => {
          const newSection = determineSection(lead);
          if (newSection !== lead.section) {
            const updated = await updateLead(lead.id, { section: newSection });
            return updated;
          }
          return lead;
        })
      );
      setLeads(prev => prev.map(l => {
        const upd = updates.find(u => u.id === l.id);
        return upd || l;
      }));
      refreshCounts();
      toast.success(`Auto-sorted ${unsortedLeads.length} leads`);
    } catch {
      toast.error('Auto-sort failed');
    } finally {
      setAutoSorting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Auto-sort banner */}
      {showTriage && (
        <div className="px-4 pt-4 pb-2">
          <Button
            onClick={handleAutoSort}
            disabled={autoSorting}
            className="w-full h-11 gap-2 text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
          >
            <Zap size={16} className={autoSorting ? 'animate-pulse' : ''} />
            {autoSorting ? 'Sorting...' : 'Auto Sort All Leads'}
          </Button>
        </div>
      )}

      {/* Header bar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-foreground">{title}</h1>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{filtered.length}</span>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={load}>↻ Refresh</Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search leads..."
              className="pl-8 h-7 text-xs bg-muted border-border"
            />
          </div>

          {/* Sort */}
          <div className="relative">
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="h-7 text-xs bg-muted border border-border rounded-md px-2 pr-6 text-foreground appearance-none cursor-pointer"
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <SortDesc size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>

          {/* Status filter */}
          {!status && (
            <div className="relative">
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as LeadStatus | '')}
                className="h-7 text-xs bg-muted border border-border rounded-md px-2 pr-6 text-foreground appearance-none cursor-pointer"
              >
                <option value="">All statuses</option>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
              <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          )}

          {/* Bulk actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-1.5 ml-auto flex-wrap">
              <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
              <select
                value={bulkStatus}
                onChange={e => setBulkStatus(e.target.value as LeadStatus)}
                className="h-7 text-xs bg-muted border border-border rounded-md px-2 text-foreground"
              >
                <option value="">Set status...</option>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
              <Button size="sm" className="h-7 text-xs" onClick={applyBulkStatus} disabled={!bulkStatus}>Apply</Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs gap-1"
                onClick={applyBulkDelete}
              >
                <Trash2 size={11} />
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border bg-muted/30 text-xs text-muted-foreground">
        <button onClick={toggleAll} className="shrink-0">
          {allSelected ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
        </button>
        <span className="flex-1">Name / Details</span>
        <span className="shrink-0 w-24 text-right">Actions</span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <div className="text-4xl mb-2">📭</div>
            <div className="text-sm">{search ? 'No results found' : (emptyMessage || 'No leads here')}</div>
          </div>
        ) : (
          filtered.map(lead => (
            <LeadRow
              key={lead.id}
              lead={lead}
              showTriage={showTriage}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              selected={selectedIds.has(lead.id)}
              onSelect={handleSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
