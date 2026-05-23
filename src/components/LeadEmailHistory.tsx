import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { CheckCircle2, XCircle, MinusCircle, Mail, Loader2 } from 'lucide-react';

interface EmailLog {
  id: string;
  created_at: string;
  to_number: string | null;
  body: string | null;
  status: string;
  error_message: string | null;
}

const statusMeta: Record<string, { label: string; color: string; Icon: any }> = {
  sent: { label: 'Sent', color: 'text-green', Icon: CheckCircle2 },
  queued: { label: 'Queued', color: 'text-muted-foreground', Icon: Loader2 },
  skipped: { label: 'Skipped', color: 'text-muted-foreground', Icon: MinusCircle },
  failed: { label: 'Failed', color: 'text-destructive', Icon: XCircle },
};

function extractSubject(body: string | null): string {
  if (!body) return '(no subject)';
  return body.split('\n')[0]?.slice(0, 80) || '(no subject)';
}

export default function LeadEmailHistory({ leadId }: { leadId: string }) {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .from('message_logs')
      .select('id, created_at, to_number, body, status, error_message')
      .eq('lead_id', leadId)
      .eq('channel', 'email')
      .eq('direction', 'outbound')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!active) return;
        setLogs((data as EmailLog[]) || []);
        setLoading(false);
      });
    return () => { active = false; };
  }, [leadId]);

  if (loading) return <div className="text-xs text-muted-foreground">Loading…</div>;
  if (!logs.length) return <div className="text-xs text-muted-foreground">No emails sent yet.</div>;

  return (
    <div className="space-y-1">
      {logs.map((log) => {
        const meta = statusMeta[log.status] || statusMeta.failed;
        const Icon = meta.Icon;
        return (
          <div key={log.id} className="flex items-start gap-2 text-xs bg-muted rounded px-2 py-1.5">
            <Mail size={10} className="text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium">{extractSubject(log.body)}</div>
              <div className="text-muted-foreground text-[10px] truncate">
                {log.to_number} · {format(new Date(log.created_at), 'MMM d HH:mm')}
              </div>
              {log.error_message && (
                <div className="text-destructive text-[10px] truncate">{log.error_message}</div>
              )}
            </div>
            <span className={`flex items-center gap-1 shrink-0 ${meta.color}`}>
              <Icon size={11} />
              <span className="text-[10px]">{meta.label}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
