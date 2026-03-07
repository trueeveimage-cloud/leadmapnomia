import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createCampaign, countEligibleLeadsDetailed, AudienceFilter, EligibilityBreakdown, renderTemplate } from '@/lib/campaigns';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Users, MessageSquare, Shield, Megaphone, Zap, Globe, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import InfoTip from '@/components/InfoTip';
import type { Country } from '@/lib/cities';
import CountryFlag from '@/components/CountryFlag';

const SECTIONS = [
  { value: 'phone', label: 'Has Phone' },
  { value: 'email', label: 'Has Email' },
  { value: 'both', label: 'Both' },
  { value: 'unsorted', label: 'Unsorted' },
];

const COUNTRIES: { value: Country; label: string }[] = [
  { value: 'SE', label: 'Sweden' },
  { value: 'NO', label: 'Norway' },
  { value: 'DK', label: 'Denmark' },
];

const VARIABLES = ['{name}', '{category}', '{city}', '{rating}'];

const TEMPLATE_PRESETS = [
  {
    label: '🎯 Direct Value',
    text: 'Hej {name}! Jag hittade ert företag på Google – ni har bra omdömen men ingen hemsida. Vi bygger hemsidor från 2990kr. Intresserad? Svara JA',
    tip: 'Leads to a clear YES/NO decision. Mentions price to pre-qualify.',
  },
  {
    label: '❓ Question Hook',
    text: 'Hej! Snabb fråga – får ni kunder via Google just nu? Vi hjälper {category} i {city} att synas bättre. Vill du veta hur? /Marcus',
    tip: 'Questions get 2-3x more replies than statements. Personal name builds trust.',
  },
  {
    label: '⭐ Compliment First',
    text: 'Hej {name}! Såg att ni har {rating} stjärnor på Google – imponerande! Men jag la märke till att ni saknar hemsida. Vill ni ha hjälp med det?',
    tip: 'Opens with genuine compliment. Feels personal, not mass-sent.',
  },
  {
    label: '🔥 Urgency',
    text: 'Hej {name}, vi har just nu 3 lediga platser för nya hemsidor i {city}. Intresserad av en offert? Svara JA så återkommer jag idag.',
    tip: 'Scarcity + speed creates urgency. Works best for limited offers.',
  },
  {
    label: '🇳🇴 Norwegian',
    text: 'Hei {name}! Jeg fant dere på Google – dere har gode anmeldelser men ingen nettside. Vi lager nettsider fra 2990kr. Interessert? Svar JA',
    tip: 'Norwegian version of the direct value template.',
  },
];

export default function CampaignNewPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [filter, setFilter] = useState<AudienceFilter>({
    sections: ['phone'],
    hasWebsite: false,
    excludeOptOut: true,
    excludeReplied: true,
    excludeMissingPhone: true,
    countries: ['SE', 'NO', 'DK'],
  });
  const [template, setTemplate] = useState('Hej {name}! Vi hjälper företag inom {category} att växa. Svara JA för mer info. Svara STOP för att avsluta.');
  const [dailyCap, setDailyCap] = useState(100);
  const [batchCap, setBatchCap] = useState(200);
  const [cooldownDays, setCooldownDays] = useState(0);
  const [callAfterHours, setCallAfterHours] = useState(48);
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<EligibilityBreakdown | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleSection = (s: string) => {
    setFilter(f => {
      const sections = f.sections || [];
      return { ...f, sections: sections.includes(s) ? sections.filter(x => x !== s) : [...sections, s] };
    });
  };

  const toggleCountry = (c: Country) => {
    setFilter(f => {
      const countries = f.countries || [];
      return { ...f, countries: countries.includes(c) ? countries.filter(x => x !== c) : [...countries, c] };
    });
  };

  const handleEstimate = async () => {
    setEstimating(true);
    try {
      const breakdown = await countEligibleLeadsDetailed(filter, cooldownDays);
      setEstimate(breakdown);
    } catch { toast.error('Failed to estimate'); }
    finally { setEstimating(false); }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Campaign name is required'); return; }
    setSaving(true);
    try {
      const campaign = await createCampaign({
        name,
        audience_filter: filter as any,
        template_text: template,
        variables_used: VARIABLES.filter(v => template.includes(v)) as any,
        daily_cap: dailyCap,
        batch_cap: batchCap,
        cooldown_days: cooldownDays,
        call_after_hours: callAfterHours,
        status: 'draft',
      });
      toast.success('Campaign created!');
      navigate(`/campaigns/${campaign.id}`);
    } catch { toast.error('Failed to create campaign'); }
    finally { setSaving(false); }
  };

  const sampleLead = { name: 'Frisör Anna', category: 'Hair Salon', city: 'Göteborg', rating: '4.5' };

  // Estimate cost for this campaign
  const estCost = batchCap * 0.065;

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-6 pt-8">
        <div className="flex items-center gap-2 mb-6">
          <Megaphone size={20} className="text-primary" />
          <h1 className="text-xl font-bold text-foreground">New Campaign</h1>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-6">
          {[
            { n: 1, label: 'Audience', icon: <Users size={13} /> },
            { n: 2, label: 'Message', icon: <MessageSquare size={13} /> },
            { n: 3, label: 'Controls', icon: <Shield size={13} /> },
          ].map(s => (
            <button
              key={s.n}
              onClick={() => setStep(s.n)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                step === s.n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>

        {/* Campaign name */}
        <div className="mb-4">
          <label className="text-xs font-medium text-foreground mb-1 block">Campaign Name</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Göteborg Hair Salons" className="h-8 text-sm" />
        </div>

        {/* Step 1: Audience */}
        {step === 1 && (
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <h2 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Users size={15} /> Audience Filters
              <InfoTip text="Select which leads to target. Leads must have a phone number and not be opted out." />
            </h2>

            {/* Country selector */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1.5">
                <Globe size={12} /> Countries
              </label>
              <div className="flex flex-wrap gap-1.5">
                {COUNTRIES.map(c => (
                  <button
                    key={c.value}
                    onClick={() => toggleCountry(c.value)}
                    className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                      filter.countries?.includes(c.value) ? 'bg-primary/15 text-primary border-primary/30' : 'bg-muted text-muted-foreground border-border hover:border-primary/30'
                    }`}
                  >
                    <CountryFlag country={c.value} size={16} /> {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Sections</label>
              <div className="flex flex-wrap gap-1.5">
                {SECTIONS.map(s => (
                  <button
                    key={s.value}
                    onClick={() => toggleSection(s.value)}
                    className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                      filter.sections?.includes(s.value) ? 'bg-primary/15 text-primary border-primary/30' : 'bg-muted text-muted-foreground border-border hover:border-primary/30'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={filter.hasWebsite === false}
                onChange={e => setFilter(f => ({ ...f, hasWebsite: e.target.checked ? false : undefined }))}
                className="accent-primary"
              />
              No website only
              <InfoTip text="Only target leads without a website — they're more likely to need your services" />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Min Rating</label>
                <Input type="number" step="0.1" min="0" max="5" value={filter.minRating ?? ''} onChange={e => setFilter(f => ({ ...f, minRating: e.target.value ? Number(e.target.value) : undefined }))} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Min Reviews</label>
                <Input type="number" min="0" value={filter.minReviews ?? ''} onChange={e => setFilter(f => ({ ...f, minReviews: e.target.value ? Number(e.target.value) : undefined }))} className="h-8 text-sm" />
              </div>
            </div>

            <div className="space-y-1.5">
              {[
                { key: 'excludeOptOut' as const, label: 'Exclude opted-out leads' },
                { key: 'excludeReplied' as const, label: 'Exclude leads who already replied' },
                { key: 'excludeMissingPhone' as const, label: 'Exclude leads missing phone' },
              ].map(opt => (
                <label key={opt.key} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" checked={filter[opt.key] !== false} onChange={e => setFilter(f => ({ ...f, [opt.key]: e.target.checked }))} className="accent-primary" />
                  {opt.label}
                </label>
              ))}
            </div>

            <Button variant="outline" onClick={handleEstimate} disabled={estimating} className="h-8 text-sm gap-2">
              <Zap size={13} />
              {estimating ? 'Estimating...' : 'Estimate eligible leads'}
            </Button>
            {estimate !== null && (
              <div className="space-y-1.5 mt-2">
                <p className="text-sm text-primary font-semibold">{estimate.eligible} leads eligible for SMS</p>
                <div className="text-xs text-muted-foreground space-y-0.5 bg-muted/50 border border-border rounded-md p-3">
                  <p className="font-medium text-foreground mb-1">Breakdown of {estimate.total} total leads:</p>
                  <p className="text-primary">✓ {estimate.eligible} eligible (valid mobile, passes all filters)</p>
                  {estimate.noPhone > 0 && <p>✗ {estimate.noPhone} — no phone number</p>}
                  {estimate.landline > 0 && <p>✗ {estimate.landline} — landline / invalid mobile prefix</p>}
                  {estimate.hasWebsite > 0 && <p>✗ {estimate.hasWebsite} — has website (filtered out)</p>}
                  {estimate.wrongSection > 0 && <p>✗ {estimate.wrongSection} — wrong section/country</p>}
                  {estimate.optedOut > 0 && <p>✗ {estimate.optedOut} — opted out</p>}
                  {estimate.replied > 0 && <p>✗ {estimate.replied} — already replied</p>}
                  {estimate.cooldown > 0 && <p>✗ {estimate.cooldown} — in cooldown period</p>}
                  {estimate.lowRating > 0 && <p>✗ {estimate.lowRating} — below min rating</p>}
                  {estimate.lowReviews > 0 && <p>✗ {estimate.lowReviews} — below min reviews</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Message */}
        {step === 2 && (
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <h2 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <MessageSquare size={15} /> Message Template
              <InfoTip text="Write your SMS template. Use variables like {name} to personalize each message." />
            </h2>

            {/* Template Presets */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block flex items-center gap-1.5">
                <Lightbulb size={12} /> High-converting templates (click to use)
              </label>
              <div className="space-y-2">
                {TEMPLATE_PRESETS.map((preset, i) => (
                  <button
                    key={i}
                    onClick={() => setTemplate(preset.text)}
                    className={`w-full text-left p-3 rounded-lg border transition-all text-xs ${
                      template === preset.text
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-border bg-muted/30 hover:border-primary/20 hover:bg-muted/50'
                    }`}
                  >
                    <div className="font-medium text-foreground mb-1">{preset.label}</div>
                    <div className="text-muted-foreground leading-relaxed">{preset.text}</div>
                    <div className="text-[10px] text-primary/70 mt-1.5 italic">💡 {preset.tip}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-1 mb-2">
              {VARIABLES.map(v => (
                <button
                  key={v}
                  onClick={() => setTemplate(t => t + ' ' + v)}
                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                >
                  {v}
                </button>
              ))}
            </div>

            <Textarea
              value={template}
              onChange={e => setTemplate(e.target.value)}
              rows={4}
              className="text-sm font-mono"
              placeholder="Hej {name}! ..."
            />

            <div className="bg-muted/50 border border-border rounded-md p-3">
              <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Preview</p>
              <p className="text-sm text-foreground">{renderTemplate(template, sampleLead)}</p>
            </div>

            <p className="text-xs text-muted-foreground">{template.length} chars · {Math.ceil(template.length / 160)} SMS segment(s) · est. ${(Math.ceil(template.length / 160) * 0.065).toFixed(3)}/msg</p>

            {/* Reply rate tips */}
            <div className="bg-primary/5 border border-primary/15 rounded-lg p-3 space-y-1.5">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Lightbulb size={12} className="text-primary" /> Tips to increase reply rates</p>
              <ul className="text-[11px] text-muted-foreground space-y-1 list-disc pl-4">
                <li><strong>Ask a question</strong> — questions get 2-3x more replies than statements</li>
                <li><strong>Keep it under 160 chars</strong> — 1 SMS segment = cheaper + higher read rate</li>
                <li><strong>Use their name + category</strong> — personalization feels less spammy</li>
                <li><strong>End with a clear CTA</strong> — "Svara JA" is better than "kontakta oss"</li>
                <li><strong>Add your real name</strong> — "/Marcus" at the end builds trust</li>
                <li><strong>Send between 10-14</strong> — business owners check phones at lunch</li>
                <li><strong>Mention a specific benefit</strong> — "synas bättre på Google" beats "växa"</li>
              </ul>
            </div>
          </div>
        )}

        {/* Step 3: Controls */}
        {step === 3 && (
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <h2 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Shield size={15} /> Cost & Safety Controls
              <InfoTip text="Set limits to control spend and avoid spamming." />
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Daily Cap <InfoTip text="Max messages per day" /></label>
                <Input type="number" min="1" value={dailyCap} onChange={e => setDailyCap(Number(e.target.value))} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Batch Cap <InfoTip text="Total target for campaign" /></label>
                <Input type="number" min="1" value={batchCap} onChange={e => setBatchCap(Number(e.target.value))} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Call After Hours <InfoTip text="Hours to wait before marking for call" /></label>
                <Input type="number" min="1" value={callAfterHours} onChange={e => setCallAfterHours(Number(e.target.value))} className="h-8 text-sm" />
              </div>
            </div>

            {/* Cost estimate */}
            <div className="bg-muted/50 border border-border rounded-lg p-3">
              <p className="text-xs font-semibold text-foreground mb-1">Estimated Campaign Cost</p>
              <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                <div>
                  <span className="block text-foreground font-medium">${estCost.toFixed(2)}</span>
                  <span>Total ({batchCap} SMS)</span>
                </div>
                <div>
                  <span className="block text-foreground font-medium">${(dailyCap * 0.065).toFixed(2)}</span>
                  <span>Per day ({dailyCap}/day)</span>
                </div>
                <div>
                  <span className="block text-foreground font-medium">{Math.ceil(batchCap / dailyCap)}</span>
                  <span>Days to complete</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-6 mb-10">
          <Button variant="outline" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1} className="h-8 text-sm gap-1">
            <ChevronLeft size={14} /> Back
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep(s => s + 1)} className="h-8 text-sm gap-1">
              Next <ChevronRight size={14} />
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={saving} className="h-8 text-sm gap-1">
              {saving ? 'Creating...' : 'Create Campaign'}
            </Button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
