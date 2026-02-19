import React, { useState } from 'react';
import { Lead, updateLead } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { X, Upload } from 'lucide-react';

const COLOR_OPTIONS = [
  { label: 'Bold & Dark', value: 'bold_dark', preview: 'bg-gray-900 border-gray-700' },
  { label: 'Clean & Light', value: 'clean_light', preview: 'bg-white border-gray-200' },
  { label: 'Earthy & Warm', value: 'earthy_warm', preview: 'bg-amber-50 border-amber-300' },
  { label: 'Modern Blue', value: 'modern_blue', preview: 'bg-blue-600 border-blue-400' },
  { label: 'Luxury Black/Gold', value: 'luxury', preview: 'bg-black border-yellow-500' },
  { label: 'Vibrant Colours', value: 'vibrant', preview: 'bg-gradient-to-r from-purple-500 to-pink-500 border-purple-300' },
  { label: 'Natural & Green', value: 'natural', preview: 'bg-green-700 border-green-500' },
  { label: 'Custom / TBD', value: 'custom', preview: 'bg-muted border-border' },
];

const STYLE_OPTIONS = [
  'Minimal & Clean',
  'Corporate & Professional',
  'Creative & Bold',
  'Elegant & Luxury',
  'Playful & Fun',
  'Industrial / Dark',
  'Modern Tech',
  'Traditional / Classic',
];

interface DemoFormData {
  colorScheme: string;
  style: string;
  bookingSystem: boolean | null;
  hasPhotos: boolean | null;
  websiteGoal: string;
  additionalNotes: string;
}

interface DemoFormProps {
  lead: Lead;
  open: boolean;
  onClose: () => void;
  onSave: (lead: Lead) => void;
}

function parseDemoData(notes: string | null): Partial<DemoFormData> {
  if (!notes) return {};
  try {
    const match = notes.match(/\[DEMO\]([\s\S]*?)(?:\[\/DEMO\]|$)/);
    if (match) return JSON.parse(match[1]);
  } catch {}
  return {};
}

function encodeDemoData(data: DemoFormData, existingNotes: string | null): string {
  const json = JSON.stringify(data);
  const base = (existingNotes || '').replace(/\[DEMO\][\s\S]*?(?:\[\/DEMO\]|$)/, '').trim();
  return `${base ? base + '\n' : ''}[DEMO]${json}[/DEMO]`;
}

export function DemoFormModal({ lead, open, onClose, onSave }: DemoFormProps) {
  const existing = parseDemoData(lead.notes);
  const [colorScheme, setColorScheme] = useState(existing.colorScheme || '');
  const [style, setStyle] = useState(existing.style || '');
  const [bookingSystem, setBookingSystem] = useState<boolean | null>(existing.bookingSystem ?? null);
  const [hasPhotos, setHasPhotos] = useState<boolean | null>(existing.hasPhotos ?? null);
  const [websiteGoal, setWebsiteGoal] = useState(existing.websiteGoal || '');
  const [additionalNotes, setAdditionalNotes] = useState(existing.additionalNotes || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data: DemoFormData = { colorScheme, style, bookingSystem, hasPhotos, websiteGoal, additionalNotes };
      const encoded = encodeDemoData(data, lead.notes);
      const updated = await updateLead(lead.id, { notes: encoded, status: 'demo' });
      onSave(updated);
      toast.success('Demo brief saved');
      onClose();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-purple-400">
            <span className="text-lg">🎨</span> Demo Brief — {lead.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Colour scheme */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Colour Scheme</label>
            <div className="grid grid-cols-2 gap-2">
              {COLOR_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setColorScheme(opt.value)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md border text-sm transition-all text-left ${
                    colorScheme === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-border/80 hover:text-foreground'
                  }`}
                >
                  <span className={`w-4 h-4 rounded-sm border shrink-0 ${opt.preview}`} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Style */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Website Style</label>
            <div className="grid grid-cols-2 gap-2">
              {STYLE_OPTIONS.map(opt => (
                <button
                  key={opt}
                  onClick={() => setStyle(opt)}
                  className={`px-3 py-2 rounded-md border text-sm transition-all text-left ${
                    style === opt
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-border/80 hover:text-foreground'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Booking system */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Booking System?</label>
            <div className="flex gap-2">
              {[{ label: 'Yes', val: true }, { label: 'No', val: false }].map(opt => (
                <button
                  key={String(opt.val)}
                  onClick={() => setBookingSystem(opt.val)}
                  className={`flex-1 py-2 rounded-md border text-sm transition-all ${
                    bookingSystem === opt.val
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Photos */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Do they have business photos?</label>
            <div className="flex gap-2">
              {[{ label: 'Yes, they do', val: true }, { label: 'No / Need shoot', val: false }].map(opt => (
                <button
                  key={String(opt.val)}
                  onClick={() => setHasPhotos(opt.val)}
                  className={`flex-1 py-2 rounded-md border text-sm transition-all ${
                    hasPhotos === opt.val
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {hasPhotos === true && (
              <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                <Upload size={11} /> Ask them to send photos via WhatsApp/email
              </p>
            )}
          </div>

          {/* Website goal */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Goal of the website</label>
            <Textarea
              value={websiteGoal}
              onChange={e => setWebsiteGoal(e.target.value)}
              placeholder="e.g. Generate leads, showcase portfolio, take online bookings, sell products..."
              className="resize-none h-20 text-sm"
            />
          </div>

          {/* Additional notes */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Additional notes / requests</label>
            <Textarea
              value={additionalNotes}
              onChange={e => setAdditionalNotes(e.target.value)}
              placeholder="Anything else the client mentioned..."
              className="resize-none h-16 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            <X size={14} className="mr-1" /> Cancel
          </Button>
          <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Brief'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Compact read-only summary of a saved demo brief */
export function DemoBriefSummary({ notes }: { notes: string | null }) {
  const data = parseDemoData(notes);
  if (!data.colorScheme && !data.style && !data.websiteGoal) return null;

  const colorLabel = COLOR_OPTIONS.find(c => c.value === data.colorScheme)?.label;

  return (
    <div className="mt-1.5 text-xs flex flex-wrap gap-2 text-muted-foreground">
      {colorLabel && <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded">🎨 {colorLabel}</span>}
      {data.style && <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded">✨ {data.style}</span>}
      {data.bookingSystem !== null && <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded">📅 Booking: {data.bookingSystem ? 'Yes' : 'No'}</span>}
      {data.hasPhotos !== null && <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded">📸 Photos: {data.hasPhotos ? 'Yes' : 'No'}</span>}
      {data.websiteGoal && <span className="italic truncate max-w-[200px]">{data.websiteGoal}</span>}
    </div>
  );
}
