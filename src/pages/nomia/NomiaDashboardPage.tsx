import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkspaceLayout from '@/components/WorkspaceLayout';
import { supabase } from '@/integrations/supabase/client';
import { PauseCircle, PhoneCall, Mail, Inbox, CalendarCheck, Trophy, Clock, AlertTriangle } from 'lucide-react';

interface Tile { label: string; value: number; hint: string; to: string; icon: React.ReactNode }

export default function NomiaDashboardPage() {
  const [t, setT] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const iso = startOfDay.toISOString();
      const base = () => supabase.from('leads').select('id', { count: 'exact', head: true }).eq('product', 'nomia');

      const [callQueue, unread, followUps, won, awaiting, meetings, calledToday] = await Promise.all([
        base().not('phone', 'is', null).is('last_contacted_at', null).or('do_not_contact.is.null,do_not_contact.eq.false'),
        base().eq('has_replied', true),
        base().not('follow_up_at', 'is', null).lte('follow_up_at', new Date().toISOString()),
        base().eq('status', 'closed_won'),
        (supabase as any).from('campaign_recipients').select('id', { count: 'exact', head: true })
          .eq('product', 'nomia').eq('review_state', 'pending'),
        supabase.from('lead_appointments').select('id', { count: 'exact', head: true }).gte('scheduled_at', iso),
        base().gte('last_contacted_at', iso),
      ]);

      setT({
        callQueue: callQueue.count || 0,
        unread: unread.count || 0,
        followUps: followUps.count || 0,
        won: won.count || 0,
        awaiting: awaiting.count || 0,
        meetings: meetings.count || 0,
        calledToday: calledToday.count || 0,
      });
      setLoading(false);
    })().catch(() => setLoading(false));
  }, []);

  const tiles: Tile[] = [
    { label: "Today's manual calls", value: t.callQueue || 0, hint: `${t.calledToday || 0} contacted today`, to: '/nomia/calls', icon: <PhoneCall size={15} /> },
    { label: 'Gmail awaiting approval', value: t.awaiting || 0, hint: 'Recipients pending review', to: '/nomia/email', icon: <Mail size={15} /> },
    { label: 'Unread replies', value: t.unread || 0, hint: 'Leads that answered', to: '/nomia/inbox', icon: <Inbox size={15} /> },
    { label: 'Follow-ups due', value: t.followUps || 0, hint: 'Scheduled and overdue', to: '/nomia/leads', icon: <Clock size={15} /> },
    { label: 'Booked meetings', value: t.meetings || 0, hint: 'Upcoming appointments', to: '/nomia/pipeline', icon: <CalendarCheck size={15} /> },
    { label: 'Closed sales', value: t.won || 0, hint: 'Won deals', to: '/nomia/pipeline', icon: <Trophy size={15} /> },
  ];

  return (
    <WorkspaceLayout workspace="nomia" title="Nomia dashboard" subtitle="Manual-first outreach — Sweden">
      <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2.5 text-xs text-amber flex items-center gap-2 mb-4">
        <PauseCircle size={14} /> Outreach master pause is on. Gmail, AI calls and SMS will not send.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <Link key={tile.label} to={tile.to}
            className="rounded-lg border border-border bg-card p-3.5 hover:border-emerald/50 transition-colors">
            <div className="flex items-center gap-2 text-muted-foreground text-[11px] uppercase tracking-wider">
              <span className="text-emerald">{tile.icon}</span>{tile.label}
            </div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{loading ? '—' : tile.value.toLocaleString()}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{tile.hint}</div>
          </Link>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card p-3.5">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
          <AlertTriangle size={14} className="text-amber" /> Working rules
        </div>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
          <li>Manual calling is primary. Eligibility and the backend lock are checked before the dialer opens.</li>
          <li>Gmail goes out only through an approved campaign batch — max 10 Swedish recipients.</li>
          <li>AI calls require an approved review, max 5 recipients.</li>
          <li>Do Not Contact and duplicate business identities are blocked in the database, not just the UI.</li>
        </ul>
      </div>
    </WorkspaceLayout>
  );
}
