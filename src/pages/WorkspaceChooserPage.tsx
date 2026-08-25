import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { fetchWorkspaceCounts } from '@/lib/nomia';
import { Crown, Map, ArrowRight, LogOut, PauseCircle } from 'lucide-react';

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background/40 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground">{value.toLocaleString()}</div>
    </div>
  );
}

export default function WorkspaceChooserPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [nomia, setNomia] = useState({ total: 0, withEmail: 0, withPhone: 0, replied: 0, doNotContact: 0 });
  const [leadmap, setLeadmap] = useState({ total: 0, withEmail: 0, withPhone: 0, replied: 0, doNotContact: 0 });

  useEffect(() => {
    fetchWorkspaceCounts('nomia').then(setNomia).catch(() => {});
    fetchWorkspaceCounts('leadmap').then(setLeadmap).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background px-4 py-10 md:py-16">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Choose a workspace</h1>
            <p className="text-sm text-muted-foreground mt-1">Signed in as {user?.email}</p>
          </div>
          <button onClick={signOut} className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground">
            <LogOut size={13} /> Sign out
          </button>
        </div>

        <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2.5 text-xs text-amber flex items-center gap-2 mb-6">
          <PauseCircle size={14} /> All automated outreach is paused. Nothing sends until you re-enable it.
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <button
            onClick={() => navigate('/nomia/dashboard')}
            className="group text-left rounded-lg border border-emerald/30 bg-card p-4 hover:border-emerald/60 transition-colors"
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className="h-9 w-9 rounded-md border border-emerald/40 bg-emerald/10 text-emerald grid place-items-center">
                <Crown size={16} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-foreground">Nomia</div>
                <div className="text-[11px] text-muted-foreground">Primary · websites & growth</div>
              </div>
              <ArrowRight size={16} className="text-muted-foreground group-hover:text-emerald transition-colors" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Leads" value={nomia.total} />
              <Stat label="Email" value={nomia.withEmail} />
              <Stat label="Phone" value={nomia.withPhone} />
            </div>
          </button>

          <button
            onClick={() => navigate('/leadmap/dashboard')}
            className="group text-left rounded-lg border border-border bg-card p-4 hover:border-cobalt/60 transition-colors"
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className="h-9 w-9 rounded-md border border-cobalt/40 bg-cobalt/10 text-cobalt grid place-items-center">
                <Map size={16} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-foreground">Leadmap</div>
                <div className="text-[11px] text-muted-foreground">Secondary workspace</div>
              </div>
              <ArrowRight size={16} className="text-muted-foreground group-hover:text-cobalt transition-colors" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Leads" value={leadmap.total} />
              <Stat label="Email" value={leadmap.withEmail} />
              <Stat label="Phone" value={leadmap.withPhone} />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
