import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { CalendarDays, CheckCircle2, Clipboard, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

type GbpDraft = {
  id: string;
  week_start: string;
  scheduled_for: string;
  theme: string;
  title: string;
  body: string;
  cta: string;
  link: string;
  status: 'draft' | 'posted';
  posted_at: string | null;
  created_at: string;
  updated_at: string;
};

const SITE_URL = 'https://www.leadmap.se';
const THEMES = [
  {
    theme: 'missed_call_audit',
    title: 'Hur manga kunder tappar ni pa missade samtal?',
    body: 'Nar ni ar ute pa jobb, med kund eller har stangt kan ett missat samtal bli en tappad bokning. Leadmap svarar, tar namn, nummer, arende och onskad tid, och skickar en tydlig sammanfattning till agaren.',
    campaign: 'gbp_missed_call_audit',
  },
  {
    theme: 'vvs_jour',
    title: 'AI-telefonist for VVS och jour',
    body: 'Akuta kunder ringer ofta vidare direkt. Leadmap hjalper VVS- och jourforetag att fanga arendet medan kunden fortfarande vill ha hjalp.',
    campaign: 'gbp_vvs_jour',
  },
  {
    theme: 'busy_on_job',
    title: 'Nar ni ar ute pa jobb svarar Leadmap',
    body: 'Foretagare ska inte behova valja mellan att gora jobbet och svara i telefon. Leadmap tar forsta samtalet, kvalificerar behovet och skickar nasta steg.',
    campaign: 'gbp_busy_on_job',
  },
  {
    theme: 'free_audit',
    title: 'Fa en gratis missade-samtal audit',
    body: 'Vill du se hur Leadmap skulle svara at ditt foretag? Skicka foretagsnamn, bransch och stad sa tar vi fram en kort demo och konkret uppfoljning.',
    campaign: 'gbp_free_audit',
  },
  {
    theme: 'clinic_calls',
    title: 'Missade samtal blir tomma tider for kliniker',
    body: 'Nar receptionen ar upptagen kan Leadmap ta emot nya patient- och bokningsforfragningar och skicka dem till teamet for manuell bekraftelse.',
    campaign: 'gbp_clinic_calls',
  },
  {
    theme: 'fortyfive_seconds',
    title: 'Sa fungerar en AI-telefonist pa 45 sekunder',
    body: 'Leadmap svarar, staller ratt fragor, samlar kundens uppgifter och skickar en ren sammanfattning. Ni behaller kontrollen over sista bokningssteget.',
    campaign: 'gbp_45_second_demo',
  },
];

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay() || 7;
  next.setDate(next.getDate() - day + 1);
  next.setHours(0, 0, 0, 0);
  return next;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function auditLink(campaign: string) {
  const params = new URLSearchParams({
    utm_source: 'google_business_profile',
    utm_medium: 'organic_post',
    utm_campaign: campaign,
  });
  return `${SITE_URL}/missade-samtal-audit?${params.toString()}`;
}

function buildNextFourWeeks() {
  const firstWeek = startOfWeek(new Date());
  const rows: Omit<GbpDraft, 'id' | 'status' | 'posted_at' | 'created_at' | 'updated_at'>[] = [];
  for (let week = 0; week < 4; week += 1) {
    const weekStart = addDays(firstWeek, week * 7);
    const postDays = [1, 3, 5];
    postDays.forEach((dayOffset, index) => {
      const theme = THEMES[(week * 3 + index) % THEMES.length];
      rows.push({
        week_start: isoDate(weekStart),
        scheduled_for: isoDate(addDays(weekStart, dayOffset)),
        theme: theme.theme,
        title: theme.title,
        body: theme.body,
        cta: 'Fa gratis missade-samtal audit',
        link: auditLink(theme.campaign),
      });
    });
  }
  return rows;
}

export default function GBPContentLoopPage() {
  const [drafts, setDrafts] = useState<GbpDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const nextDraft = useMemo(
    () => drafts.find((draft) => draft.status === 'draft' && draft.scheduled_for >= isoDate(new Date())),
    [drafts],
  );
  const postedCount = drafts.filter((draft) => draft.status === 'posted').length;

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('gbp_post_drafts')
        .select('*')
        .order('scheduled_for', { ascending: false })
        .limit(60);
      if (error) throw error;
      setDrafts((data || []) as GbpDraft[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load GBP drafts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const generate = async () => {
    setGenerating(true);
    try {
      const rows = buildNextFourWeeks();
      const { error } = await (supabase as any)
        .from('gbp_post_drafts')
        .upsert(rows, { onConflict: 'scheduled_for,theme' });
      if (error) throw error;
      toast.success('Generated next 4 weeks of GBP drafts');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate posts');
    } finally {
      setGenerating(false);
    }
  };

  const updateDraft = async (draft: GbpDraft, updates: Partial<GbpDraft>) => {
    setSavingId(draft.id);
    try {
      const { error } = await (supabase as any)
        .from('gbp_post_drafts')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', draft.id);
      if (error) throw error;
      setDrafts((current) => current.map((item) => (item.id === draft.id ? { ...item, ...updates } : item)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update draft');
    } finally {
      setSavingId(null);
    }
  };

  const copyPost = async (draft: GbpDraft) => {
    const text = `${draft.title}\n\n${draft.body}\n\n${draft.cta}: ${draft.link}`;
    await navigator.clipboard.writeText(text);
    toast.success('Post copied');
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight">GBP Content Loop</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Free Google Business Profile post drafts for Leadmap. Manual by default: copy, edit if needed, post in GBP, then mark posted here.
            </p>
          </div>
          <Button onClick={generate} disabled={generating}>
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Generate next 4 weeks
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Metric label="Drafts loaded" value={drafts.length} />
          <Metric label="Marked posted" value={postedCount} />
          <Metric label="Next post" value={nextDraft ? nextDraft.scheduled_for : 'Generate drafts'} />
        </div>

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <h2 className="font-medium">Manual posting mode</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                No paid ads and no automatic Google posting is required. If Google Business Profile API credentials are added later, this table already stores the planned date, copy, CTA, UTM link and posted status needed for an integration.
              </p>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Loading drafts...</div>
        ) : drafts.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="font-medium">No GBP drafts yet</p>
            <p className="mt-2 text-sm text-muted-foreground">Generate the next 4 weeks to start the free content loop.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {drafts.map((draft) => (
              <article key={draft.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={draft.status === 'posted' ? 'default' : 'secondary'}>{draft.status}</Badge>
                      <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{draft.scheduled_for}</span>
                      <span className="text-xs text-muted-foreground">{draft.theme.replace(/_/g, ' ')}</span>
                    </div>
                    <Input
                      className="mt-3 max-w-2xl font-medium"
                      value={draft.title}
                      onChange={(event) => setDrafts((current) => current.map((item) => (item.id === draft.id ? { ...item, title: event.target.value } : item)))}
                      onBlur={(event) => updateDraft(draft, { title: event.target.value })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => copyPost(draft)}>
                      <Clipboard className="mr-2 h-4 w-4" />
                      Copy
                    </Button>
                    <Button
                      variant={draft.status === 'posted' ? 'secondary' : 'default'}
                      size="sm"
                      disabled={savingId === draft.id}
                      onClick={() =>
                        updateDraft(draft, {
                          status: draft.status === 'posted' ? 'draft' : 'posted',
                          posted_at: draft.status === 'posted' ? null : new Date().toISOString(),
                        })
                      }
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {draft.status === 'posted' ? 'Undo' : 'Mark posted'}
                    </Button>
                  </div>
                </div>

                <Textarea
                  className="mt-3 min-h-28"
                  value={draft.body}
                  onChange={(event) => setDrafts((current) => current.map((item) => (item.id === draft.id ? { ...item, body: event.target.value } : item)))}
                  onBlur={(event) => updateDraft(draft, { body: event.target.value })}
                />
                <div className="mt-3 grid gap-3 md:grid-cols-[0.6fr_1fr]">
                  <Input
                    value={draft.cta}
                    onChange={(event) => setDrafts((current) => current.map((item) => (item.id === draft.id ? { ...item, cta: event.target.value } : item)))}
                    onBlur={(event) => updateDraft(draft, { cta: event.target.value })}
                  />
                  <Input
                    value={draft.link}
                    onChange={(event) => setDrafts((current) => current.map((item) => (item.id === draft.id ? { ...item, link: event.target.value } : item)))}
                    onBlur={(event) => updateDraft(draft, { link: event.target.value })}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
