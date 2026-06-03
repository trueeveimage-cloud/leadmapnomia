import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Lead, updateLead, logActivity } from '@/lib/supabase';
import { supabase } from '@/integrations/supabase/client';
import { useCRM } from '@/context/CRMContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Paperclip, Link2, Plus, Trash2, Upload, X, Ban, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import LeadEmailHistory from '@/components/LeadEmailHistory';
import LeadTimeline from '@/components/LeadTimeline';
import { Crown, Map as MapIcon } from 'lucide-react';

interface Attachment {
  id: string;
  lead_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
}

interface LeadLink {
  id: string;
  lead_id: string;
  url: string;
  label: string | null;
  created_at: string;
}

interface Props {
  lead: Lead;
  onUpdate: (lead: Lead) => void;
}

export function LeadDetailPanel({ lead, onUpdate }: Props) {
  const { refreshCounts } = useCRM();
  const [notes, setNotes] = useState(lead.notes || '');
  const [saving, setSaving] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [links, setLinks] = useState<LeadLink[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const notesTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setNotes(lead.notes || '');
    loadAttachments();
    loadLinks();
  }, [lead.id]);

  const loadAttachments = async () => {
    const { data } = await supabase.from('lead_attachments').select('*').eq('lead_id', lead.id).order('created_at', { ascending: false });
    setAttachments((data || []) as Attachment[]);
  };

  const loadLinks = async () => {
    const { data } = await supabase.from('lead_links').select('*').eq('lead_id', lead.id).order('created_at', { ascending: false });
    setLinks((data || []) as LeadLink[]);
  };

  const handleNotesChange = (val: string) => {
    setNotes(val);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(async () => {
      try {
        const updated = await updateLead(lead.id, { notes: val });
        onUpdate(updated);
      } catch { /* silent */ }
    }, 800);
  };

  const uploadFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} too large (max 10MB)`);
        continue;
      }
      const path = `${lead.id}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from('lead-attachments').upload(path, file);
      if (error) { toast.error(`Upload failed: ${file.name}`); continue; }
      // Store the storage path (not a public URL); we generate signed URLs on demand.
      await supabase.from('lead_attachments').insert({
        lead_id: lead.id,
        file_name: file.name,
        file_url: path,
        file_type: file.type,
        file_size: file.size,
      });
      await logActivity(lead.id, 'attachment', { file_name: file.name });
    }
    loadAttachments();
    toast.success('Uploaded');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  };

  const deleteAttachment = async (att: Attachment) => {
    // file_url may be a storage path (new) or a legacy public URL — handle both
    let path = att.file_url;
    if (path.includes('/lead-attachments/')) {
      path = decodeURIComponent(path.split('/lead-attachments/')[1] || '');
    }
    if (path) {
      await supabase.storage.from('lead-attachments').remove([path]);
    }
    await supabase.from('lead_attachments').delete().eq('id', att.id);
    loadAttachments();
  };

  const openAttachment = async (att: Attachment) => {
    let path = att.file_url;
    if (path.includes('/lead-attachments/')) {
      path = decodeURIComponent(path.split('/lead-attachments/')[1] || '');
    }
    const { data, error } = await supabase.storage
      .from('lead-attachments')
      .createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      toast.error('Could not open file');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const addLink = async () => {
    if (!newUrl.trim()) return;
    let url = newUrl.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    await supabase.from('lead_links').insert({ lead_id: lead.id, url, label: newLabel.trim() || null });
    await logActivity(lead.id, 'link_added', { url });
    setNewUrl('');
    setNewLabel('');
    loadLinks();
  };

  const deleteLink = async (id: string) => {
    await supabase.from('lead_links').delete().eq('id', id);
    loadLinks();
  };

  return (
    <div className="space-y-4 text-sm">
      {/* Notes */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Notes</div>
        <Textarea
          value={notes}
          onChange={e => handleNotesChange(e.target.value)}
          placeholder="Add notes..."
          className="min-h-[60px] text-xs bg-muted resize-y"
          rows={3}
        />
      </div>

      {/* Attachments */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attachments</div>
          <span className="text-[10px] text-muted-foreground">{attachments.length}</span>
        </div>

        <div
          className={cn(
            'border border-dashed rounded-md p-3 text-center transition-colors cursor-pointer mb-2',
            dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground'
          )}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={14} className="mx-auto mb-1 text-muted-foreground" />
          <div className="text-xs text-muted-foreground">Drop files or click to upload</div>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={e => e.target.files && uploadFiles(e.target.files)} />
        </div>

        {attachments.length > 0 && (
          <div className="space-y-1">
            {attachments.map(att => (
              <div key={att.id} className="flex items-center gap-2 text-xs bg-muted rounded px-2 py-1.5 group">
                <Paperclip size={10} className="text-muted-foreground shrink-0" />
                <button onClick={() => openAttachment(att)} className="text-primary hover:underline truncate flex-1 text-left">{att.file_name}</button>
                {att.file_size && <span className="text-muted-foreground shrink-0">{(att.file_size / 1024).toFixed(0)}KB</span>}
                <button onClick={() => deleteAttachment(att)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Links */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Links</div>
        {links.length > 0 && (
          <div className="space-y-1 mb-2">
            {links.map(link => (
              <div key={link.id} className="flex items-center gap-2 text-xs bg-muted rounded px-2 py-1.5 group">
                <Link2 size={10} className="text-muted-foreground shrink-0" />
                <a href={link.url} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate flex-1">{link.label || link.url}</a>
                <button onClick={() => deleteLink(link.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-1.5">
          <Input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="URL" className="h-7 text-xs bg-muted flex-1" onKeyDown={e => e.key === 'Enter' && addLink()} />
          <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Label" className="h-7 text-xs bg-muted w-24" onKeyDown={e => e.key === 'Enter' && addLink()} />
          <Button size="sm" variant="outline" className="h-7 px-2" onClick={addLink}><Plus size={12} /></Button>
        </div>
      </div>

      {/* Product side (Nomia / Leadmap) */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Product</div>
        <div className="flex gap-1.5">
          {(['nomia','leadmap'] as const).map(p => {
            const current = ((lead as any).product || 'nomia') === p;
            const Icon = p === 'nomia' ? Crown : MapIcon;
            return (
              <button
                key={p}
                onClick={async () => {
                  if (current) return;
                  const updated = await updateLead(lead.id, { product: p } as any);
                  onUpdate(updated);
                  toast.success(`Moved to ${p === 'nomia' ? 'Nomia' : 'Leadmap'}`);
                }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded border transition-all',
                  current
                    ? p === 'nomia'
                      ? 'bg-[hsl(45,90%,55%)]/15 text-[hsl(45,90%,65%)] border-[hsl(45,90%,55%)]/40'
                      : 'bg-white/10 text-white border-white/30'
                    : 'bg-muted text-muted-foreground border-transparent hover:text-foreground'
                )}
              >
                <Icon size={12} /> {p === 'nomia' ? 'Nomia' : 'Leadmap'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Combined timeline */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Timeline</div>
        <LeadTimeline leadId={lead.id} />
      </div>

      {/* Email outreach history */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Email history</div>
        <LeadEmailHistory leadId={lead.id} />
      </div>

      {/* Opt-out control */}
      <div className="bg-muted rounded p-2 flex items-center justify-between gap-2">
        <div className="text-xs">
          <div className="font-medium">Outreach status</div>
          <div className="text-muted-foreground text-[10px]">
            {(lead as any).outreach_opt_out ? 'Unsubscribed — no further emails or SMS will be sent.' : 'Subscribed'}
          </div>
        </div>
        <Button
          size="sm"
          variant={(lead as any).outreach_opt_out ? 'outline' : 'destructive'}
          className="h-7 text-xs gap-1"
          onClick={async () => {
            const next = !(lead as any).outreach_opt_out;
            const updated = await updateLead(lead.id, { outreach_opt_out: next } as any);
            await logActivity(lead.id, next ? 'unsubscribed' : 'resubscribed', {});
            onUpdate(updated);
            toast.success(next ? 'Lead unsubscribed' : 'Lead re-subscribed');
          }}
        >
          {(lead as any).outreach_opt_out ? <><RotateCcw size={11} /> Re-subscribe</> : <><Ban size={11} /> Unsubscribe</>}
        </Button>
      </div>

      {/* Contact tracking info */}
      {((lead as any).call_attempts > 0 || (lead as any).last_contacted_at) && (
        <div className="text-xs text-muted-foreground bg-muted rounded p-2 space-y-0.5">
          {(lead as any).call_attempts > 0 && <div>📞 {(lead as any).call_attempts} call attempt{(lead as any).call_attempts !== 1 ? 's' : ''}</div>}
          {(lead as any).last_contacted_at && <div>🕐 Last contacted: {format(new Date((lead as any).last_contacted_at), 'MMM d h:mma')}</div>}
          {(lead as any).last_contact_method && <div>📋 Method: {(lead as any).last_contact_method}</div>}
        </div>
      )}
    </div>
  );
}
