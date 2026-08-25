import React, { useEffect, useMemo, useState } from 'react';
import WorkspaceLayout from '@/components/WorkspaceLayout';
import { computePipelineStage, fetchAppointmentLeadIds, fetchWorkspaceLeads, type Workspace } from '@/lib/nomia';
import { OUTREACH_STATE_LABELS } from '@/lib/sharedCrmContract';
import { Search, ShieldOff, Copy, Globe, Mail, Phone, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function NomiaLeadsPage({ workspace = 'nomia' as Workspace }: { workspace?: Workspace }) {
  const [rows, setRows] = useState<any[]>([]);
  const [apptIds, setApptIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [swedenOnly, setSwedenOnly] = useState(workspace === 'nomia');
  const [hasEmail, setHasEmail] = useState(false);
  const [hasPhone, setHasPhone] = useState(false);
  const [state, setState] = useState('all');
  const [includeDnc, setIncludeDnc] = useState(true);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      fetchWorkspaceLeads(workspace, { search, swedenOnly, hasEmail, hasPhone, outreachState: state, includeDnc })
        .then(async (data) => {
          setRows(data);
          setApptIds(await fetchAppointmentLeadIds(data.map((d: any) => d.id)));
        })
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [workspace, search, swedenOnly, hasEmail, hasPhone, state, includeDnc]);

  // Duplicate identity warnings inside the loaded set
  const dupKeys = useMemo(() => {
    const seen = new Map<string, number>();
    rows.forEach((r) => {
      [r.email?.toLowerCase(), r.phone?.replace(/\D/g, ''), r.website?.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]?.toLowerCase()]
        .filter(Boolean)
        .forEach((k: string) => seen.set(k, (seen.get(k) || 0) + 1));
    });
    return seen;
  }, [rows]);

  const isDuplicate = (r: any) =>
    [r.email?.toLowerCase(), r.phone?.replace(/\D/g, ''), r.website?.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]?.toLowerCase()]
      .filter(Boolean)
      .some((k: string) => (dupKeys.get(k) || 0) > 1);

  const Toggle = ({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) => (
    <button onClick={() => set(!on)}
      className={cn('rounded-md border px-2.5 py-1.5 text-[11px] transition-colors',
        on ? 'border-emerald/50 bg-emerald/10 text-emerald' : 'border-border text-muted-foreground hover:text-foreground')}>
      {label}
    </button>
  );

  return (
    <WorkspaceLayout workspace={workspace} title={`${workspace === 'nomia' ? 'Nomia' : 'Leadmap'} leads`} subtitle={`${rows.length} loaded`}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone, city"
            className="w-full rounded-md border border-border bg-card pl-8 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald/60" />
        </div>
        <Toggle on={swedenOnly} set={setSwedenOnly} label="Sweden first" />
        <Toggle on={hasEmail} set={setHasEmail} label="Has email" />
        <Toggle on={hasPhone} set={setHasPhone} label="Has phone" />
        <Toggle on={includeDnc} set={setIncludeDnc} label="Show DNC" />
        <select value={state} onChange={(e) => setState(e.target.value)}
          className="rounded-md border border-border bg-card px-2 py-1.5 text-[11px] text-foreground">
          <option value="all">All outreach states</option>
          {Object.entries(OUTREACH_STATE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-secondary/60 text-muted-foreground">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Business</th>
              <th className="px-3 py-2 font-medium">City</th>
              <th className="px-3 py-2 font-medium">Contact</th>
              <th className="px-3 py-2 font-medium">Website</th>
              <th className="px-3 py-2 font-medium">Outreach</th>
              <th className="px-3 py-2 font-medium">Stage</th>
              <th className="px-3 py-2 font-medium">Follow-up</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No leads match these filters.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-row-hover">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-foreground font-medium truncate max-w-[220px]">{r.business_name || r.name}</span>
                    {r.do_not_contact && <span title="Do not contact" className="text-destructive"><ShieldOff size={12} /></span>}
                    {isDuplicate(r) && <span title="Duplicate identity in this view" className="text-amber"><Copy size={12} /></span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate max-w-[220px]">{r.category || r.niche_label || '—'}</div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.city || '—'}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {r.email ? <Mail size={12} className="text-emerald" /> : null}
                    {r.phone ? <Phone size={12} className="text-cobalt" /> : null}
                    {!r.email && !r.phone ? '—' : null}
                  </div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.website ? <span className="inline-flex items-center gap-1"><Globe size={12} />{r.website_quality || 'has site'}</span> : 'none'}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {(OUTREACH_STATE_LABELS as any)[r.outreach_state] || 'Not contacted'}
                </td>
                <td className="px-3 py-2">
                  <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-foreground">
                    {computePipelineStage(r, apptIds.has(r.id))}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.follow_up_at ? <span className="inline-flex items-center gap-1"><Clock size={11} />{new Date(r.follow_up_at).toLocaleDateString()}</span> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WorkspaceLayout>
  );
}
