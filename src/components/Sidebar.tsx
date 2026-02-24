import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCRM } from '@/context/CRMContext';
import { useAuth } from '@/context/AuthContext';
import {
  Plus, Layers, Phone, Mail, AtSign, AlertCircle, Zap,
  Settings, BarChart2, Inbox, Users, ChevronDown, ChevronRight, Search, Calculator,
  Megaphone, MessageCircle, PhoneCall, LogOut, MapPin
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  badge?: number;
  color?: string;
}

function NavLink({ item, indent = false, onNav }: { item: NavItem; indent?: boolean; onNav?: () => void }) {
  const { pathname } = useLocation();
  const active = pathname === item.path;
  return (
    <Link
      to={item.path}
      onClick={onNav}
      className={cn(
        'flex items-center gap-2.5 py-2.5 rounded-md text-sm transition-all duration-100 group',
        indent ? 'px-2 ml-4' : 'px-3',
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

function UnsortedGroup({ counts, onNav }: { counts: ReturnType<typeof useCRM>['counts']; onNav?: () => void }) {
  const [subOpen, setSubOpen] = React.useState(false);
  const { pathname } = useLocation();

  const subsections: NavItem[] = [
    { label: 'Has Phone', path: '/phone', icon: <Phone size={13} />, badge: counts.phone, color: 'hsl(142 69% 45%)' },
    { label: 'Has Gmail', path: '/gmail', icon: <AtSign size={13} />, badge: counts.gmail, color: 'hsl(0 72% 55%)' },
    { label: 'Has Email', path: '/email', icon: <Mail size={13} />, badge: counts.email, color: 'hsl(213 94% 58%)' },
    { label: 'Both', path: '/both', icon: <Zap size={13} />, badge: counts.both, color: 'hsl(262 83% 65%)' },
    { label: 'Missing', path: '/missing', icon: <AlertCircle size={13} />, badge: counts.missing, color: 'hsl(38 95% 55%)' },
  ];

  const isUnsortedActive = pathname === '/unsorted';
  const isSubActive = subsections.some(s => pathname === s.path);

  return (
    <div>
      <div className="flex items-center gap-0.5">
        <Link
          to="/unsorted"
          onClick={onNav}
          className={cn(
            'flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm transition-all duration-100 group flex-1 min-w-0',
            isUnsortedActive
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          )}
        >
          <span className={cn('shrink-0', isUnsortedActive ? 'text-primary' : 'text-muted-foreground group-hover:text-sidebar-accent-foreground')}>
            <Inbox size={15} />
          </span>
          <span className="flex-1 truncate">Unsorted</span>
          {counts.unsorted > 0 && (
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded-full font-medium min-w-[20px] text-center',
              isUnsortedActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
            )}>
              {counts.unsorted > 999 ? '999+' : counts.unsorted}
            </span>
          )}
        </Link>
        <button
          onClick={() => setSubOpen(o => !o)}
          className={cn(
            'p-2 rounded-md transition-colors shrink-0',
            (subOpen || isSubActive) ? 'text-primary' : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent'
          )}
          title="Toggle subsections"
        >
          {subOpen || isSubActive ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      </div>

      {(subOpen || isSubActive) && (
        <div className="mt-0.5 space-y-0.5 ml-3 border-l border-border/40 pl-2">
          {subsections.map(item => (
            <NavLink key={item.path} item={item} onNav={onNav} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const { counts } = useCRM();
  const { signOut } = useAuth();

  const statusPages: NavItem[] = [
    { label: 'Not Contacted', path: '/status/not-contacted', icon: <span className="w-2 h-2 rounded-full bg-muted-foreground/70 shrink-0" />, badge: counts.not_contacted },
    { label: 'Contacted', path: '/status/contacted', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(213 94% 58%)' }} />, badge: counts.contacted },
    { label: 'Answered', path: '/status/answered', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(142 69% 45%)' }} />, badge: counts.answered },
    { label: 'Callbacks', path: '/callbacks', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(38 95% 55%)' }} />, badge: counts.callbacksDue > 0 ? counts.callbacksDue : counts.callbacks, color: counts.callbacksDue > 0 ? 'hsl(38 95% 55%)' : undefined },
    { label: 'Interested', path: '/status/interested', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(142 69% 45%)' }} />, badge: counts.interested },
    { label: 'Not Interested', path: '/status/not-interested', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(0 72% 55%)' }} />, badge: counts.not_interested },
    { label: 'Unsure', path: '/status/unsure', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(38 95% 55%)' }} />, badge: counts.unsure },
    { label: 'Demo', path: '/status/demo', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(262 83% 65%)' }} />, badge: counts.demo },
    { label: 'Closed Won', path: '/status/closed-won', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(142 69% 55%)' }} />, badge: counts.closed_won },
    { label: 'Closed Lost', path: '/status/closed-lost', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(0 50% 40%)' }} />, badge: counts.closed_lost },
  ];

  return (
    <aside className="w-60 shrink-0 h-screen flex flex-col border-r border-sidebar-border bg-sidebar overflow-y-auto">
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
        <NavLink item={{ label: 'Add Lead', path: '/add', icon: <Plus size={15} />, color: 'hsl(142 69% 45%)' }} onNav={onClose} />
        <NavLink item={{ label: 'Bulk Import', path: '/bulk', icon: <Layers size={15} /> }} onNav={onClose} />
        <NavLink item={{ label: 'Finder', path: '/finder', icon: <Search size={15} />, color: 'hsl(262 83% 65%)' }} onNav={onClose} />
        <NavLink item={{ label: 'Coverage Map', path: '/finder/coverage', icon: <MapPin size={15} />, color: 'hsl(192 91% 52%)' }} onNav={onClose} />
        <NavLink item={{ label: 'Cost Calculator', path: '/costs', icon: <Calculator size={15} /> }} onNav={onClose} />
      </div>

      {/* Total count */}
      <div className="px-4 py-1.5 text-xs text-muted-foreground flex items-center gap-1.5">
        <Users size={11} />
        <span>{counts.total} total leads</span>
      </div>

      <div className="flex-1 px-3 py-2 space-y-4 overflow-y-auto">
        <NavGroup label="Sections">
          <UnsortedGroup counts={counts} onNav={onClose} />
        </NavGroup>

        <NavGroup label="Status">
          {statusPages.map(item => <NavLink key={item.path} item={item} onNav={onClose} />)}
        </NavGroup>

        <NavGroup label="Outreach">
          <NavLink item={{ label: 'Campaigns', path: '/campaigns', icon: <Megaphone size={15} />, color: 'hsl(213 94% 58%)' }} onNav={onClose} />
          <NavLink item={{ label: 'Inbox', path: '/inbox', icon: <MessageCircle size={15} />, color: 'hsl(142 69% 45%)' }} onNav={onClose} />
          <NavLink item={{ label: 'Call List', path: '/call-list', icon: <PhoneCall size={15} />, color: 'hsl(38 95% 55%)' }} onNav={onClose} />
        </NavGroup>
      </div>

      {/* Settings + Sign out */}
      <div className="px-3 py-3 border-t border-sidebar-border space-y-0.5">
        <NavLink item={{ label: 'Settings', path: '/settings', icon: <Settings size={15} /> }} onNav={onClose} />
        <button
          onClick={signOut}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm transition-all duration-100 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground w-full"
        >
          <LogOut size={15} className="text-muted-foreground" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
