import React, { useEffect, useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { Lead, fetchLeads, updateLead } from '@/lib/supabase';
import { LeadRow } from '@/components/LeadRow';
import { useCRM } from '@/context/CRMContext';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, isPast } from 'date-fns';

export default function CallbacksPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { refreshCounts } = useCRM();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchLeads({ status: 'callback' });
      // Sort by next_action_at ascending (soonest first)
      data.sort((a, b) => {
        if (!a.next_action_at) return 1;
        if (!b.next_action_at) return -1;
        return new Date(a.next_action_at).getTime() - new Date(b.next_action_at).getTime();
      });
      setLeads(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = leads.filter(l => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return l.name.toLowerCase().includes(q) || (l.phone && l.phone.includes(q));
  });

  const overdue = filtered.filter(l => l.next_action_at && isPast(new Date(l.next_action_at)));
  const upcoming = filtered.filter(l => !l.next_action_at || !isPast(new Date(l.next_action_at)));

  const handleUpdate = (updated: Lead) => setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
  const handleDelete = (id: string) => { setLeads(prev => prev.filter(l => l.id !== id)); refreshCounts(); };

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-foreground">Callbacks</h1>
              {overdue.length > 0 && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
                  {overdue.length} overdue
                </span>
              )}
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{filtered.length} total</span>
            </div>
          </div>
          <div className="relative max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-8 h-7 text-xs bg-muted" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <div className="text-4xl mb-2">📅</div>
              <div className="text-sm">No callbacks scheduled</div>
            </div>
          ) : (
            <>
              {overdue.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-red-400 bg-red-500/5 border-b border-red-500/10">
                    ⚠ Overdue ({overdue.length})
                  </div>
                  {overdue.map(lead => (
                    <LeadRow key={lead.id} lead={lead} onUpdate={handleUpdate} onDelete={handleDelete} />
                  ))}
                </div>
              )}
              {upcoming.length > 0 && (
                <div>
                  {overdue.length > 0 && (
                    <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-border">
                      Upcoming ({upcoming.length})
                    </div>
                  )}
                  {upcoming.map(lead => (
                    <LeadRow key={lead.id} lead={lead} onUpdate={handleUpdate} onDelete={handleDelete} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
