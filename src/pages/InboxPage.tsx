import React, { useEffect, useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { updateLead, Lead } from '@/lib/supabase';
import { useCRM } from '@/context/CRMContext';
import { Inbox, MessageCircle, ChevronRight, ExternalLink, Phone, Mail, MapPin, Globe, Send, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import InfoTip from '@/components/InfoTip';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type InboxMessage = {
  id: string;
  lead_id: string;
  body: string | null;
  from_number: string | null;
  created_at: string;
  direction: string;
  lead_name?: string;
  lead_category?: string;
  lead_status?: string;
};

const QUICK_ACTIONS = [
  { status: 'interested', label: 'Interested', color: 'bg-green-500/15 text-green-600 border-green-500/30' },
  { status: 'not_interested', label: 'Not Interested', color: 'bg-destructive/15 text-destructive border-destructive/30' },
  { status: 'unsure', label: 'Unsure', color: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
  { status: 'callback', label: 'Callback', color: 'bg-purple-500/15 text-purple-600 border-purple-500/30' },
] as const;

const answeredStatuses = ['interested', 'not_interested', 'unsure', 'callback'];

export default function InboxPage() {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'answered' | 'conversations'>('pending');
  const [convos, setConvos] = useState<{ lead_id: string; lead_name: string; lead_category: string | null; lead_status: string; last_message_body: string | null; last_message_at: string; last_direction: string; has_new_inbound: boolean }[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadDetail, setLeadDetail] = useState<Lead | null>(null);
  const [replyText, setReplyText] = useState('');
  const replyRef = React.useRef<HTMLTextAreaElement>(null);
  const [sending, setSending] = useState(false);
  const [conversation, setConversation] = useState<any[]>([]);
  const { refreshCounts, refreshNotifications } = useCRM();
  const [refreshing, setRefreshing] = useState(false);

  const loadInbox = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('message_logs')
        .select('*, leads!message_logs_lead_id_fkey(name, category, status)')
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      const mapped = (data || []).map((m: any) => ({
        ...m,
        lead_name: m.leads?.name,
        lead_category: m.leads?.category,
        lead_status: m.leads?.status,
      }));
      setMessages(mapped);
    } catch { toast.error('Failed to load inbox'); }
    finally { setLoading(false); }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      // Get all leads that have any messages, with their latest message info
      const { data, error } = await supabase
        .from('message_logs')
        .select('lead_id, body, created_at, direction, leads!message_logs_lead_id_fkey(name, category, status, last_inbound_at, last_outbound_at)')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      // Group by lead_id, keep latest message per lead
      const map = new Map<string, any>();
      for (const m of (data || [])) {
        if (map.has(m.lead_id)) {
          const existing = map.get(m.lead_id);
          // Track if there's any inbound after last outbound
          if (m.direction === 'inbound' && !existing._hasInbound) {
            existing._hasInbound = true;
          }
          continue;
        }
        const lead = m.leads as any;
        map.set(m.lead_id, {
          lead_id: m.lead_id,
          lead_name: lead?.name || 'Unknown',
          lead_category: lead?.category || null,
          lead_status: lead?.status || 'unknown',
          last_message_body: m.body,
          last_message_at: m.created_at,
          last_direction: m.direction,
          _hasInbound: m.direction === 'inbound',
          _lastInbound: lead?.last_inbound_at,
          _lastOutbound: lead?.last_outbound_at,
        });
      }
      // Determine "has new" = last inbound is after last outbound
      const results = Array.from(map.values()).map(c => ({
        lead_id: c.lead_id,
        lead_name: c.lead_name,
        lead_category: c.lead_category,
        lead_status: c.lead_status,
        last_message_body: c.last_message_body,
        last_message_at: c.last_message_at,
        last_direction: c.last_direction,
        has_new_inbound: c._lastInbound && (!c._lastOutbound || new Date(c._lastInbound) > new Date(c._lastOutbound)),
      }));
      setConvos(results);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadInbox(); loadConversations(); }, [loadInbox, loadConversations]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadInbox(false);
    await loadConversations();
    await refreshNotifications();
    setRefreshing(false);
    toast.success('Inbox refreshed');
  };

  // Load lead detail + conversation when selected
  useEffect(() => {
    if (!selectedLeadId) { setLeadDetail(null); setConversation([]); return; }
    supabase.from('leads').select('*').eq('id', selectedLeadId).single()
      .then(({ data }) => setLeadDetail(data as Lead | null));
    supabase.from('message_logs').select('*').eq('lead_id', selectedLeadId)
      .order('created_at', { ascending: true }).limit(50)
      .then(({ data }) => setConversation(data || []));
  }, [selectedLeadId]);

  const handleQuickAction = async (leadId: string, status: string) => {
    try {
      await updateLead(leadId, { status } as Partial<Lead>);
      toast.success(`Lead marked as ${status.replace('_', ' ')}`);
      setMessages(prev => prev.map(m => m.lead_id === leadId ? { ...m, lead_status: status } : m));
      if (leadDetail && leadDetail.id === leadId) {
        setLeadDetail(prev => prev ? { ...prev, status: status as Lead['status'] } : prev);
      }
      refreshCounts();
    } catch { toast.error('Failed to update'); }
  };

  const handleDeleteMessage = async (messageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase.from('message_logs').delete().eq('id', messageId);
      if (error) throw error;
      setMessages(prev => prev.filter(m => m.id !== messageId));
      setConversation(prev => prev.filter((m: any) => m.id !== messageId));
      toast.success('Message deleted');
    } catch { toast.error('Failed to delete message'); }
  };

  const handleSendReply = async () => {
    if (!selectedLeadId || !replyText.trim()) return;
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ leadId: selectedLeadId, body: replyText.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send');
      toast.success('SMS sent');
      setReplyText('');
      const { data } = await supabase.from('message_logs').select('*').eq('lead_id', selectedLeadId)
        .order('created_at', { ascending: true }).limit(50);
      setConversation(data || []);
    } catch (e: any) { toast.error(e.message); }
    finally { setSending(false); }
  };

  // Deduplicate: show only the latest message per lead_id
  const deduped = (() => {
    const seen = new Map<string, InboxMessage>();
    for (const m of messages) {
      const existing = seen.get(m.lead_id);
      if (!existing || new Date(m.created_at) > new Date(existing.created_at)) {
        // Keep the latest status from any message for this lead
        seen.set(m.lead_id, { ...m, lead_status: m.lead_status });
      }
    }
    return Array.from(seen.values());
  })();

  // Filter by tab but keep original insertion order (no re-sorting)
  const pendingMessages = deduped.filter(m => !answeredStatuses.includes(m.lead_status || ''));
  const answeredMessages = deduped.filter(m => answeredStatuses.includes(m.lead_status || ''));
  const displayed = tab === 'pending' ? pendingMessages : answeredMessages;

  const statusCounts = deduped.reduce((acc, m) => {
    const s = m.lead_status || 'unknown';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <AppLayout>
      <div className="flex h-full">
        {/* Main list */}
        <div className={cn("flex-1 min-w-0 flex flex-col", selectedLeadId && "max-w-[55%]")}>
          <div className="px-6 pt-8 pb-4">
            <div className="flex items-center gap-2 mb-4">
              <Inbox size={20} className="text-primary" />
              <h1 className="text-2xl font-bold text-foreground">Inbox</h1>
              <InfoTip text="Inbound SMS replies from leads. Use quick actions to update lead status." />
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="ml-auto p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Refresh inbox"
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* Status counters */}
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { key: 'interested', label: 'Interested', cls: 'bg-green-500/10 text-green-600', dot: 'bg-green-500' },
                { key: 'not_interested', label: 'Not Interested', cls: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' },
                { key: 'unsure', label: 'Unsure', cls: 'bg-amber-500/10 text-amber-600', dot: 'bg-amber-500' },
                { key: 'callback', label: 'Callback', cls: 'bg-purple-500/10 text-purple-600', dot: 'bg-purple-500' },
              ].map(s => (
                <div key={s.key} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${s.cls} text-xs font-medium`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                  {statusCounts[s.key] || 0} {s.label}
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-muted/50 p-0.5 rounded-lg w-fit">
              <button
                onClick={() => setTab('pending')}
                className={cn(
                  'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                  tab === 'pending' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Not Answered ({pendingMessages.length})
              </button>
              <button
                onClick={() => setTab('answered')}
                className={cn(
                  'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                  tab === 'answered' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Answered ({answeredMessages.length})
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {loading ? (
              <div className="text-sm text-muted-foreground py-20 text-center">Loading inbox...</div>
            ) : displayed.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <MessageCircle size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No {tab === 'pending' ? 'pending' : 'answered'} messages</p>
              </div>
            ) : (
              <div className="space-y-2">
                {displayed.map(m => {
                  const isSelected = selectedLeadId === m.lead_id;
                  const currentStatus = m.lead_status || '';
                  return (
                    <div
                      key={m.lead_id}
                      className={cn(
                        "bg-card border rounded-lg p-4 cursor-pointer transition-all",
                        isSelected ? "border-primary ring-1 ring-primary/20" : "border-border hover:border-primary/30"
                      )}
                      onClick={() => setSelectedLeadId(isSelected ? null : m.lead_id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm text-foreground">{m.lead_name || 'Unknown'}</span>
                            {m.lead_category && <span className="text-[10px] text-muted-foreground">{m.lead_category}</span>}
                            <span className="text-[10px] text-muted-foreground">{m.from_number}</span>
                            {answeredStatuses.includes(currentStatus) && (
                              <span className={cn(
                                'text-[10px] px-1.5 py-0.5 rounded-full font-medium border',
                                currentStatus === 'interested' && 'bg-green-500/15 text-green-600 border-green-500/30',
                                currentStatus === 'not_interested' && 'bg-destructive/15 text-destructive border-destructive/30',
                                currentStatus === 'unsure' && 'bg-amber-500/15 text-amber-600 border-amber-500/30',
                                currentStatus === 'callback' && 'bg-purple-500/15 text-purple-600 border-purple-500/30',
                              )}>
                                {currentStatus.replace('_', ' ')}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-foreground whitespace-pre-wrap break-words">{m.body}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">{new Date(m.created_at).toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {QUICK_ACTIONS.map(a => (
                            <button
                              key={a.status}
                              onClick={(e) => {
                                e.stopPropagation();
                                const newStatus = currentStatus === a.status ? 'contacted' : a.status;
                                handleQuickAction(m.lead_id, newStatus);
                              }}
                              className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors hover:opacity-80 ${
                                currentStatus === a.status
                                  ? a.color + ' ring-1 ring-offset-1'
                                  : a.color
                              }`}
                            >
                              {a.label}
                            </button>
                          ))}
                          <button
                            onClick={(e) => handleDeleteMessage(m.id, e)}
                            className="p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                            title="Delete message"
                          >
                            <X size={14} />
                          </button>
                          <ChevronRight size={14} className="text-muted-foreground ml-1" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Lead detail side panel */}
        {selectedLeadId && leadDetail && (
          <div className="w-[45%] border-l border-border bg-card flex flex-col">
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex items-start justify-between mb-1">
                <h2 className="text-lg font-bold text-foreground">{leadDetail.name}</h2>
                <button
                  onClick={() => setSelectedLeadId(null)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Close panel"
                >
                  <X size={18} />
                </button>
              </div>
              {leadDetail.category && <p className="text-xs text-muted-foreground mb-4">{leadDetail.category}</p>}

              <div className="space-y-3 mb-6">
                {leadDetail.phone && (
                  <a href={`tel:${leadDetail.phone}`} className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors">
                    <Phone size={14} className="text-muted-foreground" />
                    {leadDetail.phone}
                  </a>
                )}
                {leadDetail.email && (
                  <a href={`mailto:${leadDetail.email}`} className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors">
                    <Mail size={14} className="text-muted-foreground" />
                    {leadDetail.email}
                  </a>
                )}
                {leadDetail.address && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin size={14} />
                    {leadDetail.address}
                  </div>
                )}
                {leadDetail.website && (
                  <a href={leadDetail.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors">
                    <Globe size={14} className="text-muted-foreground" />
                    {leadDetail.website}
                    <ExternalLink size={10} />
                  </a>
                )}
                {leadDetail.maps_url && (
                  <a href={leadDetail.maps_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors">
                    <MapPin size={14} className="text-muted-foreground" />
                    Google Maps
                    <ExternalLink size={10} />
                  </a>
                )}
              </div>

              {leadDetail.rating && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                  <span className="text-amber-500">★ {leadDetail.rating}</span>
                  {leadDetail.reviews_count !== null && <span>({leadDetail.reviews_count} reviews)</span>}
                </div>
              )}

              {leadDetail.notes && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Notes</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{leadDetail.notes}</p>
                </div>
              )}

              {/* Conversation thread */}
              {conversation.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Conversation</p>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {conversation.map((msg: any) => (
                      <div key={msg.id} className={cn(
                        "rounded-lg px-3 py-2 text-sm max-w-[85%] group relative",
                        msg.direction === 'outbound'
                          ? "bg-primary/15 text-primary ml-auto"
                          : "bg-muted text-foreground"
                      )}>
                        <button
                          onClick={() => handleDeleteMessage(msg.id, { stopPropagation: () => {} } as React.MouseEvent)}
                          className="absolute -top-1 -right-1 p-0.5 rounded-full bg-card border border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete message"
                        >
                          <X size={10} />
                        </button>
                        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                        <p className="text-[9px] text-muted-foreground mt-1">
                          {new Date(msg.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-xs text-muted-foreground space-y-1">
                {leadDetail.call_attempts > 0 && <p>Call attempts: {leadDetail.call_attempts}</p>}
                {leadDetail.last_contacted_at && <p>Last contacted: {new Date(leadDetail.last_contacted_at).toLocaleString()}</p>}
                {leadDetail.last_inbound_at && <p>Last reply: {new Date(leadDetail.last_inbound_at).toLocaleString()}</p>}
              </div>
            </div>

            {/* Reply input */}
            <div className="border-t border-border p-4">
            <div className="flex gap-2 items-end">
                <textarea
                  ref={replyRef}
                  value={replyText}
                  onChange={(e) => {
                    setReplyText(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendReply();
                    }
                  }}
                  placeholder="Type a reply..."
                  rows={1}
                  className="flex-1 bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none"
                  style={{ minHeight: '38px', maxHeight: '120px' }}
                  disabled={sending}
                />
                <button
                  onClick={handleSendReply}
                  disabled={sending || !replyText.trim()}
                  className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Send size={14} />
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
