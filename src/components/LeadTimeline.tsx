import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Mail, MessageCircle, Phone, FileText, Calendar, ArrowDownLeft, ArrowUpRight, Activity } from 'lucide-react';
import { format } from 'date-fns';

type Item = {
  id: string;
  at: string;
  kind: 'email_out' | 'email_in' | 'sms_out' | 'sms_in' | 'activity' | 'appointment';
  title: string;
  body?: string;
};

const ICONS: Record<Item['kind'], React.ReactNode> = {
  email_out: <Mail size={13} className="text-[hsl(280,80%,65%)]" />,
  email_in: <ArrowDownLeft size={13} className="text-[hsl(142,69%,55%)]" />,
  sms_out: <ArrowUpRight size={13} className="text-[hsl(213,94%,58%)]" />,
  sms_in: <MessageCircle size={13} className="text-[hsl(142,69%,55%)]" />,
  activity: <Activity size={13} className="text-muted-foreground" />,
  appointment: <Calendar size={13} className="text-[hsl(38,95%,55%)]" />,
};

export default function LeadTimeline({ leadId }: { leadId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [msgs, acts, appts] = await Promise.all([
        supabase.from('message_logs').select('id, channel, direction, body, status, created_at').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(200),
        supabase.from('activities').select('id, type, payload, created_at').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(200),
        supabase.from('lead_appointments').select('id, title, notes, scheduled_at, status').eq('lead_id', leadId).order('scheduled_at', { ascending: false }).limit(50),
      ]);
      if (!alive) return;
      const out: Item[] = [];
      for (const m of (msgs.data || []) as any[]) {
        const isEmail = m.channel === 'email';
        const isOut = m.direction === 'outbound';
        out.push({
          id: 'm' + m.id,
          at: m.created_at,
          kind: isEmail ? (isOut ? 'email_out' : 'email_in') : (isOut ? 'sms_out' : 'sms_in'),
          title: `${isEmail ? 'Email' : 'SMS'} ${isOut ? 'sent' : 'received'}${m.status ? ` · ${m.status}` : ''}`,
          body: (m.body || '').slice(0, 240),
        });
      }
      for (const a of (acts.data || []) as any[]) {
        out.push({
          id: 'a' + a.id,
          at: a.created_at,
          kind: 'activity',
          title: a.type.replace(/_/g, ' '),
          body: typeof a.payload === 'object' && a.payload?.notes ? String(a.payload.notes).slice(0, 240) : undefined,
        });
      }
      for (const ap of (appts.data || []) as any[]) {
        out.push({
          id: 'ap' + ap.id,
          at: ap.scheduled_at,
          kind: 'appointment',
          title: `${ap.title} (${ap.status || 'scheduled'})`,
          body: ap.notes || undefined,
        });
      }
      out.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
      setItems(out);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [leadId]);

  if (loading) return <div className="text-xs text-muted-foreground py-4">Loading timeline…</div>;
  if (items.length === 0) return <div className="text-xs text-muted-foreground py-4">No activity yet.</div>;

  return (
    <div className="space-y-2.5">
      {items.map((it) => (
        <div key={it.id} className="flex gap-2.5 text-xs">
          <div className="mt-0.5 w-6 h-6 rounded-full bg-secondary/40 flex items-center justify-center shrink-0">
            {ICONS[it.kind]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-foreground capitalize truncate">{it.title}</span>
              <span className="text-muted-foreground/70 whitespace-nowrap text-[10px]">
                {format(new Date(it.at), 'MMM d, HH:mm')}
              </span>
            </div>
            {it.body && (
              <div className="text-muted-foreground whitespace-pre-wrap break-words mt-0.5 text-[11px] line-clamp-3">{it.body}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
