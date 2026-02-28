import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCRM } from '@/context/CRMContext';
import { useAuth } from '@/context/AuthContext';
import {
  Plus, Layers, Phone, Mail, Zap,
  Settings, BarChart2, Inbox, Users, ChevronDown, ChevronRight, Search, Calculator,
  Megaphone, MessageCircle, PhoneCall, LogOut, MapPin,
  ArrowRight, BookOpen, AlertCircle, X, LayoutDashboard
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
        'flex items-center gap-2.5 py-2 rounded-lg text-sm transition-all duration-200 group',
        indent ? 'px-2 ml-4' : 'px-3',
        active
          ? 'bg-primary/10 text-primary font-medium shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]'
          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:translate-x-0.5'
      )}
    >
      <span className={cn(
        'shrink-0 transition-colors duration-200',
        active ? 'text-primary' : 'text-muted-foreground group-hover:text-sidebar-accent-foreground'
      )} style={item.color && !active ? { color: item.color } : undefined}>
        {item.icon}
      </span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <span className={cn(
          'text-[10px] px-1.5 py-0.5 rounded-full font-semibold min-w-[20px] text-center transition-all duration-200',
          active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
        )}>
          {item.badge > 999 ? `${(item.badge / 1000).toFixed(1)}k` : item.badge}
        </span>
      )}
    </Link>
  );
}

function NavGroup({ label, children, defaultOpen = true, icon }: { label: string; children: React.ReactNode; defaultOpen?: boolean; icon?: React.ReactNode }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="animate-fade-in">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-3 w-full px-3 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-all duration-200 rounded-lg hover:bg-sidebar-accent/50 border border-transparent hover:border-sidebar-border"
      >
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
        <span className="flex-1 text-left">{label}</span>
        <span className={cn("transition-transform duration-200", open ? "rotate-0" : "-rotate-90")}>
          <ChevronDown size={14} />
        </span>
      </button>
      <div className={cn(
        "overflow-hidden transition-all duration-300 ease-out",
        open ? "max-h-[500px] opacity-100 mt-0.5" : "max-h-0 opacity-0"
      )}>
        <div className="space-y-0.5 pb-1">{children}</div>
      </div>
    </div>
  );
}

function UnsortedGroup({ counts, onNav }: { counts: ReturnType<typeof useCRM>['counts']; onNav?: () => void }) {
  const [subOpen, setSubOpen] = React.useState(false);
  const { pathname } = useLocation();

  const subsections: NavItem[] = [
    { label: 'Has Phone', path: '/phone', icon: <Phone size={13} />, badge: counts.phone, color: 'hsl(142 69% 45%)' },
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
            'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 group flex-1 min-w-0',
            isUnsortedActive
              ? 'bg-primary/10 text-primary font-medium shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]'
              : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:translate-x-0.5'
          )}
        >
          <span className={cn('shrink-0 transition-colors', isUnsortedActive ? 'text-primary' : 'text-muted-foreground group-hover:text-sidebar-accent-foreground')}>
            <Inbox size={15} />
          </span>
          <span className="flex-1 truncate">Unsorted</span>
          {counts.unsorted > 0 && (
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-full font-semibold min-w-[20px] text-center',
              isUnsortedActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
            )}>
              {counts.unsorted > 999 ? `${(counts.unsorted / 1000).toFixed(1)}k` : counts.unsorted}
            </span>
          )}
        </Link>
        <button
          onClick={() => setSubOpen(o => !o)}
          className={cn(
            'p-1.5 rounded-lg transition-all duration-200 shrink-0',
            (subOpen || isSubActive) ? 'text-primary bg-primary/5' : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent'
          )}
          title="Toggle subsections"
        >
          <span className={cn("block transition-transform duration-200", (subOpen || isSubActive) ? "rotate-0" : "-rotate-90")}>
            <ChevronDown size={12} />
          </span>
        </button>
      </div>

      <div className={cn(
        "overflow-hidden transition-all duration-300 ease-out",
        (subOpen || isSubActive) ? "max-h-[200px] opacity-100" : "max-h-0 opacity-0"
      )}>
        <div className="mt-0.5 space-y-0.5 ml-3 border-l-2 border-primary/10 pl-2">
          {subsections.map(item => (
            <NavLink key={item.path} item={item} onNav={onNav} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const { counts } = useCRM();
  const { signOut } = useAuth();

  const pipelinePages: NavItem[] = [
    { label: 'Not Contacted', path: '/status/not-contacted', icon: <span className="w-2 h-2 rounded-full bg-muted-foreground/70 shrink-0" />, badge: counts.not_contacted },
    { label: 'Contacted', path: '/status/contacted', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(213 94% 58%)' }} />, badge: counts.contacted },
    { label: 'Answered', path: '/status/answered', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(142 69% 45%)' }} />, badge: counts.answered },
    { label: 'Callbacks', path: '/callbacks', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(38 95% 55%)' }} />, badge: counts.callbacksDue > 0 ? counts.callbacksDue : counts.callbacks, color: counts.callbacksDue > 0 ? 'hsl(38 95% 55%)' : undefined },
  ];

  const closingPages: NavItem[] = [
    { label: 'Interested', path: '/status/interested', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(142 69% 45%)' }} />, badge: counts.interested },
    { label: 'Not Interested', path: '/status/not-interested', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(0 72% 55%)' }} />, badge: counts.not_interested },
    { label: 'Unsure', path: '/status/unsure', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(38 95% 55%)' }} />, badge: counts.unsure },
    { label: 'Demo', path: '/status/demo', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(262 83% 65%)' }} />, badge: counts.demo },
    { label: 'Closed Won', path: '/status/closed-won', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(142 69% 55%)' }} />, badge: counts.closed_won },
    { label: 'Closed Lost', path: '/status/closed-lost', icon: <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(0 50% 40%)' }} />, badge: counts.closed_lost },
  ];

  return (
    <aside className="w-64 shrink-0 h-screen flex flex-col border-r border-sidebar-border bg-sidebar overflow-hidden">
      {/* Logo + close on mobile */}
      <div className="px-4 py-3.5 border-b border-sidebar-border flex items-center justify-between">
        <Link to="/dashboard" onClick={onClose} className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20 transition-transform duration-200 group-hover:scale-105">
            <BarChart2 size={15} className="text-primary-foreground" />
          </div>
          <div>
            <div className="text-sm font-bold text-foreground leading-tight">LeadMap</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">CRM</div>
          </div>
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Quick actions */}
      <div className="px-3 pt-3 pb-2 space-y-2">
        <Link
          to="/next"
          onClick={onClose}
          className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-primary/15 to-primary/5 text-primary hover:from-primary/25 hover:to-primary/10 transition-all duration-300 border border-primary/20 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10 group"
        >
          <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center transition-transform duration-200 group-hover:scale-110">
            <ArrowRight size={13} />
          </div>
          <span>Next Lead</span>
          <span className="ml-auto text-[10px] text-primary/50 font-mono">N</span>
        </Link>

        <Link
          to="/dashboard"
          onClick={onClose}
          className={cn(
            "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200",
            useLocation().pathname === '/dashboard'
              ? "bg-primary/10 text-primary font-medium"
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
        >
          <LayoutDashboard size={15} className={useLocation().pathname === '/dashboard' ? 'text-primary' : 'text-muted-foreground'} />
          <span>Dashboard</span>
        </Link>
      </div>

      {/* Lead count pill */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-secondary/40 text-xs text-muted-foreground">
          <Users size={11} />
          <span className="font-medium">{counts.total.toLocaleString()} total leads</span>
        </div>
      </div>

      {/* Scrollable nav */}
      <div className="flex-1 px-3 py-1 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        <NavGroup label="Leads" icon={<Users size={14} />}>
          <UnsortedGroup counts={counts} onNav={onClose} />
          <NavLink item={{ label: 'Add Lead', path: '/add', icon: <Plus size={15} /> }} onNav={onClose} />
          <NavLink item={{ label: 'Bulk Import', path: '/bulk', icon: <Layers size={15} /> }} onNav={onClose} />
        </NavGroup>

        <NavGroup label="Outreach" icon={<Megaphone size={14} />}>
          <NavLink item={{ label: 'Campaigns', path: '/campaigns', icon: <Megaphone size={15} />, color: 'hsl(213 94% 58%)' }} onNav={onClose} />
          <NavLink item={{ label: 'Inbox', path: '/inbox', icon: <MessageCircle size={15} />, color: 'hsl(142 69% 45%)' }} onNav={onClose} />
          <NavLink item={{ label: 'Call List', path: '/call-list', icon: <PhoneCall size={15} />, color: 'hsl(38 95% 55%)' }} onNav={onClose} />
        </NavGroup>

        <NavGroup label="Tools" icon={<Search size={14} />} defaultOpen={false}>
          <NavLink item={{ label: 'Finder', path: '/finder', icon: <Search size={15} />, color: 'hsl(262 83% 65%)' }} onNav={onClose} />
          <NavLink item={{ label: 'Coverage Map', path: '/finder/coverage', icon: <MapPin size={15} />, color: 'hsl(192 91% 52%)' }} onNav={onClose} />
          <NavLink item={{ label: 'Cost Calculator', path: '/costs', icon: <Calculator size={15} /> }} onNav={onClose} />
        </NavGroup>
      </div>

      {/* Bottom section */}
      <div className="px-3 py-2.5 border-t border-sidebar-border space-y-0.5 bg-sidebar">
        <NavLink item={{ label: 'Guide', path: '/guide', icon: <BookOpen size={15} />, color: 'hsl(262 83% 65%)' }} onNav={onClose} />
        <NavLink item={{ label: 'Settings', path: '/settings', icon: <Settings size={15} /> }} onNav={onClose} />
        <button
          onClick={signOut}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 text-sidebar-foreground hover:bg-destructive/10 hover:text-destructive w-full group"
        >
          <LogOut size={15} className="text-muted-foreground group-hover:text-destructive transition-colors" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
