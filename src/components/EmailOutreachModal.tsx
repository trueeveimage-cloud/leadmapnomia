import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Send, X, Mail, History, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { generateOutreachMessage, detectNiche } from '@/lib/leadScoring';
import LeadEmailHistory from '@/components/LeadEmailHistory';
import type { Lead } from '@/lib/supabase';

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
  const [subject, setSubject] = useState<string>(() => recipients[0] ? defaultSubject(recipients[0]) : 'En snabb fråga');
  const [body, setBody] = useState<string>(() => recipients[0] ? generateOutreachMessage(recipients[0]) + '\n\n— Skickat från Leadline AI' : '');
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => Object.fromEntries(recipients.map((l) => [l.id, true])));
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, sent: 0, skipped: 0, failed: 0 });
  const abortRef = React.useRef(false);

  React.useEffect(() => {
    if (open && recipients[0]) {
      setSubject(defaultSubject(recipients[0]));
      setBody(generateOutreachMessage(recipients[0]) + '\n\n— Skickat från Leadline AI');
      setEnabled(Object.fromEntries(recipients.map((l) => [l.id, true])));
      setProgress({ done: 0, sent: 0, skipped: 0, failed: 0 });
      abortRef.current = false;
    }
  }, [open, recipients.length]);

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
              <div className="border rounded-md max-h-48 overflow-y-auto">
                {recipients.map((l) => (
                  <label key={l.id} className="flex items-center gap-2 px-2 py-1.5 border-b last:border-0 text-xs hover:bg-accent cursor-pointer">
                    <input type="checkbox" checked={!!enabled[l.id]} onChange={(e) => setEnabled((p) => ({ ...p, [l.id]: e.target.checked }))} />
                    <span className="font-medium truncate flex-1">{l.name}</span>
                    <span className="text-muted-foreground truncate">{l.email}</span>
                  </label>
                ))}
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
