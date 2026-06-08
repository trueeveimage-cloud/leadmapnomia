import React, { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from '@/lib/supabase';
import { useCRM } from '@/context/CRMContext';
import { Bell, Check, Mail, Search, Send, PhoneCall, AlertCircle, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const ICONS: Record<string, React.ReactNode> = {
  email_scrape_done: <Search className="h-4 w-4" />,
  lead_find_done: <Search className="h-4 w-4" />,
  gmail_batch_done: <Mail className="h-4 w-4" />,
  sms_batch_done: <Send className="h-4 w-4" />,
  ai_call_done: <PhoneCall className="h-4 w-4" />,
  ai_call_batch_done: <PhoneCall className="h-4 w-4" />,
  ai_call_started: <PhoneCall className="h-4 w-4" />,
  inbound_reply: <Mail className="h-4 w-4" />,
  lead_status_changed: <Check className="h-4 w-4" />,
  follow_up_set: <Bell className="h-4 w-4" />,
  lead_added: <Check className="h-4 w-4" />,
  bulk_import_done: <Check className="h-4 w-4" />,
  settings_changed: <Check className="h-4 w-4" />,
  outreach_skipped: <AlertCircle className="h-4 w-4" />,
  system_error: <AlertCircle className="h-4 w-4" />,
};

function formatWhen(value: string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return date.toLocaleString();
}

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getTimeGroup(value: string): 'today' | 'yesterday' | 'older' {
  const itemDay = startOfLocalDay(new Date(value)).getTime();
  const today = startOfLocalDay().getTime();
  const yesterday = today - 86_400_000;
  if (itemDay === today) return 'today';
  if (itemDay === yesterday) return 'yesterday';
  return 'older';
}

const GROUP_LABELS = {
  today: 'Today',
  yesterday: 'Yesterday',
  older: 'Older',
};

function NotificationRow({ item, onMarkRead }: { item: AppNotification; onMarkRead: (id: string) => void }) {
  return (
    <div className={`p-4 flex gap-3 ${item.read_at ? 'bg-card' : 'bg-primary/5'}`}>
      <div className={`mt-0.5 h-8 w-8 rounded-md border grid place-items-center ${item.read_at ? 'text-muted-foreground border-border' : 'text-primary border-primary/30 bg-primary/10'}`}>
        {ICONS[item.type] || <Bell className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-medium text-sm">{item.title}</div>
          <div className="text-xs text-muted-foreground">{formatWhen(item.created_at)}</div>
        </div>
        {item.message && <div className="mt-1 text-sm text-muted-foreground">{item.message}</div>}
        {item.payload && Object.keys(item.payload).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(item.payload).slice(0, 6).map(([key, value]) => (
              <span key={key} className="rounded border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                {key}: {String(value)}
              </span>
            ))}
          </div>
        )}
      </div>
      {!item.read_at && (
        <Button variant="ghost" size="sm" onClick={() => onMarkRead(item.id)}>
          <Check className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  const { refreshNotifications } = useCRM();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ today: false, yesterday: false, older: true });

  const unread = useMemo(() => items.filter((item) => !item.read_at).length, [items]);
  const grouped = useMemo(() => {
    const groups: Record<'today' | 'yesterday' | 'older', AppNotification[]> = {
      today: [],
      yesterday: [],
      older: [],
    };
    items.forEach((item) => groups[getTimeGroup(item.created_at)].push(item));
    return groups;
  }, [items]);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await fetchNotifications(150));
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const markOne = async (id: string) => {
    await markNotificationRead(id);
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
    await refreshNotifications();
  };

  const markAll = async () => {
    await markAllNotificationsRead();
    const now = new Date().toISOString();
    setItems((prev) => prev.map((item) => item.read_at ? item : { ...item, read_at: now }));
    await refreshNotifications();
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bell className="h-6 w-6 text-primary" />
              Notification History
            </h1>
            <p className="text-sm text-muted-foreground">
              Finished scrapes, lead finder runs, batch sends, calls, and system events.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={markAll} disabled={unread === 0}>
              <Check className="h-4 w-4 mr-1.5" />
              Mark all read
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading notifications...</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No notifications yet.</div>
          ) : (['today', 'yesterday', 'older'] as const).map((group) => {
            const groupItems = grouped[group];
            const unreadCount = groupItems.filter((item) => !item.read_at).length;
            if (groupItems.length === 0) return null;
            const isCollapsed = collapsed[group];
            return (
              <section key={group} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [group]: !prev[group] }))}
                  className="flex w-full items-center justify-between gap-3 bg-muted/35 px-4 py-3 text-left hover:bg-muted/55"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-sm font-semibold text-foreground">{GROUP_LABELS[group]}</span>
                    <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">{groupItems.length}</span>
                  </div>
                  {unreadCount > 0 && <span className="text-xs font-medium text-primary">{unreadCount} unread</span>}
                </button>
                {!isCollapsed && (
                  <div className="divide-y divide-border">
                    {groupItems.map((item) => <NotificationRow key={item.id} item={item} onMarkRead={markOne} />)}
                  </div>
                )}
              </section>
            );
          })}
        </Card>
      </div>
    </AppLayout>
  );
}
