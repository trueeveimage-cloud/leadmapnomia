import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { fetchInboxMessages, MessageLog } from '@/lib/messages';
import { updateLead, Lead } from '@/lib/supabase';
import { useCRM } from '@/context/CRMContext';
import { Inbox, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import InfoTip from '@/components/InfoTip';

const QUICK_ACTIONS = [
  { status: 'interested', label: 'Interested', color: 'bg-green/15 text-green border-green/30' },
  { status: 'not_interested', label: 'Not Interested', color: 'bg-destructive/15 text-destructive border-destructive/30' },
  { status: 'unsure', label: 'Unsure', color: 'bg-amber/15 text-amber border-amber/30' },
  { status: 'callback', label: 'Callback', color: 'bg-purple/15 text-purple border-purple/30' },
] as const;

export default function InboxPage() {
  const [messages, setMessages] = useState<(MessageLog & { lead_name?: string; lead_category?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const { refreshCounts } = useCRM();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try { setMessages(await fetchInboxMessages()); }
      catch { toast.error('Failed to load inbox'); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const handleQuickAction = async (leadId: string, status: string) => {
    try {
      await updateLead(leadId, { status } as Partial<Lead>);
      toast.success(`Lead marked as ${status.replace('_', ' ')}`);
      refreshCounts();
    } catch { toast.error('Failed to update'); }
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-6 pt-8">
        <div className="flex items-center gap-2 mb-6">
          <Inbox size={20} className="text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Inbox</h1>
          <InfoTip text="Inbound SMS replies from leads. Use quick actions to update lead status." />
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground py-20 text-center">Loading inbox...</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <MessageCircle size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No replies yet</p>
            <p className="text-xs mt-1">Inbound messages from leads will appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map(m => (
              <div key={m.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm text-foreground">{m.lead_name || 'Unknown'}</span>
                      {m.lead_category && <span className="text-[10px] text-muted-foreground">{m.lead_category}</span>}
                      <span className="text-[10px] text-muted-foreground">{m.from_number}</span>
                    </div>
                    <p className="text-sm text-foreground">{m.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{new Date(m.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {QUICK_ACTIONS.map(a => (
                      <button
                        key={a.status}
                        onClick={() => handleQuickAction(m.lead_id, a.status)}
                        className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors hover:opacity-80 ${a.color}`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
