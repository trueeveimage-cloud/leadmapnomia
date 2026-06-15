import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCRM } from '@/context/CRMContext';
import { useAuth } from '@/context/AuthContext';
import { useProduct, type Product } from '@/context/ProductContext';
import {
  Bell, Bot, BriefcaseBusiness, Clock, Inbox, LayoutDashboard, LogOut, Mail, MapPin,
  MessageSquare, PhoneCall, Settings, Target, Users, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  product?: Product;
  badge?: number;
}

function NavLink({ item, onNav }: { item: NavItem; onNav?: () => void }) {
  const { pathname } = useLocation();
  const { setProduct } = useProduct();
  const active = pathname === item.path
    || pathname.startsWith(`${item.path}/`)
    || (item.path === '/lead-finder' && (pathname === '/email-finder' || pathname.startsWith('/finder/runs/') || pathname.startsWith('/finder/batch/')));

  return (
    <Link
      to={item.path}
      onClick={() => { if (item.product) setProduct(item.product); onNav?.(); }}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors',
        active
          ? 'bg-foreground text-background font-medium'
          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground'
      )}
    >
      <span className="shrink-0">{item.icon}</span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <span className={cn('rounded px-1.5 py-0.5 text-[10px]', active ? 'bg-background/15' : 'bg-sidebar-accent text-muted-foreground')}>
          {item.badge > 999 ? `${(item.badge / 1000).toFixed(1)}k` : item.badge}
        </span>
      )}
    </Link>
  );
}

function NavSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </div>
      {children}
    </section>
  );
}

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const { counts, notifications } = useCRM();
  const { user, signOut } = useAuth();

  const leadmap: NavItem[] = [
    { label: 'Automation', path: '/automation', icon: <Bot size={15} />, product: 'leadmap' },
    { label: 'Outreach Progress', path: '/outreach-progress', icon: <Clock size={15} />, product: 'leadmap' },
    { label: 'Lead Finder', path: '/lead-finder', icon: <Mail size={15} />, product: 'leadmap' },
    { label: 'Gmail Auto Send', path: '/leadmap/email-outreach', icon: <Mail size={15} />, product: 'leadmap' },
    { label: 'Email Results', path: '/email-results', icon: <Inbox size={15} />, product: 'leadmap' },
    { label: 'Cold Call', path: '/cold-call', icon: <PhoneCall size={15} />, product: 'leadmap' },
    { label: 'AI Calls', path: '/ai-calls', icon: <Bot size={15} />, product: 'leadmap' },
    { label: 'Leadmap Closing', path: '/leadmap/closing', icon: <Target size={15} />, product: 'leadmap' },
    { label: 'Leadmap CRM', path: '/leadmap-crm', icon: <Users size={15} />, product: 'leadmap', badge: counts.total },
  ];

  const nomia: NavItem[] = [
    { label: 'SMS Outreach', path: '/nomia/sms-outreach', icon: <MessageSquare size={15} />, product: 'nomia', badge: notifications.unreadInbox },
    { label: 'Nomia Closing', path: '/nomia/closing', icon: <Target size={15} />, product: 'nomia' },
    { label: 'Nomia CRM', path: '/nomia-crm', icon: <BriefcaseBusiness size={15} />, product: 'nomia' },
  ];

  const crm: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={15} /> },
    { label: 'All Leads', path: '/unsorted', icon: <Users size={15} />, badge: counts.total },
    { label: 'Notifications', path: '/notifications', icon: <Bell size={15} />, badge: notifications.unreadHistory },
    { label: 'Inbox', path: '/inbox', icon: <Inbox size={15} />, badge: notifications.unreadInbox },
    { label: 'Callbacks', path: '/callbacks', icon: <PhoneCall size={15} />, badge: counts.callbacksDue || counts.callbacks },
    { label: 'Coverage Map', path: '/finder/coverage', icon: <MapPin size={15} /> },
  ];

  return (
    <aside className="w-72 shrink-0 h-screen flex flex-col border-r border-sidebar-border bg-sidebar overflow-hidden">
      <div className="px-4 py-4 border-b border-sidebar-border flex items-center justify-between">
        <Link to="/dashboard" onClick={onClose} className="flex items-center gap-3" data-easter-egg>
          <div className="h-8 w-8 rounded-md border border-foreground/20 bg-foreground text-background grid place-items-center text-xs font-bold">LM</div>
          <div>
            <div className="text-sm font-semibold text-foreground leading-tight">LeadMap CRM</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Leadmap AI / Nomia</div>
          </div>
        </Link>
        {onClose && (
          <button onClick={onClose} className="md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent">
            <X size={18} />
          </button>
        )}
      </div>

      <div className="px-4 py-3 border-b border-sidebar-border">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-2">
            <div className="text-muted-foreground">Reachable</div>
            <div className="text-foreground font-semibold">{counts.phone.toLocaleString()}</div>
          </div>
          <div className="rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-2">
            <div className="text-muted-foreground">Total</div>
            <div className="text-foreground font-semibold">{counts.total.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        <NavSection title="Leadmap AI">
          {leadmap.map(item => <NavLink key={item.path} item={item} onNav={onClose} />)}
        </NavSection>
        <NavSection title="Nomia">
          {nomia.map(item => <NavLink key={item.path} item={item} onNav={onClose} />)}
        </NavSection>
        <NavSection title="CRM">
          {crm.map(item => <NavLink key={item.path} item={item} onNav={onClose} />)}
        </NavSection>
      </nav>

      <div className="border-t border-sidebar-border p-3 space-y-1">
        <NavLink item={{ label: 'Settings', path: '/settings', icon: <Settings size={15} /> }} onNav={onClose} />
        {user && (
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <LogOut size={15} />
            <span>Sign out</span>
          </button>
        )}
      </div>
    </aside>
  );
}
