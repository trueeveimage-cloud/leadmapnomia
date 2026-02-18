import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCRM } from '@/context/CRMContext';
import {
  Plus, Layers, Phone, Mail, AtSign, AlertCircle, Zap,
  Calendar, Settings, BarChart2, Inbox, Users, ChevronDown, ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  badge?: number;
  color?: string;
}

function NavLink({ item }: { item: NavItem }) {
  const { pathname } = useLocation();
  const active = pathname === item.path;
  return (
    <Link
      to={item.path}
      className={cn(
        'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-all duration-100 group',
        active
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
      )}
    >
      <span className={cn('shrink-0', active ? 'text-primary' : 'text-muted-foreground group-hover:text-sidebar-accent-foreground')} style={item.color && !active ? { color: item.color } : undefined}>
        {item.icon}
      </span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <span className={cn(
          'text-xs px-1.5 py-0.5 rounded-full font-medium min-w-[20px] text-center',
          active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
        )}>
          {item.badge > 999 ? '999+' : item.badge}
        </span>
      )}
    </Link>
  );
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 w-full px-3 py-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-sidebar-foreground transition-colors"
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {label}
      </button>
      {open && <div className="mt-0.5 space-y-0.5">{children}</div>}
    </div>
  );
}

export default function Sidebar() {
  const { counts } = useCRM();
  const { pathname } = useLocation();

  const sections: NavItem[] = [
    { label: 'Unsorted', path: '/unsorted', icon: <Inbox size={15} />, badge: counts.unsorted, color: 'hsl(215 15% 55%)' },
    { label: 'Has Phone', path: '/phone', icon: <Phone size={15} />, badge: counts.phone, color: 'hsl(142 69% 45%)' },
    { label: 'Has Gmail', path: '/gmail', icon: <AtSign size={15} />, badge: counts.gmail, color: 'hsl(0 72% 55%)' },
    { label: 'Has Email', path: '/email', icon: <Mail size={15} />, badge: counts.email, color: 'hsl(213 94% 58%)' },
    { label: 'Both', path: '/both', icon: <Zap size={15} />, badge: counts.both, color: 'hsl(262 83% 65%)' },
    { label: 'Missing', path: '/missing', icon: <AlertCircle size={15} />, badge: counts.missing, color: 'hsl(38 95% 55%)' },
  ];

  const statusPages: NavItem[] = [
    { label: 'Not Contacted', path: '/status/not-contacted', icon: <span className="w-2 h-2 rounded-full bg-muted-foreground/70 shrink-0" />, badge: counts.not_contacted },
    { label: 'Contacted', path: '/status/contacted', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(213 94% 58%)' }} />, badge: counts.contacted },
    { label: 'Answered', path: '/status/answered', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(142 69% 45%)' }} />, badge: counts.answered },
    { label: 'Callbacks', path: '/callbacks', icon: <Calendar size={15} />, badge: counts.callbacksDue > 0 ? counts.callbacksDue : counts.callbacks, color: counts.callbacksDue > 0 ? 'hsl(38 95% 55%)' : undefined },
    { label: 'Interested', path: '/status/interested', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(142 69% 45%)' }} />, badge: counts.interested },
    { label: 'Not Interested', path: '/status/not-interested', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(0 72% 55%)' }} />, badge: counts.not_interested },
    { label: 'Unsure', path: '/status/unsure', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(38 95% 55%)' }} />, badge: counts.unsure },
    { label: 'Closed Won', path: '/status/closed-won', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(142 69% 55%)' }} />, badge: counts.closed_won },
    { label: 'Closed Lost', path: '/status/closed-lost', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(0 50% 40%)' }} />, badge: counts.closed_lost },
  ];

  return (
    <aside className="w-56 shrink-0 h-screen sticky top-0 flex flex-col border-r border-sidebar-border bg-sidebar overflow-y-auto">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
            <BarChart2 size={14} className="text-primary-foreground" />
          </div>
          <div>
            <div className="text-sm font-bold text-foreground leading-tight">LeadMap</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">CRM</div>
          </div>
        </div>
      </div>

      {/* Add links */}
      <div className="px-3 py-3 space-y-0.5">
        <NavLink item={{ label: 'Add Lead', path: '/add', icon: <Plus size={15} />, color: 'hsl(142 69% 45%)' }} />
        <NavLink item={{ label: 'Bulk Import', path: '/bulk', icon: <Layers size={15} /> }} />
      </div>

      {/* Total count */}
      <div className="px-4 py-1.5 text-xs text-muted-foreground flex items-center gap-1.5">
        <Users size={11} />
        <span>{counts.total} total leads</span>
      </div>

      <div className="flex-1 px-3 py-2 space-y-4 overflow-y-auto">
        <NavGroup label="Sections">
          {sections.map(item => <NavLink key={item.path} item={item} />)}
        </NavGroup>

        <NavGroup label="Status">
          {statusPages.map(item => <NavLink key={item.path} item={item} />)}
        </NavGroup>
      </div>

      {/* Settings */}
      <div className="px-3 py-3 border-t border-sidebar-border">
        <NavLink item={{ label: 'Settings', path: '/settings', icon: <Settings size={15} /> }} />
      </div>
    </aside>
  );
}
