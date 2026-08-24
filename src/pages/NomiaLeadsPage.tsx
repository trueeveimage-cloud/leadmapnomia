import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Ban, ExternalLink, Filter, Mail, Phone, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { LeadDetailPanel } from '@/components/LeadDetailPanel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { fetchLeads, type Lead } from '@/lib/supabase';
import { getNomiaPipelineStage, isDoNotContact, isSwedishLead, NOMIA_PIPELINE_LABELS } from '@/lib/nomiaWorkspace';
import { toast } from 'sonner';

function normalizedDomain(value: string | null) {
  return String(value || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

export default function NomiaLeadsPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [contact, setContact] = useState('all');
  const [stage, setStage] = useState('all');
  const [market, setMarket] = useState('SE');
  const [selected, setSelected] = useState<Lead | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try { setLeads(await fetchLeads({ product: 'nomia' })); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not load Nomia leads'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const duplicateIds = useMemo(() => {
    const seen = new Map<string, string>();
    const duplicates = new Set<string>();
    for (const lead of leads) {
      const identities = [
        lead.email ? `email:${lead.email.trim().toLowerCase()}` : '',
        lead.phone_e164 || lead.phone ? `phone:${String(lead.phone_e164 || lead.phone).replace(/[^\d+]/g, '')}` : '',
        normalizedDomain(lead.website) ? `domain:${normalizedDomain(lead.website)}` : '',
      ].filter(Boolean);
      for (const identity of identities) {
        const existing = seen.get(identity);
        if (existing && existing !== lead.id) { duplicates.add(existing); duplicates.add(lead.id); }
        else seen.set(identity, lead.id);
      }
    }
    return duplicates;
  }, [leads]);

  const filtered = useMemo(() => leads.filter(lead => {
    const q = search.trim().toLowerCase();
    if (q && ![lead.name, lead.email, lead.phone, lead.address, lead.category].some(value => String(value || '').toLowerCase().includes(q))) return false;
    if (market === 'SE' && !isSwedishLead(lead)) return false;
    if (contact === 'email' && !lead.email) return false;
    if (contact === 'phone' && !lead.phone) return false;
    if (contact === 'both' && (!lead.email || !lead.phone)) return false;
    if (contact === 'dnc' && !isDoNotContact(lead)) return false;
    if (stage !== 'all' && getNomiaPipelineStage(lead) !== stage) return false;
    return true;
  }), [leads, search, market, contact, stage]);

  const sendToEmailReview = () => {
    const ids = [...selectedIds].slice(0, 10);
    sessionStorage.setItem('nomia.email.selectedLeadIds', JSON.stringify(ids));
    navigate('/nomia/email');
  };

  return (
    <AppLayout>
      <div className="flex min-h-full flex-col">
        <header className="border-b border-border bg-background px-4 py-4 md:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Nomia</div>
              <h1 className="mt-1 text-xl font-semibold">Lead workspace</h1>
              <p className="text-xs text-muted-foreground">Dense prospect view with separate Nomia data and Sweden-first filtering.</p>
            </div>
            <div className="flex gap-2">
              {selectedIds.size > 0 && <Button size="sm" onClick={sendToEmailReview} className="gap-2"><Mail size={14} /> Review email ({Math.min(10, selectedIds.size)})</Button>}
              <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <div className="relative min-w-64 flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search company, email, phone, city or niche" className="h-9 pl-9" />
            </div>
            <select value={market} onChange={e => setMarket(e.target.value)} className="h-9 rounded-md border border-border bg-card px-3 text-xs">
              <option value="SE">Sweden</option><option value="all">All stored markets</option>
            </select>
            <select value={contact} onChange={e => setContact(e.target.value)} className="h-9 rounded-md border border-border bg-card px-3 text-xs">
              <option value="all">All contacts</option><option value="phone">Has phone</option><option value="email">Has email</option><option value="both">Phone + email</option><option value="dnc">Do not contact</option>
            </select>
            <select value={stage} onChange={e => setStage(e.target.value)} className="h-9 rounded-md border border-border bg-card px-3 text-xs">
              <option value="all">All stages</option>{Object.entries(NOMIA_PIPELINE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-card text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr className="border-b border-border">
                <th className="w-10 px-4 py-3"><Filter size={13} /></th><th className="px-3 py-3">Business</th><th className="px-3 py-3">Contact</th><th className="px-3 py-3">Website</th><th className="px-3 py-3">Stage</th><th className="px-3 py-3">Quality</th><th className="px-3 py-3">Follow-up</th><th className="px-3 py-3">Safety</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(lead => {
                const dnc = isDoNotContact(lead);
                return (
                  <tr key={lead.id} className="border-b border-border/60 hover:bg-secondary/40">
                    <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.has(lead.id)} disabled={dnc} onChange={e => setSelectedIds(prev => { const next = new Set(prev); if (e.target.checked) next.add(lead.id); else next.delete(lead.id); return next; })} /></td>
                    <td className="px-3 py-3"><button onClick={() => setSelected(lead)} className="text-left"><span className="block max-w-60 truncate text-sm font-medium text-foreground">{lead.name}</span><span className="block max-w-60 truncate text-muted-foreground">{lead.city || lead.address || lead.category || 'No location'}</span></button></td>
                    <td className="px-3 py-3"><div className="space-y-1 text-muted-foreground">{lead.phone && <div className="flex items-center gap-1.5"><Phone size={11} /> {lead.phone}</div>}{lead.email && <div className="flex items-center gap-1.5"><Mail size={11} /> <span className="max-w-44 truncate">{lead.email}</span></div>}{!lead.phone && !lead.email && 'Missing'}</div></td>
                    <td className="px-3 py-3">{lead.website ? <a href={lead.website} target="_blank" rel="noreferrer" className="flex max-w-44 items-center gap-1 truncate text-sky-300"><ExternalLink size={11} /> {normalizedDomain(lead.website)}</a> : <span className="text-muted-foreground">No website</span>}</td>
                    <td className="px-3 py-3"><span className="rounded border border-border bg-secondary px-2 py-1">{NOMIA_PIPELINE_LABELS[getNomiaPipelineStage(lead)]}</span></td>
                    <td className="px-3 py-3"><div>{lead.website_quality || 'Unrated'}</div><div className="text-muted-foreground">{lead.potential_score ?? 0} score</div></td>
                    <td className="px-3 py-3 text-muted-foreground">{lead.next_action_at ? new Date(lead.next_action_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }) : 'None'}</td>
                    <td className="px-3 py-3">{dnc ? <span className="inline-flex items-center gap-1 text-red-300"><Ban size={12} /> Blocked</span> : duplicateIds.has(lead.id) ? <span className="inline-flex items-center gap-1 text-amber-300"><AlertTriangle size={12} /> Duplicate</span> : <span className="inline-flex items-center gap-1 text-emerald-300"><ShieldCheck size={12} /> Clear</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">No Nomia leads match these filters.</div>}
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{selected?.name}</DialogTitle></DialogHeader>
          {selected && <LeadDetailPanel lead={selected} onUpdate={updated => { setSelected(updated); setLeads(prev => prev.map(item => item.id === updated.id ? updated : item)); }} />}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
