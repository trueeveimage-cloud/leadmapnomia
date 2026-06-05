import React, { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from '@/lib/supabase';
import { useCRM } from '@/context/CRMContext';
import { Bell, Check, Mail, Search, Send, PhoneCall, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const ICONS: Record<string, React.ReactNode> = {
  email_scrape_done: <Search className="h-4 w-4" />,
  lead_find_done: <Search className="h-4 w-4" />,
  gmail_batch_done: <Mail className="h-4 w-4" />,
  sms_batch_done: <Send className="h-4 w-4" />,
  ai_call_done: <PhoneCall className="h-4 w-4" />,
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

export default function NotificationsPage() {
  const { refreshNotifications } = useCRM();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const unread = useMemo(() => items.filter((item) => !item.read_at).length, [items]);

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

        <Card className="divide-y divide-border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading notifications...</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No notifications yet.</div>
          ) : items.map((item) => (
            <div key={item.id} className={`p-4 flex gap-3 ${item.read_at ? 'bg-card' : 'bg-primary/5'}`}>
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
                <Button variant="ghost" size="sm" onClick={() => markOne(item.id)}>
                  <Check className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </Card>
      </div>
    </AppLayout>
  );
}
