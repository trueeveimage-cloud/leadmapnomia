import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createCampaign, countEligibleLeadsDetailed, AudienceFilter, EligibilityBreakdown, renderTemplate } from '@/lib/campaigns';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Users, MessageSquare, Shield, Megaphone, Zap } from 'lucide-react';
import { toast } from 'sonner';
import InfoTip from '@/components/InfoTip';

const SECTIONS = [
  { value: 'phone', label: 'Has Phone' },
  { value: 'email', label: 'Has Email' },
  { value: 'both', label: 'Both' },
  { value: 'unsorted', label: 'Unsorted' },
];

const VARIABLES = ['{name}', '{category}', '{city}', '{rating}'];

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
                  {estimate.wrongSection > 0 && <p>✗ {estimate.wrongSection} — wrong section</p>}
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

            <p className="text-xs text-muted-foreground">{template.length} chars · {Math.ceil(template.length / 160)} SMS segment(s)</p>
          </div>
        )}

        {/* Step 3: Controls */}
        {step === 3 && (
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <h2 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Shield size={15} /> Cost & Safety Controls
              <InfoTip text="Set limits to control spend and avoid spamming. Call-after-hours triggers follow-up calls for non-responders." />
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Daily Cap <InfoTip text="Max messages per day" /></label>
                <Input type="number" min="1" value={dailyCap} onChange={e => setDailyCap(Number(e.target.value))} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Batch Cap <InfoTip text="Max messages per send batch" /></label>
                <Input type="number" min="1" value={batchCap} onChange={e => setBatchCap(Number(e.target.value))} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Call After Hours <InfoTip text="Hours to wait for reply before marking for call" /></label>
                <Input type="number" min="1" value={callAfterHours} onChange={e => setCallAfterHours(Number(e.target.value))} className="h-8 text-sm" />
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
