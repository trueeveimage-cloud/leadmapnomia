import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Lead, LeadStatus, fetchLeads, updateLead, deleteLead } from '@/lib/supabase';
import { fetchMessagesForLead, MessageLog } from '@/lib/messages';
import { useCRM } from '@/context/CRMContext';
import { LeadRow } from '@/components/LeadRow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { Search, X, Phone, Mail, MapPin, Star, ExternalLink, Send, Loader2, MessageCircle, Calendar, Clock, Plus, Check, StickyNote, ChevronDown, Pin } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

const STATUS_LABELS: Record<LeadStatus, string> = {
  not_contacted: 'Not Contacted', contacted: 'Contacted', answered: 'Answered',
  callback: 'Call Back', interested: 'Interested', not_interested: 'Not Interested',
  unsure: 'Unsure', demo: 'Demo', closed_won: 'Closed Won', closed_lost: 'Closed Lost',
};

interface Appointment {
  id: string;
  lead_id: string;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  notes: string | null;
  status: string;
  created_at: string;
}

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
  
  // Notes
  const [leadNotes, setLeadNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  
  // Appointments
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [showNewAppt, setShowNewAppt] = useState(false);
  const [apptTitle, setApptTitle] = useState('');
  const [apptDate, setApptDate] = useState('');
  const [apptTime, setApptTime] = useState('10:00');
  const [apptDuration, setApptDuration] = useState('30');
  const [apptNotes, setApptNotes] = useState('');
  const [savingAppt, setSavingAppt] = useState(false);

  // Active tab in right panel
  const [rightTab, setRightTab] = useState<'messages' | 'notes' | 'appointments'>('messages');

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

  // Load messages & data when lead is selected
  useEffect(() => {
    if (!selectedLead) return;
    setLoadingMessages(true);
    setLeadNotes(selectedLead.notes || '');
    
    Promise.all([
      fetchMessagesForLead(selectedLead.id),
      supabase.from('lead_appointments').select('*').eq('lead_id', selectedLead.id).order('scheduled_at', { ascending: true }),
    ]).then(([msgs, apptRes]) => {
      setMessages(msgs);
      setAppointments((apptRes.data || []) as Appointment[]);
    }).catch(() => {})
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

  const handleStatusChange = useCallback(async (newStatus: LeadStatus) => {
    if (!selectedLead || newStatus === selectedLead.status) return;
    try {
      const updated = await updateLead(selectedLead.id, { status: newStatus } as any);
      // Remove from this list if status changed away from current page status
      if (newStatus !== status) {
        setLeads(prev => prev.filter(l => l.id !== selectedLead.id));
        setSelectedLead(null);
      } else {
        handleUpdate(updated);
      }
      refreshCounts();
      toast.success(`Status changed to ${STATUS_LABELS[newStatus]}`);
    } catch {
      toast.error('Failed to update status');
    }
  }, [selectedLead, status, handleUpdate, refreshCounts]);

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
      const msgs = await fetchMessagesForLead(selectedLead.id);
      setMessages(msgs);
    } catch (e: any) {
      toast.error(e.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedLead) return;
    setSavingNotes(true);
    try {
      const updated = await updateLead(selectedLead.id, { notes: leadNotes });
      handleUpdate(updated);
      toast.success('Notes saved');
    } catch (e: any) {
      toast.error('Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleCreateAppointment = async () => {
    if (!selectedLead || !apptTitle.trim() || !apptDate) return;
    setSavingAppt(true);
    try {
      const scheduledAt = new Date(`${apptDate}T${apptTime}`).toISOString();
      const { data, error } = await supabase.from('lead_appointments').insert({
        lead_id: selectedLead.id,
        title: apptTitle.trim(),
        scheduled_at: scheduledAt,
        duration_minutes: Number(apptDuration) || 30,
        notes: apptNotes.trim() || null,
      }).select().single();
      if (error) throw error;
      setAppointments(prev => [...prev, data as Appointment]);
      setShowNewAppt(false);
      setApptTitle('');
      setApptDate('');
      setApptNotes('');
      toast.success('Appointment booked');
      
      // Also update lead's next_action_at
      await updateLead(selectedLead.id, { next_action_at: scheduledAt });
    } catch (e: any) {
      toast.error('Failed to book appointment');
    } finally {
      setSavingAppt(false);
    }
  };

  const handleCompleteAppointment = async (apptId: string) => {
    const { error } = await supabase.from('lead_appointments').update({ status: 'completed' }).eq('id', apptId);
    if (!error) {
      setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, status: 'completed' } : a));
      toast.success('Marked as completed');
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

        {/* Right panel */}
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
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Status:</span>
                <Select value={selectedLead.status} onValueChange={(v) => handleStatusChange(v as LeadStatus)}>
                  <SelectTrigger className="h-7 w-auto min-w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['interested', 'unsure', 'demo', 'closed_won', 'closed_lost', 'not_interested', 'callback', 'not_contacted'] as LeadStatus[]).map(s => (
                      <SelectItem key={s} value={s} className="text-xs">{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-border">
              {[
                { key: 'messages' as const, label: 'Messages', icon: <MessageCircle size={12} /> },
                { key: 'notes' as const, label: 'Notes', icon: <StickyNote size={12} /> },
                { key: 'appointments' as const, label: 'Bookings', icon: <Calendar size={12} /> },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setRightTab(tab.key)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2",
                    rightTab === tab.key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.icon} {tab.label}
                  {tab.key === 'appointments' && appointments.filter(a => a.status === 'scheduled').length > 0 && (
                    <span className="bg-primary/20 text-primary text-[10px] px-1.5 rounded-full">
                      {appointments.filter(a => a.status === 'scheduled').length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Messages tab */}
            {rightTab === 'messages' && (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
                        <div className="whitespace-pre-wrap">{msg.body}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                          {msg.status && msg.status !== 'delivered' && ` · ${msg.status}`}
                        </div>
                      </div>
                    ))
                  )}
                </div>

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
              </>
            )}

            {/* Notes tab */}
            {rightTab === 'notes' && (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">Private notes about this client — only visible to you.</p>
                  <Textarea
                    value={leadNotes}
                    onChange={e => setLeadNotes(e.target.value)}
                    placeholder="Add notes about this client... e.g. pricing discussed, needs, follow-up plan..."
                    rows={8}
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveNotes}
                    disabled={savingNotes || leadNotes === (selectedLead.notes || '')}
                    className="gap-1.5"
                  >
                    {savingNotes ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    Save Notes
                  </Button>
                </div>
              </div>
            )}

            {/* Appointments tab */}
            {rightTab === 'appointments' && (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Scheduled meetings & follow-ups</p>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowNewAppt(!showNewAppt)}>
                      <Plus size={12} /> Book
                    </Button>
                  </div>

                  {showNewAppt && (
                    <div className="bg-muted/50 border border-border rounded-lg p-3 space-y-2">
                      <Input
                        value={apptTitle}
                        onChange={e => setApptTitle(e.target.value)}
                        placeholder="Meeting title (e.g. Demo call, Follow-up)"
                        className="h-8 text-sm"
                      />
                      <div className="flex gap-2">
                        <Input
                          type="date"
                          value={apptDate}
                          onChange={e => setApptDate(e.target.value)}
                          className="h-8 text-sm flex-1"
                          min={new Date().toISOString().split('T')[0]}
                        />
                        <Input
                          type="time"
                          value={apptTime}
                          onChange={e => setApptTime(e.target.value)}
                          className="h-8 text-sm w-24"
                        />
                        <Input
                          type="number"
                          value={apptDuration}
                          onChange={e => setApptDuration(e.target.value)}
                          className="h-8 text-sm w-16"
                          placeholder="min"
                          min="5"
                        />
                      </div>
                      <Textarea
                        value={apptNotes}
                        onChange={e => setApptNotes(e.target.value)}
                        placeholder="Notes for this meeting..."
                        rows={2}
                        className="text-sm"
                      />
                      <Button size="sm" onClick={handleCreateAppointment} disabled={savingAppt || !apptTitle.trim() || !apptDate} className="gap-1.5">
                        {savingAppt ? <Loader2 size={13} className="animate-spin" /> : <Calendar size={13} />}
                        Book Appointment
                      </Button>
                    </div>
                  )}

                  {appointments.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      No appointments yet. Click "Book" to schedule one.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {appointments.map(appt => {
                        const isPast = new Date(appt.scheduled_at) < new Date();
                        const isCompleted = appt.status === 'completed';
                        return (
                          <div
                            key={appt.id}
                            className={cn(
                              "border rounded-lg p-3 text-xs",
                              isCompleted ? "border-border/50 bg-muted/30 opacity-60" : isPast ? "border-amber-500/30 bg-amber-500/5" : "border-primary/30 bg-primary/5"
                            )}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-foreground">{appt.title}</span>
                              {!isCompleted && (
                                <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={() => handleCompleteAppointment(appt.id)}>
                                  <Check size={10} /> Done
                                </Button>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Clock size={10} />
                              {format(new Date(appt.scheduled_at), 'MMM d, yyyy · h:mm a')}
                              <span>· {appt.duration_minutes}min</span>
                            </div>
                            {appt.notes && (
                              <p className="mt-1 text-muted-foreground">{appt.notes}</p>
                            )}
                            {isCompleted && <span className="text-green-400 text-[10px] font-medium">✓ Completed</span>}
                            {isPast && !isCompleted && <span className="text-amber-400 text-[10px] font-medium">⚠ Overdue</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
