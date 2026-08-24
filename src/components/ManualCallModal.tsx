import React, { useMemo, useState } from 'react';
import { Bot, Loader2, Phone, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import {
  addLead,
  createNotification,
  getActiveProduct,
  logActivity,
  updateLead,
  acquireOutreachLock,
  getSetting,
  type Lead,
} from '@/lib/supabase';
import { AI_COLD_CALLS_DISABLED } from '@/lib/disabledFeatures';

type ManualCallModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: (lead?: Lead) => void;
};

function normalizePhone(input: string) {
  const compact = input.trim().replace(/[^\d+]/g, '');
  if (!compact) return '';
  if (compact.startsWith('+')) return `+${compact.slice(1).replace(/\D/g, '')}`;
  if (compact.startsWith('00')) return `+${compact.slice(2).replace(/\D/g, '')}`;
  if (compact.startsWith('0')) return `+46${compact.slice(1).replace(/\D/g, '')}`;
  if (compact.startsWith('46')) return `+${compact.replace(/\D/g, '')}`;
  return compact.replace(/\D/g, '');
}

function isLikelyCallable(phone: string) {
  return /^\+\d{8,15}$/.test(phone);
}

async function findLeadByPhone(phoneE164: string, rawPhone: string) {
  const values = Array.from(new Set([phoneE164, rawPhone.trim()].filter(Boolean)));
  for (const value of values) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .or(`phone_e164.eq.${value},phone.eq.${value}`)
      .eq('product', getActiveProduct())
      .limit(1);
    if (error) throw error;
    if (data?.[0]) return data[0] as Lead;
  }
  return null;
}

export function ManualCallModal({ open, onOpenChange, onDone }: ManualCallModalProps) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('SE');
  const [businessType, setBusinessType] = useState('');
  const [busy, setBusy] = useState<'self' | 'ai' | null>(null);

  const normalizedPhone = useMemo(() => normalizePhone(phone), [phone]);
  const phoneValid = isLikelyCallable(normalizedPhone);

  const reset = () => {
    setPhone('');
    setName('');
    setCity('');
    setCountry('SE');
    setBusinessType('');
    setBusy(null);
  };

  const close = () => {
    onOpenChange(false);
    reset();
  };

  const ensureLead = async () => {
    if (!phoneValid) throw new Error('Enter a valid phone number, for example 0763224478 or +46763224478.');

    const existing = await findLeadByPhone(normalizedPhone, phone);
    if (existing) {
      const updates: Partial<Lead> = {
        phone: existing.phone || normalizedPhone,
        phone_e164: existing.phone_e164 || normalizedPhone,
        section: existing.email ? 'both' : 'phone',
      };
      if (name.trim() && existing.name.startsWith('Manual call ')) updates.name = name.trim();
      if (city.trim() && !existing.city) updates.city = city.trim();
      if (country.trim() && !existing.country) updates.country = country.trim().toUpperCase();
      if (businessType.trim() && !existing.business_type) updates.business_type = businessType.trim();

      if (Object.keys(updates).length > 0) return await updateLead(existing.id, updates);
      return existing;
    }

    const displayName = name.trim() || `Manual call ${normalizedPhone}`;
    const result = await addLead({
      name: displayName,
      phone: normalizedPhone,
      phone_e164: normalizedPhone,
      section: 'phone',
      status: 'not_contacted',
      category: businessType.trim() || 'Manual call',
      city: city.trim() || null,
      country: (country.trim() || 'SE').toUpperCase(),
      business_type: businessType.trim() || null,
      notes: 'Created from manual call panel',
      tags: ['manual-call'],
    } as any);

    if (result.error) throw new Error(result.error);
    return result.lead || result.duplicate;
  };

  const callSelf = async () => {
    setBusy('self');
    try {
      const lead = await ensureLead();
      if (!lead) throw new Error('Could not create the lead.');
      if (await getSetting('outreach_master_paused') !== 'false') {
        throw new Error('Outreach is paused. Unpause it from Nomia settings before calling.');
      }
      const lock = await acquireOutreachLock(lead.id, 'call');
      if (!lock?.allowed) throw new Error(`Call blocked: ${String(lock?.reason || 'outreach locked').replace(/_/g, ' ')}`);
      const updated = await updateLead(lead.id, {
        call_attempts: (lead.call_attempts || 0) + 1,
        last_contacted_at: new Date().toISOString(),
        last_contact_method: 'manual_call',
        call_outcome_last: 'manual_started',
        status: 'contacted',
        needs_call: false,
      } as any);
      await logActivity(lead.id, 'manual_call_started', { phone: normalizedPhone });
      toast.success('Lead saved. Opening phone dialer.');
      onDone?.(updated);
      window.location.href = `tel:${normalizedPhone}`;
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start manual call');
    } finally {
      setBusy(null);
    }
  };

  const callWithAi = async () => {
    if (AI_COLD_CALLS_DISABLED) {
      toast.error('AI cold calls are disabled. Use manual calling only.');
      return;
    }
    setBusy('ai');
    try {
      const lead = await ensureLead();
      if (!lead) throw new Error('Could not create the lead.');
      const { data, error } = await supabase.functions.invoke('retell-start-call', {
        body: { leadId: lead.id, manualUnlock: false },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);

      await createNotification({
        type: 'ai_call_started',
        title: 'AI call started',
        message: `${lead.name}${data?.retell_call_id ? ` - ${data.retell_call_id}` : ''}`,
        payload: { leadId: lead.id, leadName: lead.name, retell_call_id: data?.retell_call_id || '' },
      });

      toast.success(data?.retell_call_id ? `AI call started: ${data.retell_call_id}` : 'AI call started');
      onDone?.({ ...lead, call_status: 'Calling', retell_call_id: data?.retell_call_id || lead.retell_call_id });
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start AI call');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manual call</DialogTitle>
          <DialogDescription>
            Type a phone number, save it as a CRM lead, then choose who should call.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="manual-call-phone">Phone number</Label>
            <Input
              id="manual-call-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="0763224478"
              autoComplete="tel"
            />
            <div className="min-h-4 text-xs text-muted-foreground">
              {phone
                ? phoneValid
                  ? `Will call ${normalizedPhone}`
                  : 'Use a Swedish mobile/landline or full + country code.'
                : 'Swedish 0-numbers are converted to +46.'}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-call-name">Business or person</Label>
            <Input
              id="manual-call-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Optional"
              autoComplete="organization"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="manual-call-city">City</Label>
              <Input id="manual-call-city" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-call-country">Country</Label>
              <Input id="manual-call-country" value={country} onChange={(event) => setCountry(event.target.value)} placeholder="SE" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-call-type">Business type</Label>
            <Input
              id="manual-call-type"
              value={businessType}
              onChange={(event) => setBusinessType(event.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="grid gap-2 pt-1 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="h-auto justify-start gap-2 py-3"
              disabled={!phoneValid || !!busy}
              onClick={callSelf}
            >
              {busy === 'self' ? <Loader2 size={16} className="animate-spin" /> : <Phone size={16} />}
              <span className="text-left">
                <span className="block text-sm font-semibold">I'll call</span>
                <span className="block text-xs text-muted-foreground">Open dialer</span>
              </span>
            </Button>
            <Button
              type="button"
              className="h-auto justify-start gap-2 py-3"
              disabled={!phoneValid || !!busy || AI_COLD_CALLS_DISABLED}
              onClick={callWithAi}
            >
              {busy === 'ai' ? <Loader2 size={16} className="animate-spin" /> : <Bot size={16} />}
              <span className="text-left">
                <span className="block text-sm font-semibold">{AI_COLD_CALLS_DISABLED ? 'AI disabled' : 'AI calls'}</span>
                <span className="block text-xs opacity-80">
                  {AI_COLD_CALLS_DISABLED ? 'Failed sales test' : 'Save result in CRM'}
                </span>
              </span>
            </Button>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <UserPlus size={14} className="shrink-0" />
            New numbers are added to the phone section automatically.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
