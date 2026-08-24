import { Link, useLocation } from 'react-router-dom';
import { useCRM } from '@/context/CRMContext';
import { useAuth } from '@/context/AuthContext';
import { useProduct, type Product } from '@/context/ProductContext';
import { BarChart3, Bell, Bot, Building2, ChevronDown, Inbox, LayoutDashboard, LogOut, Mail, MapPinned, MenuSquare, PhoneCall, Search, Settings, Target, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = { label: string; path: string; icon: typeof Users; badge?: number };

function NavigationLink({ item, onNav }: { item: NavItem; onNav?: () => void }) {
  const { pathname } = useLocation();
  const active = pathname === item.path || pathname.startsWith(`${item.path}/`);
  const Icon = item.icon;
  return <Link to={item.path} onClick={onNav} className={cn('flex h-9 items-center gap-2.5 rounded-md px-3 text-[13px] transition-colors', active ? 'bg-foreground text-background font-medium' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground')}><Icon size={15} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{item.label}</span>{item.badge !== undefined && item.badge > 0 && <span className={cn('rounded px-1.5 py-0.5 text-[10px]', active ? 'bg-background/15' : 'bg-sidebar-accent text-muted-foreground')}>{item.badge > 999 ? `${(item.badge / 1000).toFixed(1)}k` : item.badge}</span>}</Link>;
}

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const { product, setProduct } = useProduct();
  const { counts, notifications } = useCRM();
  const { user, signOut } = useAuth();
  const nomia: Array<{ title: string; items: NavItem[] }> = [
    { title: 'Overview', items: [{ label: 'Dashboard', path: '/nomia/dashboard', icon: LayoutDashboard }] },
    { title: 'Work', items: [{ label: 'Leads', path: '/nomia/leads', icon: Users, badge: counts.total }, { label: 'Cold Calls', path: '/nomia/calls', icon: PhoneCall }, { label: 'Gmail Review', path: '/nomia/email', icon: Mail }] },
    { title: 'Conversations', items: [{ label: 'Inbox', path: '/nomia/inbox', icon: Inbox, badge: notifications.unreadInbox }, { label: 'Pipeline', path: '/nomia/pipeline', icon: Target }] },
    { title: 'Measure', items: [{ label: 'Analytics', path: '/nomia/analytics', icon: BarChart3 }, { label: 'Notifications', path: '/nomia/notifications', icon: Bell, badge: notifications.unreadHistory }] },
  ];
  const leadmap: Array<{ title: string; items: NavItem[] }> = [
    { title: 'Leadmap AI', items: [{ label: 'Dashboard', path: '/leadmap/dashboard', icon: LayoutDashboard }, { label: 'Leadmap CRM', path: '/leadmap/leads', icon: Users, badge: counts.total }, { label: 'Lead Finder', path: '/leadmap/finder', icon: Search }, { label: 'Missed-call Audits', path: '/leadmap/audits', icon: MenuSquare }] },
    { title: 'Outreach', items: [{ label: 'Automation', path: '/leadmap/automation', icon: Bot }, { label: 'Gmail', path: '/leadmap/email', icon: Mail }, { label: 'AI Calls', path: '/leadmap/ai-calls', icon: PhoneCall }, { label: 'Closing', path: '/leadmap/closing', icon: Target }] },
  ];
  const sections = product === 'nomia' ? nomia : leadmap;
  const choose = (next: Product) => { setProduct(next); onClose?.(); };

  return <aside className="flex h-screen w-64 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar">
    <div className="border-b border-sidebar-border p-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <Link to="/" onClick={onClose} className="flex min-w-0 items-center gap-2.5" data-easter-egg><div className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-md border text-xs font-bold', product === 'nomia' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-foreground/20 bg-foreground text-background')}>{product === 'nomia' ? 'N' : 'LM'}</div><div className="min-w-0"><div className="truncate text-sm font-semibold text-foreground">{product === 'nomia' ? 'Nomia CRM' : 'Leadmap AI'}</div><div className="flex items-center gap-1 text-[10px] text-muted-foreground">Switch workspace <ChevronDown size={10} /></div></div></Link>
        {onClose && <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground md:hidden"><X size={17} /></button>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1 rounded-md border border-sidebar-border bg-background/40 p-1">
        <Link to="/nomia/dashboard" onClick={() => choose('nomia')} className={cn('flex h-8 items-center justify-center gap-1.5 rounded text-xs font-medium', product === 'nomia' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}><Building2 size={13} /> Nomia</Link>
        <Link to="/leadmap/dashboard" onClick={() => choose('leadmap')} className={cn('flex h-8 items-center justify-center gap-1.5 rounded text-xs font-medium', product === 'leadmap' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}><MapPinned size={13} /> Leadmap</Link>
      </div>
    </div>
    <div className="grid grid-cols-2 border-b border-sidebar-border px-3 py-3 text-xs"><div><div className="text-muted-foreground">Workspace leads</div><div className="mt-0.5 font-semibold text-foreground">{counts.total.toLocaleString()}</div></div><div><div className="text-muted-foreground">Unread replies</div><div className="mt-0.5 font-semibold text-foreground">{notifications.unreadInbox.toLocaleString()}</div></div></div>
    <nav className="flex-1 overflow-y-auto px-2 py-2">{sections.map(section => <section key={section.title} className="mb-3"><div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{section.title}</div><div className="space-y-0.5">{section.items.map(item => <NavigationLink key={item.path} item={item} onNav={onClose} />)}</div></section>)}</nav>
    <div className="space-y-1 border-t border-sidebar-border p-2"><NavigationLink item={{ label: product === 'nomia' ? 'Nomia Settings' : 'Settings', path: product === 'nomia' ? '/nomia/settings' : '/leadmap/settings', icon: Settings }} onNav={onClose} />{user && <button onClick={signOut} className="flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"><LogOut size={15} /><span>Sign out</span></button>}</div>
  </aside>;
}
