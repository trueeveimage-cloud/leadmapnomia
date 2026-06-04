import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCRM } from '@/context/CRMContext';
import { useAuth } from '@/context/AuthContext';
import { useProduct, type Product } from '@/context/ProductContext';
import {
  Plus, Layers, Phone, Mail, Zap,
  Settings, BarChart2, Users, ChevronDown, Search, Calculator,
  Megaphone, MessageCircle, PhoneCall, LogOut, MapPin,
  BookOpen, AlertCircle, X, Globe,
  ThumbsUp, ThumbsDown, HelpCircle, Target, Trophy, Skull, Bell, Flame,
  Send, Inbox as InboxIcon, Crown, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  badge?: number;
  glow?: boolean;
}

function SidebarNavLink({ item, onNav, product }: { item: NavItem; onNav?: () => void; product?: Product }) {
  const { setProduct } = useProduct();
  const { pathname, search } = useLocation();
  const [linkPath, linkQuery] = item.path.split('?');
  const active = linkQuery
    ? pathname === linkPath && search.includes(linkQuery)
    : pathname === linkPath && (linkPath !== '/hot-leads' || !search.includes('view='));
  return (
    <Link
      to={item.path}
      onClick={() => { if (product) setProduct(product); onNav?.(); }}
      className={cn(
        'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors duration-150 group',
        active
          ? 'bg-foreground/[0.08] text-foreground font-medium'
          : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
      )}
    >
      <span className={cn('shrink-0', active ? 'text-foreground' : 'text-muted-foreground group-hover:text-sidebar-accent-foreground')}>
        {item.icon}
      </span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.glow && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-foreground/60 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-foreground/80" />
        </span>
      )}
      {item.badge !== undefined && item.badge > 0 && (
        <span className={cn(
          'text-[10px] px-1.5 py-0.5 rounded font-medium min-w-[20px] text-center tabular-nums',
          active ? 'bg-foreground/10 text-foreground' : 'bg-sidebar-accent/60 text-muted-foreground'
        )}>
          {item.badge > 999 ? `${(item.badge / 1000).toFixed(1)}k` : item.badge}
        </span>
      )}
    </Link>
  );
}

function SubGroup({ label, paths, children }: { label: string; paths: string[]; children: React.ReactNode }) {
  const { pathname } = useLocation();
  const containsActive = paths.some(p => pathname === p || pathname.startsWith(p + '/'));
  const [manualToggle, setManualToggle] = React.useState<boolean | null>(null);
  React.useEffect(() => { if (containsActive) setManualToggle(null); }, [containsActive]);
  const open = manualToggle !== null ? manualToggle : containsActive;
  return (
    <div>
      <button
        onClick={() => setManualToggle(prev => prev !== null ? !prev : !containsActive)}
        className="flex items-center gap-2 w-full px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] rounded-md text-muted-foreground/80 hover:text-foreground hover:bg-sidebar-accent/40 transition-colors"
      >
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown size={12} className={cn('transition-transform', open ? '' : '-rotate-90')} />
      </button>
      <div className={cn('overflow-hidden transition-all', open ? 'max-h-[600px] opacity-100 mt-0.5' : 'max-h-0 opacity-0')}>
        <div className="space-y-px pb-1 pl-1">{children}</div>
      </div>
    </div>
  );
}

function TopSection({
  label, product, accentClass, children, defaultOpen,
}: {
  label: string;
  product: Product;
  accentClass: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const { product: active } = useProduct();
  const isActive = active === product;
  const [open, setOpen] = React.useState<boolean>(defaultOpen ?? isActive);
  React.useEffect(() => { if (isActive) setOpen(true); }, [isActive]);

  return (
    <div className={cn('rounded-lg border transition-colors', isActive ? 'border-foreground/20 bg-foreground/[0.03]' : 'border-sidebar-border/60')}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 text-[12px] font-bold uppercase tracking-[0.12em]"
      >
        <span className={cn('inline-block h-2 w-2 rounded-full', accentClass)} />
        <span className={cn('flex-1 text-left', isActive ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
        {isActive && <span className="text-[9px] font-semibold text-foreground/60">ACTIVE</span>}
        <ChevronDown size={13} className={cn('transition-transform', open ? '' : '-rotate-90')} />
      </button>
      <div className={cn('overflow-hidden transition-all', open ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0')}>
        <div className="px-2 pb-2 space-y-1">{children}</div>
      </div>
    </div>
  );
}

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const { counts, notifications } = useCRM();
  const { signOut } = useAuth();
  const { setProduct } = useProduct();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const goColdCall = (target: 'nomia' | 'leadline') => {
    setProduct(target === 'nomia' ? 'nomia' : 'leadmap');
    navigate(target === 'nomia' ? '/next' : '/next-leadline');
    onClose?.();
  };

  return (
    <aside className="w-64 shrink-0 h-screen flex flex-col border-r border-sidebar-border bg-sidebar overflow-hidden">
      {/* Logo */}
      <div className="px-4 py-3.5 border-b border-sidebar-border flex items-center justify-between">
        <Link to="/dashboard" onClick={onClose} className="flex items-center gap-2.5 group" data-easter-egg>
          <div className="w-8 h-8 rounded-md bg-foreground text-background flex items-center justify-center font-bold text-xs">
            CRM
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground leading-tight">Sales CRM</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Nomia × Leadmap</div>
          </div>
        </Link>
        {onClose && (
          <button onClick={onClose} className="md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Lead count pill */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-sidebar-accent/40 text-[11px] text-muted-foreground">
          <Phone size={11} />
          <span className="font-medium text-foreground/80">{counts.phone.toLocaleString()}</span>
          <span>reachable / {counts.total.toLocaleString()} total</span>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 px-3 py-1 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">

        {/* ============ NOMIA ============ */}
        <TopSection label="Nomia" product="nomia" accentClass="bg-amber-300" defaultOpen>

          <button
            onClick={() => goColdCall('nomia')}
            className={cn(
              'flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-[13px] font-semibold border transition-colors',
              pathname === '/next'
                ? 'bg-amber-300/15 text-amber-200 border-amber-300/40'
                : 'bg-transparent text-foreground border-foreground/15 hover:bg-foreground/[0.06] hover:border-foreground/25'
            )}
          >
            <PhoneCall size={14} className="text-amber-300" />
            <span className="flex-1 text-left">Cold Call</span>
            <span className="text-[9px] uppercase font-bold text-muted-foreground">No site</span>
          </button>

          <SubGroup label="SMS Outreach" paths={['/campaigns', '/inbox', '/call-list', '/callbacks', '/quick-send']}>
            <SidebarNavLink product="nomia" item={{ label: 'Campaigns', path: '/campaigns', icon: <Megaphone size={14} /> }} onNav={onClose} />
            <SidebarNavLink product="nomia" item={{ label: 'Inbox', path: '/inbox', icon: <MessageCircle size={14} />, glow: notifications.unreadInbox > 0, badge: notifications.unreadInbox > 0 ? notifications.unreadInbox : undefined }} onNav={onClose} />
            <SidebarNavLink product="nomia" item={{ label: 'Call List', path: '/call-list', icon: <PhoneCall size={14} /> }} onNav={onClose} />
            <SidebarNavLink product="nomia" item={{ label: 'Callbacks', path: '/callbacks', icon: <Bell size={14} />, badge: counts.callbacksDue > 0 ? counts.callbacksDue : counts.callbacks }} onNav={onClose} />
            <SidebarNavLink product="nomia" item={{ label: 'Quick Send', path: '/quick-send', icon: <Send size={14} /> }} onNav={onClose} />
          </SubGroup>

          <SubGroup label="Closing — Nomia" paths={['/status/interested', '/status/demo', '/status/making-demo', '/status/closed-won', '/status/unsure']}>
            <SidebarNavLink product="nomia" item={{ label: 'Interested', path: '/status/interested', icon: <ThumbsUp size={13} />, badge: counts.interested }} onNav={onClose} />
            <SidebarNavLink product="nomia" item={{ label: 'Unsure', path: '/status/unsure', icon: <HelpCircle size={13} />, badge: counts.unsure }} onNav={onClose} />
            <SidebarNavLink product="nomia" item={{ label: 'Demo', path: '/status/demo', icon: <Target size={13} />, badge: counts.demo }} onNav={onClose} />
            <SidebarNavLink product="nomia" item={{ label: 'Making Demo', path: '/status/making-demo', icon: <Zap size={13} />, badge: counts.making_demo }} onNav={onClose} />
            <SidebarNavLink product="nomia" item={{ label: 'Closed Won', path: '/status/closed-won', icon: <Trophy size={13} />, badge: counts.closed_won }} onNav={onClose} />
          </SubGroup>

          <SubGroup label="Tools — Nomia" paths={['/finder', '/finder/coverage', '/bulk', '/add', '/costs', '/dashboard', '/campaigns/compare', '/guide']}>
            <SidebarNavLink product="nomia" item={{ label: 'Maps Finder', path: '/finder', icon: <Search size={14} /> }} onNav={onClose} />
            <SidebarNavLink product="nomia" item={{ label: 'Coverage Map', path: '/finder/coverage', icon: <MapPin size={14} /> }} onNav={onClose} />
            <SidebarNavLink product="nomia" item={{ label: 'Add Lead', path: '/add', icon: <Plus size={14} /> }} onNav={onClose} />
            <SidebarNavLink product="nomia" item={{ label: 'Bulk Import', path: '/bulk', icon: <Layers size={14} /> }} onNav={onClose} />
            <SidebarNavLink product="nomia" item={{ label: 'Statistics', path: '/dashboard', icon: <BarChart2 size={14} /> }} onNav={onClose} />
            <SidebarNavLink product="nomia" item={{ label: 'A/B Compare', path: '/campaigns/compare', icon: <BarChart2 size={14} /> }} onNav={onClose} />
            <SidebarNavLink product="nomia" item={{ label: 'Cost Calculator', path: '/costs', icon: <Calculator size={14} /> }} onNav={onClose} />
            <SidebarNavLink product="nomia" item={{ label: 'Guide', path: '/guide', icon: <BookOpen size={14} /> }} onNav={onClose} />
          </SubGroup>
        </TopSection>

        {/* ============ LEADMAP ============ */}
        <TopSection label="Leadmap" product="leadmap" accentClass="bg-foreground">

          <button
            onClick={() => goColdCall('leadline')}
            className={cn(
              'flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-[13px] font-semibold border transition-colors',
              pathname === '/next-leadline'
                ? 'bg-foreground/15 text-foreground border-foreground/40'
                : 'bg-transparent text-foreground border-foreground/15 hover:bg-foreground/[0.06] hover:border-foreground/25'
            )}
          >
            <PhoneCall size={14} className="text-foreground" />
            <span className="flex-1 text-left">Cold Call</span>
            <span className="text-[9px] uppercase font-bold text-muted-foreground">Voice</span>
          </button>

          <SubGroup label="Email Outreach" paths={['/hot-leads', '/mailbox', '/email-finder']}>
            <Link
              to="/mailbox"
              onClick={() => { setProduct('leadmap'); onClose?.(); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[13px] font-semibold border border-foreground/15 hover:bg-foreground/[0.06] hover:border-foreground/25 text-foreground"
            >
              <Send size={13} />
              <span>Compose Email</span>
            </Link>
            <SidebarNavLink product="leadmap" item={{ label: 'S-Tier Queue', path: '/hot-leads?view=s', icon: <Crown size={14} /> }} onNav={onClose} />
            <SidebarNavLink product="leadmap" item={{ label: 'A+ Hot Queue', path: '/hot-leads?view=aplus', icon: <Flame size={14} /> }} onNav={onClose} />
            <SidebarNavLink product="leadmap" item={{ label: 'Gmail Outreach', path: '/hot-leads?view=no_email', icon: <Mail size={14} /> }} onNav={onClose} />
            <SidebarNavLink product="leadmap" item={{ label: 'Mailbox', path: '/mailbox', icon: <InboxIcon size={14} /> }} onNav={onClose} />
            <SidebarNavLink product="leadmap" item={{ label: 'Email Finder', path: '/email-finder', icon: <Mail size={14} /> }} onNav={onClose} />
            <SidebarNavLink product="leadmap" item={{ label: 'Follow-ups', path: '/hot-leads?view=follow_up', icon: <Clock size={14} /> }} onNav={onClose} />
          </SubGroup>

          <SubGroup label="Closing — Leadmap" paths={['/status/not-interested', '/status/closed-lost']}>
            <SidebarNavLink product="leadmap" item={{ label: 'Not Interested', path: '/status/not-interested', icon: <ThumbsDown size={13} />, badge: counts.not_interested }} onNav={onClose} />
            <SidebarNavLink product="leadmap" item={{ label: 'Closed Lost', path: '/status/closed-lost', icon: <Skull size={13} />, badge: counts.closed_lost }} onNav={onClose} />
          </SubGroup>

          <SubGroup label="Leads" paths={['/unsorted', '/phone', '/email', '/both', '/missing', '/status/has-website']}>
            <SidebarNavLink product="leadmap" item={{ label: 'All Leads', path: '/unsorted', icon: <Users size={14} />, badge: counts.total }} onNav={onClose} />
            <SidebarNavLink product="leadmap" item={{ label: 'Has Phone', path: '/phone', icon: <Phone size={14} />, badge: counts.phone }} onNav={onClose} />
            <SidebarNavLink product="leadmap" item={{ label: 'Has Email', path: '/email', icon: <Mail size={14} />, badge: counts.email }} onNav={onClose} />
            <SidebarNavLink product="leadmap" item={{ label: 'Both', path: '/both', icon: <Zap size={14} />, badge: counts.both }} onNav={onClose} />
            <SidebarNavLink product="leadmap" item={{ label: 'Missing Info', path: '/missing', icon: <AlertCircle size={14} />, badge: counts.missing }} onNav={onClose} />
            <SidebarNavLink product="leadmap" item={{ label: 'Has Website', path: '/status/has-website', icon: <Globe size={14} />, badge: counts.hasWebsite }} onNav={onClose} />
          </SubGroup>
        </TopSection>
      </div>

      {/* Bottom */}
      <div className="px-3 py-2.5 border-t border-sidebar-border space-y-0.5 bg-sidebar">
        <SidebarNavLink item={{ label: 'Settings', path: '/settings', icon: <Settings size={14} /> }} onNav={onClose} />
        <button
          onClick={signOut}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors text-sidebar-foreground hover:bg-foreground/[0.06] hover:text-foreground w-full group"
        >
          <LogOut size={14} className="text-muted-foreground group-hover:text-foreground" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
