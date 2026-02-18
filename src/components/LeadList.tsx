import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Lead, LeadSection, LeadStatus, fetchLeads, updateLead } from '@/lib/supabase';
import { useCRM } from '@/context/CRMContext';
import { LeadRow } from './LeadRow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, SortDesc, ChevronDown, CheckSquare, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const STATUSES: LeadStatus[] = [
  'not_contacted', 'contacted', 'answered', 'callback', 'interested',
  'not_interested', 'unsure', 'closed_won', 'closed_lost',
];

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

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'rating', label: 'Rating' },
  { value: 'reviews', label: 'Reviews' },
  { value: 'followup', label: 'Follow-up' },
];

interface LeadListProps {
  section?: LeadSection;
  status?: LeadStatus;
  showTriage?: boolean;
  title: string;
  emptyMessage?: string;
}

export default function LeadList({ section, status, showTriage, title, emptyMessage }: LeadListProps) {
  const { refreshCounts } = useCRM();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<LeadStatus | ''>('');
  const [showBulk, setShowBulk] = useState(false);
  const [filterStatus, setFilterStatus] = useState<LeadStatus | ''>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchLeads({ section, status });
      setLeads(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [section, status]);

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

  return (
    <div className="flex flex-col h-full">
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
            <div className="flex items-center gap-1.5 ml-auto">
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
