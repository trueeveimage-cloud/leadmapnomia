import React, { useState } from 'react';
import { toast } from 'sonner';
import { Globe, MapPin, Phone, Copy, Mail, MessageSquare, CheckCircle2, Bell, StickyNote, Search, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { updateLead, logActivity, type Lead } from '@/lib/supabase';
import { generateOutreachMessage } from '@/lib/leadScoring';
import EmailOutreachModal from '@/components/EmailOutreachModal';

interface Props {
  lead: Lead;
  onUpdated?: () => void;
}

function copy(value: string, label: string) {
  navigator.clipboard.writeText(value).then(() => toast.success(`${label} copied`));
}

export default function LeadQuickActions({ lead, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);
  const [findingEmail, setFindingEmail] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);

  const findEmail = async () => {
    if (!lead.website) { toast.error('No website to scrape'); return; }
    setFindingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-emails', {
        body: { urls: [{ leadId: lead.id, website: lead.website }] },
      });
      if (error) throw error;
      const r = data?.results?.[0];
      const email = r?.email || r?.emails?.[0];
      if (email) {
        await updateLead(lead.id, { email, email_source: r.source || 'homepage' });
        await logActivity(lead.id, 'email_found', { email, source: r.source });
        toast.success(`Found ${email}`);
        onUpdated?.();
      } else {
        toast.info('No email found on website');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Scrape failed');
    } finally { setFindingEmail(false); }
  };

  const markContacted = async () => {
    setBusy(true);
    try {
      await updateLead(lead.id, { status: 'contacted', last_contacted_at: new Date().toISOString() });
      await logActivity(lead.id, 'status_change', { to: 'contacted', from: lead.status });
      toast.success('Marked as contacted');
      onUpdated?.();
    } finally { setBusy(false); }
  };

  const setFollowUp = async () => {
    const days = window.prompt('Follow up in how many days?', '3');
    if (!days) return;
    const d = parseInt(days, 10);
    if (Number.isNaN(d)) return;
    const when = new Date(Date.now() + d * 86_400_000).toISOString();
    await updateLead(lead.id, { follow_up_at: when, status: 'follow_up' });
    await logActivity(lead.id, 'follow_up_set', { when });
    toast.success(`Follow-up set for ${new Date(when).toLocaleDateString()}`);
    onUpdated?.();
  };

  const addNote = async () => {
    const note = window.prompt('Add a note', lead.notes || '');
    if (note === null) return;
    await updateLead(lead.id, { notes: note });
    await logActivity(lead.id, 'note_added', { note });
    toast.success('Note saved');
    onUpdated?.();
  };

  const outreach = generateOutreachMessage(lead);

  return (
    <div className="flex flex-wrap gap-1.5">
      {lead.website && (
        <Button size="sm" variant="outline" asChild>
          <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer">
            <Globe className="h-3.5 w-3.5 mr-1" /> Website
          </a>
        </Button>
      )}
      {lead.maps_url && (
        <Button size="sm" variant="outline" asChild>
          <a href={lead.maps_url} target="_blank" rel="noreferrer">
            <MapPin className="h-3.5 w-3.5 mr-1" /> Maps
          </a>
        </Button>
      )}
      {lead.phone && (
        <>
          <Button size="sm" variant="outline" asChild>
            <a href={`tel:${lead.phone_e164 || lead.phone}`}><Phone className="h-3.5 w-3.5 mr-1" /> Call</a>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => copy(lead.phone!, 'Phone')}>
            <Copy className="h-3.5 w-3.5 mr-1" /> Phone
          </Button>
        </>
      )}
      {lead.email ? (
        <>
          <Button size="sm" variant="ghost" onClick={() => copy(lead.email!, 'Email')}>
            <Mail className="h-3.5 w-3.5 mr-1" /> Email
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEmailModalOpen(true)}>
            <Send className="h-3.5 w-3.5 mr-1" /> Send email
          </Button>
        </>
      ) : lead.website ? (
        <Button size="sm" variant="outline" onClick={findEmail} disabled={findingEmail}>
          {findingEmail ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1" />}
          Find email
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" onClick={() => copy(outreach, 'Outreach message')}>
        <MessageSquare className="h-3.5 w-3.5 mr-1" /> Copy pitch
      </Button>
      <Button size="sm" variant="secondary" onClick={markContacted} disabled={busy}>
        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Contacted
      </Button>
      <Button size="sm" variant="ghost" onClick={setFollowUp}>
        <Bell className="h-3.5 w-3.5 mr-1" /> Follow-up
      </Button>
      <Button size="sm" variant="ghost" onClick={addNote}>
        <StickyNote className="h-3.5 w-3.5 mr-1" /> Note
      </Button>
      <EmailOutreachModal open={emailModalOpen} onOpenChange={setEmailModalOpen} leads={[lead]} onSent={onUpdated} />
    </div>
  );
}
