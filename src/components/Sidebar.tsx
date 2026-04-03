import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCRM } from '@/context/CRMContext';
import { useAuth } from '@/context/AuthContext';
import {
  Plus, Layers, Phone, Mail, Zap,
  Settings, BarChart2, Users, ChevronDown, Search, Calculator,
  Megaphone, MessageCircle, PhoneCall, LogOut, MapPin,
  ArrowRight, BookOpen, AlertCircle, X, Globe,
  ThumbsUp, ThumbsDown, HelpCircle, Target, Trophy, Skull, Bell
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  badge?: number;
  color?: string;
  glow?: boolean;
}

function SidebarNavLink({ item, onNav }: { item: NavItem; onNav?: () => void }) {
  const { pathname } = useLocation();
  const active = pathname === item.path;
  return (
    <Link
      to={item.path}
      onClick={onNav}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 group',
        active
          ? 'bg-primary/10 text-primary font-medium shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]'
          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:translate-x-0.5'
      )}
    >
      <span
        className={cn(
          'shrink-0 transition-colors duration-200',
          active ? 'text-primary' : 'text-muted-foreground group-hover:text-sidebar-accent-foreground',
          item.glow && 'animate-pulse drop-shadow-[0_0_6px_currentColor]'
        )}
        style={item.color && !active ? { color: item.color } : undefined}
      >
        {item.icon}
      </span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.glow && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: item.color || 'hsl(var(--primary))' }} />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: item.color || 'hsl(var(--primary))' }} />
        </span>
      )}
      {item.badge !== undefined && item.badge > 0 && (
        <span className={cn(
          'text-[10px] px-1.5 py-0.5 rounded-full font-semibold min-w-[20px] text-center',
          active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
        )}>
          {item.badge > 999 ? `${(item.badge / 1000).toFixed(1)}k` : item.badge}
        </span>
      )}
    </Link>
  );
}

const OUTREACH_PATHS = ['/campaigns', '/inbox', '/call-list', '/callbacks', '/quick-send'];
const TOOLS_PATHS = ['/add', '/bulk', '/finder', '/finder/coverage', '/costs'];
const CLOSING_PATHS = ['/status/interested', '/status/not-interested', '/status/unsure', '/status/demo', '/status/closed-won', '/status/closed-lost'];
const LEADS_PATHS = ['/unsorted', '/phone', '/email', '/both', '/missing', '/status/has-website'];

function NavGroup({ label, children, icon, color, paths }: { label: string; children: React.ReactNode; icon: React.ReactNode; color?: string; paths: string[] }) {
  const { pathname } = useLocation();
  const containsActive = paths.some(p => pathname === p || pathname.startsWith(p + '/'));
  const [manualToggle, setManualToggle] = React.useState<boolean | null>(null);

  // Reset manual toggle when navigating to a different group
  React.useEffect(() => {
    if (containsActive) setManualToggle(null);
  }, [containsActive]);

  const open = manualToggle !== null ? manualToggle : containsActive;

  return (
    <div>
      <button
        onClick={() => setManualToggle(prev => prev !== null ? !prev : !containsActive)}
        className={cn(
          "flex items-center gap-2 w-full px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-200 rounded-lg border bg-sidebar-accent/20",
          color
            ? `hover:bg-opacity-20 border-opacity-30 hover:border-opacity-50`
            : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60 border-sidebar-border/40 hover:border-sidebar-border"
        )}
        style={color ? { color, borderColor: `${color}30`, background: `${color}08` } : undefined}
      >
        <span style={color ? { color } : undefined} className={color ? '' : 'text-muted-foreground/70'}>{icon}</span>
        <span className="flex-1 text-left">{label}</span>
        <span className={cn("transition-transform duration-200", open ? "rotate-0" : "-rotate-90")}>
          <ChevronDown size={13} />
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

function LeadsGroup({ counts, onNav }: { counts: ReturnType<typeof useCRM>['counts']; onNav?: () => void }) {
  const { pathname } = useLocation();

  const subsections: NavItem[] = [
    { label: 'Has Phone', path: '/phone', icon: <Phone size={14} />, badge: counts.phone, color: 'hsl(142 69% 45%)' },
    { label: 'Has Email', path: '/email', icon: <Mail size={14} />, badge: counts.email, color: 'hsl(213 94% 58%)' },
    { label: 'Both', path: '/both', icon: <Zap size={14} />, badge: counts.both, color: 'hsl(262 83% 65%)' },
    { label: 'Missing Info', path: '/missing', icon: <AlertCircle size={14} />, badge: counts.missing, color: 'hsl(38 95% 55%)' },
    { label: 'Has Website', path: '/status/has-website', icon: <Globe size={14} />, badge: counts.hasWebsite, color: 'hsl(192 91% 52%)' },
  ];

  const containsActive = LEADS_PATHS.some(p => pathname === p);
  const [manualToggle, setManualToggle] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    if (containsActive) setManualToggle(null);
  }, [containsActive]);

  const open = manualToggle !== null ? manualToggle : containsActive;
  const groupColor = 'hsl(38, 95%, 55%)';

  return (
    <div>
      <button
        onClick={() => setManualToggle(prev => prev !== null ? !prev : !containsActive)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-200 rounded-lg border"
        style={{ color: groupColor, borderColor: `${groupColor}30`, background: `${groupColor}08` }}
      >
        <span style={{ color: groupColor }}><Users size={14} /></span>
        <span className="flex-1 text-left">Leads</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-muted text-muted-foreground">
          {counts.total > 999 ? `${(counts.total / 1000).toFixed(1)}k` : counts.total}
        </span>
        <span className={cn("transition-transform duration-200", open ? "rotate-0" : "-rotate-90")}>
          <ChevronDown size={13} />
        </span>
      </button>
      <div className={cn(
        "overflow-hidden transition-all duration-300 ease-out",
        open ? "max-h-[300px] opacity-100 mt-0.5" : "max-h-0 opacity-0"
      )}>
        <div className="space-y-0.5 pb-1">
          <SidebarNavLink item={{ label: 'All Leads', path: '/unsorted', icon: <Users size={14} />, badge: counts.total }} onNav={onNav} />
          {subsections.map(item => (
            <SidebarNavLink key={item.path} item={item} onNav={onNav} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const { counts, notifications } = useCRM();
  const { signOut } = useAuth();
  const { pathname } = useLocation();

  return (
    <aside className="w-64 shrink-0 h-screen flex flex-col border-r border-sidebar-border bg-sidebar overflow-hidden">
      {/* Logo */}
      <div className="px-4 py-3.5 border-b border-sidebar-border flex items-center justify-between">
        <Link to="/dashboard" onClick={onClose} className="flex items-center gap-2.5 group" data-easter-egg>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20 transition-transform duration-200 group-hover:scale-105">
            <BarChart2 size={15} className="text-primary-foreground" />
          </div>
          <div>
            <div className="text-sm font-bold text-foreground leading-tight">LeadMap</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">CRM</div>
          </div>
        </Link>
        {onClose && (
          <button onClick={onClose} className="md:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors">
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
            "flex items-center gap-2 w-full px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-200 rounded-lg border",
            pathname === '/dashboard'
              ? "bg-primary/10 text-primary border-primary/20"
              : "hover:bg-opacity-20 border-opacity-30 hover:border-opacity-50"
          )}
          style={pathname !== '/dashboard' ? { color: 'hsl(192, 91%, 52%)', borderColor: 'hsl(192, 91%, 52%, 0.3)', background: 'hsl(192, 91%, 52%, 0.08)' } : undefined}
        >
          <BarChart2 size={14} style={pathname !== '/dashboard' ? { color: 'hsl(192, 91%, 52%)' } : undefined} className={pathname === '/dashboard' ? 'text-primary' : ''} />
          <span>Statistics</span>
        </Link>
      </div>

      {/* Lead count pill */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-secondary/40 text-xs text-muted-foreground">
          <Phone size={11} />
          <span className="font-medium">{counts.phone.toLocaleString()} reachable</span>
          <span className="text-muted-foreground/50">/ {counts.total.toLocaleString()} total</span>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 px-3 py-1 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        {/* Outreach */}
        <NavGroup label="Outreach" icon={<Megaphone size={14} />} color="hsl(213, 94%, 58%)" paths={OUTREACH_PATHS}>
          <SidebarNavLink item={{ label: 'Campaigns', path: '/campaigns', icon: <Megaphone size={15} />, color: 'hsl(213 94% 58%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'A/B Compare', path: '/campaigns/compare', icon: <BarChart2 size={15} />, color: 'hsl(262 83% 65%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Inbox', path: '/inbox', icon: <MessageCircle size={15} />, color: 'hsl(142 69% 45%)', glow: notifications.unreadInbox > 0, badge: notifications.unreadInbox > 0 ? notifications.unreadInbox : undefined }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Call List', path: '/call-list', icon: <PhoneCall size={15} />, color: 'hsl(38 95% 55%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Quick Send', path: '/quick-send', icon: <MessageCircle size={15} />, color: 'hsl(192 91% 52%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Callbacks', path: '/callbacks', icon: <Bell size={15} />, color: 'hsl(38 95% 55%)', badge: counts.callbacksDue > 0 ? counts.callbacksDue : counts.callbacks }} onNav={onClose} />
        </NavGroup>

        {/* Leads & Tools */}
        <NavGroup label="Leads & Tools" icon={<Search size={14} />} color="hsl(262, 83%, 65%)" paths={TOOLS_PATHS}>
          <SidebarNavLink item={{ label: 'Add Lead', path: '/add', icon: <Plus size={15} /> }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Bulk Import', path: '/bulk', icon: <Layers size={15} /> }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Finder', path: '/finder', icon: <Search size={15} />, color: 'hsl(262 83% 65%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Coverage Map', path: '/finder/coverage', icon: <MapPin size={15} />, color: 'hsl(192 91% 52%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Cost Calculator', path: '/costs', icon: <Calculator size={15} /> }} onNav={onClose} />
        </NavGroup>

        {/* Closing */}
        <NavGroup label="Closing" icon={<Target size={14} />} color="hsl(142, 69%, 45%)" paths={CLOSING_PATHS}>
          <SidebarNavLink item={{ label: 'Interested', path: '/status/interested', icon: <ThumbsUp size={14} />, badge: counts.interested, color: 'hsl(142 69% 45%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Not Interested', path: '/status/not-interested', icon: <ThumbsDown size={14} />, badge: counts.not_interested, color: 'hsl(0 72% 55%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Unsure', path: '/status/unsure', icon: <HelpCircle size={14} />, badge: counts.unsure, color: 'hsl(38 95% 55%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Demo', path: '/status/demo', icon: <Target size={14} />, badge: counts.demo, color: 'hsl(262 83% 65%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Closed Won', path: '/status/closed-won', icon: <Trophy size={14} />, badge: counts.closed_won, color: 'hsl(142 69% 55%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Closed Lost', path: '/status/closed-lost', icon: <Skull size={14} />, badge: counts.closed_lost, color: 'hsl(0 50% 40%)' }} onNav={onClose} />
        </NavGroup>

        {/* Leads (below Closing) */}
        <LeadsGroup counts={counts} onNav={onClose} />
      </div>

      {/* Bottom */}
      <div className="px-3 py-2.5 border-t border-sidebar-border space-y-0.5 bg-sidebar">
        <SidebarNavLink item={{ label: 'Guide', path: '/guide', icon: <BookOpen size={15} />, color: 'hsl(262 83% 65%)' }} onNav={onClose} />
        <SidebarNavLink item={{ label: 'Settings', path: '/settings', icon: <Settings size={15} /> }} onNav={onClose} />
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
