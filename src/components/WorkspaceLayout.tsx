import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useProduct } from '@/context/ProductContext';
import { fetchWorkspaceCounts, isOutreachPaused, type Workspace } from '@/lib/nomia';
import { cn } from '@/lib/utils';
import {
  BarChart3, Crown, Inbox, LayoutDashboard, LogOut, Mail, Map, Menu, PauseCircle,
  PhoneCall, Settings, Users, Workflow, X, LayoutGrid,
} from 'lucide-react';

interface NavItem { label: string; path: string; icon: React.ReactNode; badge?: number }

const NOMIA_NAV = (counts: any): NavItem[] => [
  { label: 'Dashboard', path: '/nomia/dashboard', icon: <LayoutDashboard size={15} /> },
  { label: 'Leads', path: '/nomia/leads', icon: <Users size={15} />, badge: counts.total },
  { label: 'Calls', path: '/nomia/calls', icon: <PhoneCall size={15} />, badge: counts.withPhone },
  { label: 'Gmail', path: '/nomia/email', icon: <Mail size={15} />, badge: counts.withEmail },
  { label: 'Inbox', path: '/nomia/inbox', icon: <Inbox size={15} />, badge: counts.replied },
  { label: 'Pipeline', path: '/nomia/pipeline', icon: <Workflow size={15} /> },
  { label: 'Analytics', path: '/nomia/analytics', icon: <BarChart3 size={15} /> },
  { label: 'Settings', path: '/nomia/settings', icon: <Settings size={15} /> },
];

const LEADMAP_NAV = (counts: any): NavItem[] => [
  { label: 'Dashboard', path: '/leadmap/dashboard', icon: <LayoutDashboard size={15} /> },
  { label: 'Leads', path: '/leadmap/leads', icon: <Users size={15} />, badge: counts.total },
  { label: 'Automation', path: '/automation', icon: <Workflow size={15} /> },
  { label: 'Outreach Progress', path: '/outreach-progress', icon: <BarChart3 size={15} /> },
  { label: 'Lead Finder', path: '/lead-finder', icon: <Map size={15} /> },
  { label: 'Gmail Auto Send', path: '/leadmap/email-outreach', icon: <Mail size={15} /> },
  { label: 'Cold Call', path: '/cold-call', icon: <PhoneCall size={15} /> },
  { label: 'Inbox', path: '/inbox', icon: <Inbox size={15} /> },
  { label: 'Settings', path: '/settings', icon: <Settings size={15} /> },
];

export default function WorkspaceLayout({
  workspace,
  title,
  subtitle,
  actions,
  children,
}: {
  workspace: Workspace;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { setProduct } = useProduct();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState({ total: 0, withEmail: 0, withPhone: 0, replied: 0, doNotContact: 0 });
  const [paused, setPaused] = useState({ master: true, gmail: true, aiCalls: true, sms: true });

  useEffect(() => { setProduct(workspace); }, [workspace, setProduct]);
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    fetchWorkspaceCounts(workspace).then((c) => { if (!cancelled) setCounts(c); }).catch(() => {});
    isOutreachPaused().then((p) => { if (!cancelled) setPaused(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [workspace]);

  const nav = workspace === 'nomia' ? NOMIA_NAV(counts) : LEADMAP_NAV(counts);
  const accent = workspace === 'nomia' ? 'text-emerald' : 'text-cobalt';

  const sidebar = (
    <aside className="w-64 shrink-0 h-screen flex flex-col border-r border-sidebar-border bg-sidebar">
      <div className="px-3 py-3 border-b border-sidebar-border flex items-center justify-between gap-2">
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <div className={cn('h-7 w-7 rounded-md grid place-items-center border',
            workspace === 'nomia' ? 'border-emerald/40 bg-emerald/10 text-emerald' : 'border-cobalt/40 bg-cobalt/10 text-cobalt')}>
            {workspace === 'nomia' ? <Crown size={14} /> : <Map size={14} />}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground leading-tight truncate">
              {workspace === 'nomia' ? 'Nomia' : 'Leadmap'}
            </div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Workspace</div>
          </div>
        </Link>
        <button onClick={() => setOpen(false)} className="md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground">
          <X size={18} />
        </button>
      </div>

      {/* Workspace switcher */}
      <div className="p-2 border-b border-sidebar-border">
        <div className="flex gap-1 p-1 rounded-lg bg-sidebar-accent/40 border border-sidebar-border">
          <button
            onClick={() => navigate('/nomia/dashboard')}
            className={cn('flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors',
              workspace === 'nomia' ? 'bg-emerald/15 text-emerald border border-emerald/40' : 'text-muted-foreground hover:text-foreground')}
          >
            <Crown size={12} /> Nomia
          </button>
          <button
            onClick={() => navigate('/leadmap/dashboard')}
            className={cn('flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors',
              workspace === 'leadmap' ? 'bg-cobalt/15 text-cobalt border border-cobalt/40' : 'text-muted-foreground hover:text-foreground')}
          >
            <Map size={12} /> Leadmap
          </button>
        </div>
        <Link to="/" className="mt-2 flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-sidebar-accent">
          <LayoutGrid size={12} /> All workspaces
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {nav.map((item) => {
          const active = pathname === item.path || pathname.startsWith(`${item.path}/`);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn('flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors',
                active ? 'bg-foreground text-background font-medium' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground')}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge ? (
                <span className={cn('rounded px-1.5 py-0.5 text-[10px]', active ? 'bg-background/15' : 'bg-sidebar-accent text-muted-foreground')}>
                  {item.badge > 999 ? `${(item.badge / 1000).toFixed(1)}k` : item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-2 space-y-2">
        <div className="rounded-md border border-amber/30 bg-amber/10 px-2.5 py-2 text-[11px] text-amber flex items-start gap-2">
          <PauseCircle size={13} className="mt-0.5 shrink-0" />
          <span>{paused.master ? 'All outreach paused' : 'Outreach live — check settings'}</span>
        </div>
        <div className="text-[10px] text-muted-foreground truncate px-1">{user?.email}</div>
        <button onClick={signOut} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground">
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className={cn('fixed inset-0 z-30 bg-background/70 backdrop-blur-sm md:hidden transition-opacity',
        open ? 'opacity-100' : 'opacity-0 pointer-events-none')} onClick={() => setOpen(false)} />
      <div className={cn('fixed md:static inset-y-0 left-0 z-40 transition-transform duration-200',
        open ? 'translate-x-0' : '-translate-x-full md:translate-x-0')}>
        {sidebar}
      </div>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <header className="sticky top-0 z-20 border-b border-border bg-card/85 backdrop-blur-md">
          <div className="flex items-center gap-3 px-4 py-3">
            <button onClick={() => setOpen(true)} className="md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground">
              <Menu size={18} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className={cn('text-base font-semibold leading-tight truncate', accent)}>{title}</h1>
              {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-2">{actions}</div>
          </div>
        </header>
        <div className="p-4">{children}</div>
      </main>
    </div>
  );
}
