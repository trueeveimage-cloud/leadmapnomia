import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Lead, LeadStatus, fetchLeads, updateLead, deleteLead, determineSection } from '@/lib/supabase';
import { fetchMessagesForLead, MessageLog } from '@/lib/messages';
import { useCRM } from '@/context/CRMContext';
import { LeadRow } from '@/components/LeadRow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Search, SortDesc, ChevronDown, CheckSquare, Square, Trash2, X, Phone, Mail, MapPin, Star, ExternalLink, Send, Loader2, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

const STATUS_LABELS: Record<LeadStatus, string> = {
  not_contacted: 'Not Contacted', contacted: 'Contacted', answered: 'Answered',
  callback: 'Call Back', interested: 'Interested', not_interested: 'Not Interested',
  unsure: 'Unsure', demo: 'Demo', closed_won: 'Closed Won', closed_lost: 'Closed Lost',
};

interface ClosingPageProps {
  status: LeadStatus;
  title: string;
}

export default function ClosingPage({ status, title }: ClosingPageProps) {
  const { refreshCounts } = useCRM();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchLeads({ status });
      setLeads(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  // Load messages when a lead is selected
  useEffect(() => {
    if (!selectedLead) return;
    setLoadingMessages(true);
    fetchMessagesForLead(selectedLead.id)
      .then(setMessages)
      .catch(() => {})
      .finally(() => setLoadingMessages(false));
  }, [selectedLead?.id]);

  const filtered = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter(l =>
      l.name.toLowerCase().includes(q) ||
      (l.phone && l.phone.includes(q)) ||
      (l.email && l.email.toLowerCase().includes(q))
    );
  }, [leads, search]);

  const handleUpdate = useCallback((updated: Lead) => {
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
    if (selectedLead?.id === updated.id) setSelectedLead(updated);
  }, [selectedLead]);

  const handleDelete = useCallback((id: string) => {
    setLeads(prev => prev.filter(l => l.id !== id));
    if (selectedLead?.id === id) setSelectedLead(null);
  }, [selectedLead]);

  const handleSendReply = async () => {
    if (!reply.trim() || !selectedLead?.phone) return;
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('send-sms', {
        body: { leadId: selectedLead.id, to: selectedLead.phone_e164 || selectedLead.phone, body: reply.trim() }
      });
      if (error) throw error;
      toast.success('Message sent');
      setReply('');
      // Refresh messages
      const msgs = await fetchMessagesForLead(selectedLead.id);
      setMessages(msgs);
    } catch (e: any) {
      toast.error(e.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <AppLayout>
      <div className="flex h-full">
        {/* Lead list */}
        <div className={cn("flex flex-col border-r border-border transition-all", selectedLead ? "w-1/2" : "flex-1")}>
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-foreground">{title}</h1>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{filtered.length}</span>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={load}>↻ Refresh</Button>
            </div>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search leads..."
                className="pl-8 h-7 text-xs bg-muted border-border"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <div className="text-4xl mb-2">📭</div>
                <div className="text-sm">No leads here</div>
              </div>
            ) : (
              filtered.map(lead => (
                <div
                  key={lead.id}
                  onClick={() => setSelectedLead(lead)}
                  className={cn(
                    "cursor-pointer border-b border-border/50 transition-colors",
                    selectedLead?.id === lead.id ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/30"
                  )}
                >
                  <LeadRow
                    lead={lead}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Messaging panel */}
        {selectedLead && (
          <div className="w-1/2 flex flex-col bg-card">
            {/* Header */}
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-foreground">{selectedLead.name}</h2>
                  <div className="text-xs text-muted-foreground">{selectedLead.category}</div>
                </div>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setSelectedLead(null)}>
                  <X size={14} />
                </Button>
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                {selectedLead.phone && (
                  <span className="flex items-center gap-1 text-green-400/80">
                    <Phone size={10} /> {selectedLead.phone}
                  </span>
                )}
                {selectedLead.email && (
                  <span className="flex items-center gap-1 text-blue-400/80">
                    <Mail size={10} /> {selectedLead.email}
                  </span>
                )}
                {selectedLead.address && (
                  <span className="flex items-center gap-1">
                    <MapPin size={10} /> {selectedLead.address}
                  </span>
                )}
                {selectedLead.rating && (
                  <span className="flex items-center gap-1">
                    <Star size={10} className="text-amber-400" /> {selectedLead.rating} ({selectedLead.reviews_count})
                  </span>
                )}
                {selectedLead.maps_url && (
                  <a href={selectedLead.maps_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-foreground">
                    <ExternalLink size={10} /> Maps
                  </a>
                )}
              </div>
              <div className="mt-2 text-xs">
                <span className="text-muted-foreground">Status: </span>
                <span className="font-medium text-foreground">{STATUS_LABELS[selectedLead.status as LeadStatus]}</span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <MessageCircle size={12} /> Conversation
              </div>
              {loadingMessages ? (
                <div className="text-center py-8 text-sm text-muted-foreground">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">No messages yet</div>
              ) : (
                messages.map(msg => (
                  <div
                    key={msg.id}
                    className={cn(
                      "max-w-[80%] rounded-lg p-3 text-sm",
                      msg.direction === 'outbound'
                        ? "ml-auto bg-primary/20 text-foreground"
                        : "bg-muted text-foreground"
                    )}
                  >
                    <div>{msg.body}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                      {msg.status && msg.status !== 'delivered' && ` · ${msg.status}`}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Reply input */}
            {selectedLead.phone && (
              <div className="p-4 border-t border-border">
                <div className="flex gap-2">
                  <Input
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    placeholder="Type a reply..."
                    className="flex-1 h-9 text-sm"
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendReply()}
                  />
                  <Button size="sm" className="h-9 gap-1.5" onClick={handleSendReply} disabled={!reply.trim() || sending}>
                    {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    Send
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
