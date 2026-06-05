import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Send, X, Mail, History, ChevronDown, ChevronRight, ExternalLink, Save, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { generateOutreachMessage, detectNiche } from '@/lib/leadScoring';
import LeadEmailHistory from '@/components/LeadEmailHistory';
import { createNotification, type Lead } from '@/lib/supabase';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leads: Lead[];
  onSent?: () => void;
}

function defaultSubject(lead: Lead): string {
  const niche = detectNiche(lead);
  if (niche === 'cosmetic' || niche === 'dental' || niche === 'healthcare') return 'Missade samtal hos er klinik?';
  if (niche === 'law') return 'Missade samtal från nya klienter?';
  if (niche === 'real_estate') return 'Missade samtal från spekulanter?';
  if (niche === 'plumber' || niche === 'electrician' || niche === 'locksmith' || niche === 'water_damage' || niche === 'roofer') return 'Missade jour-samtal?';
  return 'En snabb fråga om era inkommande samtal';
}

function personalize(template: string, lead: Lead): string {
  return template
    .replace(/\{name\}/g, lead.name || 'där')
    .replace(/\{city\}/g, (lead.address || '').split(',').slice(-2)[0]?.trim() || '');
}

export default function EmailOutreachModal({ open, onOpenChange, leads, onSent }: Props) {
  const recipients = useMemo(() => leads.filter((l) => l.email), [leads]);
  const draftKey = recipients[0] ? `crm.emailDraft.${recipients[0].id}` : 'crm.emailDraft.broadcast';
  const readDraft = (): { subject?: string; body?: string } => {
    try { return JSON.parse(localStorage.getItem(draftKey) || '{}'); } catch { return {}; }
  };
  const [subject, setSubject] = useState<string>(() => readDraft().subject ?? (recipients[0] ? defaultSubject(recipients[0]) : 'En snabb fråga'));
  const [body, setBody] = useState<string>(() => readDraft().body ?? (recipients[0] ? generateOutreachMessage(recipients[0]) : ''));
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => Object.fromEntries(recipients.map((l) => [l.id, true])));
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const [lastSent, setLastSent] = useState<Record<string, { snippet: string; created_at: string } | null>>({});
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, sent: 0, skipped: 0, failed: 0 });
  const [fromAddress, setFromAddress] = useState<string>('');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const abortRef = React.useRef(false);

  const saveDraft = React.useCallback(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ subject, body }));
      setSavedAt(Date.now());
      toast.success('Draft saved');
    } catch { toast.error('Could not save draft'); }
  }, [draftKey, subject, body]);

  const clearDraft = React.useCallback(() => {
    try { localStorage.removeItem(draftKey); } catch {}
    if (recipients[0]) {
      setSubject(defaultSubject(recipients[0]));
      setBody(generateOutreachMessage(recipients[0]));
    }
    setSavedAt(null);
    toast.success('Draft cleared');
  }, [draftKey, recipients]);

  // Show which Gmail account will actually send
  React.useEffect(() => {
    if (!open) return;
    supabase.functions.invoke('gmail-profile', { body: {} }).then(({ data }: any) => {
      if (data?.connected && data?.emailAddress) setFromAddress(data.emailAddress);
    }).catch(() => {});
  }, [open]);

  // Restore/refresh draft when target lead changes
  React.useEffect(() => {
    if (open && recipients[0]) {
      const d = readDraft();
      setSubject(d.subject ?? defaultSubject(recipients[0]));
      setBody(d.body ?? generateOutreachMessage(recipients[0]));
      setEnabled(Object.fromEntries(recipients.map((l) => [l.id, true])));
      setProgress({ done: 0, sent: 0, skipped: 0, failed: 0 });
      abortRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recipients.length, draftKey]);

  // Auto-save draft on edit (per lead) so switching leads never loses text
  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify({ subject, body })); setSavedAt(Date.now()); } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [subject, body, draftKey, open]);

  // Fetch most-recent sent email per recipient (one query, all leads)
  React.useEffect(() => {
    if (!open || recipients.length === 0) return;
    const ids = recipients.map((r) => r.id);
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('message_logs')
        .select('lead_id, body, created_at')
        .in('lead_id', ids)
        .eq('channel', 'email')
        .eq('direction', 'outbound')
        .in('status', ['sent', 'queued'])
        .order('created_at', { ascending: false })
        .limit(200);
      if (!active) return;
      const map: Record<string, { snippet: string; created_at: string }> = {};
      for (const row of (data || []) as any[]) {
        if (!map[row.lead_id]) {
          const firstLine = (row.body || '').split('\n').find((l: string) => l.trim());
          map[row.lead_id] = { snippet: (firstLine || row.body || '').slice(0, 120), created_at: row.created_at };
        }
      }
      setLastSent(map);
    })();
    return () => { active = false; };
  }, [open, recipients]);

  const send = async () => {
    const targets = recipients.filter((l) => enabled[l.id]);
    if (!targets.length) { toast.error('No recipients enabled'); return; }
    setSending(true);
    abortRef.current = false;
    let sent = 0, skipped = 0, failed = 0;
    try {
      for (let i = 0; i < targets.length; i++) {
        if (abortRef.current) break;
        const lead = targets[i];
        const personalizedBody = personalize(body, lead);
        const personalizedSubject = personalize(subject, lead);
        try {
          const { data, error } = await supabase.functions.invoke('send-gmail', {
            body: { leadId: lead.id, to: lead.email!, subject: personalizedSubject, body: personalizedBody },
          });
          if (error) { failed++; }
          else if ((data as any)?.skipped) { skipped++; }
          else if ((data as any)?.success) { sent++; }
          else { failed++; }
        } catch { failed++; }
        setProgress({ done: i + 1, sent, skipped, failed });
        // small delay between sends
        if (i < targets.length - 1) await new Promise((r) => setTimeout(r, 1500));
      }
      await createNotification({
        type: 'gmail_batch_done',
        title: 'Manual Gmail batch finished',
        message: `${sent} sent, ${skipped} skipped, ${failed} failed.`,
        payload: { sent, skipped, failed, selected: targets.length, stopped: abortRef.current },
      });
      toast.success(`Sent ${sent} • Skipped ${skipped} • Failed ${failed}`);
      onSent?.();
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!sending) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> Gmail outreach — {recipients.length} recipient{recipients.length === 1 ? '' : 's'}</DialogTitle>
          {fromAddress && (
            <div className="text-[11px] text-muted-foreground -mt-1">
              Sending from: <span className="font-mono text-foreground">{fromAddress}</span>
            </div>
          )}
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto pr-1">
          {recipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">No selected leads have an email address. Find emails first.</p>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Subject</label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Body (use {'{name}'}, {'{city}'} for personalization)</label>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className="mt-1 font-mono text-sm" />
              </div>
              <div className="border rounded-md max-h-72 overflow-y-auto">
                {recipients.map((l) => {
                  const open = !!historyOpen[l.id];
                  const last = lastSent[l.id];
                  return (
                    <div key={l.id} className="border-b last:border-0">
                      <div className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent">
                        <input type="checkbox" checked={!!enabled[l.id]} onChange={(e) => setEnabled((p) => ({ ...p, [l.id]: e.target.checked }))} />
                        <span className="font-medium truncate flex-1">{l.name}</span>
                        <span className="text-muted-foreground truncate max-w-[180px]">{l.email}</span>
                        <button
                          type="button"
                          onClick={() => setHistoryOpen((p) => ({ ...p, [l.id]: !p[l.id] }))}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="Show previous emails"
                        >
                          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          <History size={11} />
                        </button>
                        <Link
                          to={`/mailbox?email=${encodeURIComponent(l.email || '')}`}
                          target="_blank"
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary font-medium"
                          title="Open full Gmail conversation in Mailbox"
                        >
                          <ExternalLink size={11} />
                          <span>Open thread</span>
                        </Link>
                      </div>
                      {last && !open && (
                        <div className="px-2 pb-1.5 -mt-0.5 text-[11px] text-muted-foreground flex items-start gap-1.5">
                          <span className="shrink-0 text-green">↳ Last sent</span>
                          <span className="truncate flex-1 italic">{last.snippet || '(no preview)'}</span>
                        </div>
                      )}
                      {open && (
                        <div className="px-2 pb-2 bg-muted/30">
                          <LeadEmailHistory leadId={l.id} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="border-t pt-3">
          {sending && (
            <span className="text-xs text-muted-foreground mr-auto">
              {progress.done}/{recipients.filter((l) => enabled[l.id]).length} — sent {progress.sent} · skipped {progress.skipped} · failed {progress.failed}
            </span>
          )}
          {sending ? (
            <Button variant="outline" onClick={() => { abortRef.current = true; }}>
              <X className="h-4 w-4 mr-1.5" /> Stop
            </Button>
          ) : (
            <>
              {savedAt && (
                <span className="text-[11px] text-muted-foreground mr-auto flex items-center gap-1">
                  <Check size={11} className="text-foreground/70" /> Draft saved · {new Date(savedAt).toLocaleTimeString()}
                </span>
              )}
              <Button variant="ghost" onClick={clearDraft} title="Reset to template">Clear</Button>
              <Button variant="outline" onClick={saveDraft}>
                <Save className="h-4 w-4 mr-1.5" /> Save draft
              </Button>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={send} disabled={recipients.length === 0}>
                <Send className="h-4 w-4 mr-1.5" /> Send all
              </Button>
            </>
          )}
          {sending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
