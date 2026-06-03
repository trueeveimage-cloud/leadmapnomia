import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCRM } from '@/context/CRMContext';
import { useAuth } from '@/context/AuthContext';
import {
  Plus, Layers, Phone, Mail, Zap,
  Settings, BarChart2, Users, ChevronDown, Search, Calculator,
  Megaphone, MessageCircle, PhoneCall, LogOut, MapPin,
  ArrowRight, BookOpen, AlertCircle, X, Globe,
  ThumbsUp, ThumbsDown, HelpCircle, Target, Trophy, Skull, Bell, Flame,
  Send, Inbox as InboxIcon, Crown, Clock, Ban, Archive
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ProductSwitcher from '@/components/ProductSwitcher';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  badge?: number;
  color?: string;
  glow?: boolean;
}

function SidebarNavLink({ item, onNav }: { item: NavItem; onNav?: () => void }) {
  const { pathname, search } = useLocation();
  const [linkPath, linkQuery] = item.path.split('?');
  const active = linkQuery
    ? pathname === linkPath && search.includes(linkQuery)
    : pathname === linkPath && (linkPath !== '/hot-leads' || !search.includes('view='));
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

const OUTREACH_PATHS = ['/campaigns', '/inbox', '/call-list', '/callbacks'];
const EMAIL_PATHS = ['/hot-leads', '/mailbox', '/email-finder'];
const TOOLS_PATHS = ['/add', '/email-finder'];
const CLOSING_PATHS = ['/status/interested', '/status/not-interested', '/status/unsure', '/status/demo', '/status/making-demo', '/status/closed-won', '/status/closed-lost'];
const LEADS_PATHS = ['/unsorted', '/phone', '/email', '/both', '/missing', '/status/has-website'];
const NOMIA_PATHS = ['/bulk', '/quick-send', '/finder', '/finder/coverage', '/costs', '/campaigns/compare', '/guide', '/dashboard'];

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
            <div className="text-sm font-bold text-foreground leading-tight">CRM</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Sales</div>
          </div>
        </Link>
        {onClose && (
          <button onClick={onClose} className="md:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Product switcher: Nomia (gold) / Leadmap (white) */}
      <ProductSwitcher />

      {/* Quick actions: Nomia + Leadline split */}
      <div className="px-3 pt-3 pb-2 space-y-2">
        <Link
          to="/next"
          onClick={onClose}
          className={cn(
            "flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 border group",
            pathname === '/next'
              ? "bg-primary/20 text-primary border-primary/40"
              : "bg-gradient-to-r from-primary/15 to-primary/5 text-primary hover:from-primary/25 hover:to-primary/10 border-primary/20 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10"
          )}
        >
          <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center transition-transform duration-200 group-hover:scale-110">
            <ArrowRight size={13} />
          </div>
          <span className="flex-1">Nomia · Next Call</span>
          <span className="text-[9px] uppercase font-bold text-primary/60">No site</span>
        </Link>

        <Link
          to="/next-leadline"
          onClick={onClose}
          className={cn(
            "flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 border group",
            pathname === '/next-leadline'
              ? "bg-[hsl(213,94%,58%)]/20 text-[hsl(213,94%,75%)] border-[hsl(213,94%,58%)]/40"
              : "bg-gradient-to-r from-[hsl(213,94%,58%)]/12 to-[hsl(213,94%,58%)]/5 text-[hsl(213,94%,75%)] border-[hsl(213,94%,58%)]/20 hover:from-[hsl(213,94%,58%)]/22 hover:to-[hsl(213,94%,58%)]/10 hover:border-[hsl(213,94%,58%)]/35 hover:shadow-lg hover:shadow-[hsl(213,94%,58%)]/10"
          )}
        >
          <div className="w-6 h-6 rounded-md bg-[hsl(213,94%,58%)]/25 flex items-center justify-center transition-transform duration-200 group-hover:scale-110">
            <PhoneCall size={13} />
          </div>
          <span className="flex-1">Leadline · Next Call</span>
          <span className="text-[9px] uppercase font-bold text-[hsl(213,94%,75%)]/70">Voice</span>
        </Link>

        <Link
          to="/hot-leads"
          onClick={onClose}
          className={cn(
            "flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 border group",
            pathname === '/hot-leads'
              ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
              : "bg-gradient-to-r from-rose-500/10 to-orange-500/5 text-rose-400 border-rose-500/20 hover:from-rose-500/20 hover:to-orange-500/10 hover:border-rose-500/40 hover:shadow-lg hover:shadow-rose-500/10"
          )}
        >
          <div className="w-6 h-6 rounded-md bg-rose-500/20 flex items-center justify-center transition-transform duration-200 group-hover:scale-110">
            <Flame size={13} />
          </div>
          <span>Hot Leads</span>
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
        {/* SMS Outreach */}
        <NavGroup label="SMS Outreach" icon={<Megaphone size={14} />} color="hsl(213, 94%, 58%)" paths={OUTREACH_PATHS}>
          <SidebarNavLink item={{ label: 'Campaigns', path: '/campaigns', icon: <Megaphone size={15} />, color: 'hsl(213 94% 58%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Inbox', path: '/inbox', icon: <MessageCircle size={15} />, color: 'hsl(142 69% 45%)', glow: notifications.unreadInbox > 0, badge: notifications.unreadInbox > 0 ? notifications.unreadInbox : undefined }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Call List', path: '/call-list', icon: <PhoneCall size={15} />, color: 'hsl(38 95% 55%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Callbacks', path: '/callbacks', icon: <Bell size={15} />, color: 'hsl(38 95% 55%)', badge: counts.callbacksDue > 0 ? counts.callbacksDue : counts.callbacks }} onNav={onClose} />
        </NavGroup>

        {/* Email Outreach (new) */}
        <NavGroup label="Email Outreach" icon={<Send size={14} />} color="hsl(280, 80%, 65%)" paths={EMAIL_PATHS}>
          {/* Prominent Compose button */}
          <Link
            to="/mailbox"
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-2 mb-1 rounded-lg text-sm font-semibold bg-gradient-to-r from-[hsl(280,80%,65%)]/20 to-[hsl(280,80%,65%)]/5 text-[hsl(280,80%,75%)] border border-[hsl(280,80%,65%)]/30 hover:from-[hsl(280,80%,65%)]/30 hover:to-[hsl(280,80%,65%)]/10 hover:shadow-md hover:shadow-[hsl(280,80%,65%)]/10 transition-all group"
          >
            <div className="w-6 h-6 rounded-md bg-[hsl(280,80%,65%)]/25 flex items-center justify-center transition-transform group-hover:scale-110">
              <Send size={13} />
            </div>
            <span>Compose Email</span>
          </Link>
          <SidebarNavLink item={{ label: 'S-Tier Queue', path: '/hot-leads?view=s', icon: <Crown size={15} />, color: 'hsl(300 85% 65%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'A+ Hot Queue', path: '/hot-leads?view=aplus', icon: <Flame size={15} />, color: 'hsl(0 85% 60%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Gmail Outreach', path: '/hot-leads?view=no_email', icon: <Mail size={15} />, color: 'hsl(280 80% 65%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Mailbox', path: '/mailbox', icon: <InboxIcon size={15} />, color: 'hsl(213 94% 58%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Follow-ups', path: '/hot-leads?view=follow_up', icon: <Clock size={15} />, color: 'hsl(38 95% 55%)' }} onNav={onClose} />
        </NavGroup>

        {/* Tools */}
        <NavGroup label="Tools" icon={<Search size={14} />} color="hsl(262, 83%, 65%)" paths={TOOLS_PATHS}>
          <SidebarNavLink item={{ label: 'Add Lead', path: '/add', icon: <Plus size={15} /> }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Email Finder', path: '/email-finder', icon: <Mail size={15} />, color: 'hsl(280 80% 65%)' }} onNav={onClose} />
        </NavGroup>

        {/* Closing */}
        <NavGroup label="Closing" icon={<Target size={14} />} color="hsl(142, 69%, 45%)" paths={CLOSING_PATHS}>
          <SidebarNavLink item={{ label: 'Interested', path: '/status/interested', icon: <ThumbsUp size={14} />, badge: counts.interested, color: 'hsl(142 69% 45%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Not Interested', path: '/status/not-interested', icon: <ThumbsDown size={14} />, badge: counts.not_interested, color: 'hsl(0 72% 55%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Unsure', path: '/status/unsure', icon: <HelpCircle size={14} />, badge: counts.unsure, color: 'hsl(38 95% 55%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Demo', path: '/status/demo', icon: <Target size={14} />, badge: counts.demo, color: 'hsl(262 83% 65%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Making Demo', path: '/status/making-demo', icon: <Zap size={14} />, badge: counts.making_demo, color: 'hsl(230 80% 60%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Closed Won', path: '/status/closed-won', icon: <Trophy size={14} />, badge: counts.closed_won, color: 'hsl(142 69% 55%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Closed Lost', path: '/status/closed-lost', icon: <Skull size={14} />, badge: counts.closed_lost, color: 'hsl(0 50% 40%)' }} onNav={onClose} />
        </NavGroup>

        {/* Leads (below Closing) */}
        <LeadsGroup counts={counts} onNav={onClose} />

        {/* Nomia — legacy/extras */}
        <NavGroup label="Nomia" icon={<Archive size={14} />} color="hsl(215, 15%, 55%)" paths={NOMIA_PATHS}>
          <SidebarNavLink item={{ label: 'Maps Finder', path: '/finder', icon: <Search size={15} />, color: 'hsl(262 83% 65%)' }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Statistics', path: '/dashboard', icon: <BarChart2 size={15} /> }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'A/B Compare', path: '/campaigns/compare', icon: <BarChart2 size={15} /> }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Quick Send', path: '/quick-send', icon: <MessageCircle size={15} /> }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Bulk Import', path: '/bulk', icon: <Layers size={15} /> }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Coverage Map', path: '/finder/coverage', icon: <MapPin size={15} /> }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Cost Calculator', path: '/costs', icon: <Calculator size={15} /> }} onNav={onClose} />
          <SidebarNavLink item={{ label: 'Guide', path: '/guide', icon: <BookOpen size={15} /> }} onNav={onClose} />
        </NavGroup>
      </div>

      {/* Bottom */}
      <div className="px-3 py-2.5 border-t border-sidebar-border space-y-0.5 bg-sidebar">
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
