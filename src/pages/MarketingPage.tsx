import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  ArrowRight,
  Check,
  ChevronRight,
  MailCheck,
  MapPin,
  Menu,
  PhoneCall,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getMarketingAttribution, submitMarketingLead, type MarketingAttribution } from "@/lib/marketingSubmissions";

const niches = {
  vvs: {
    label: "VVS",
    slug: "vvs",
    h1: "AI-telefonist för VVS i {city}",
    pain: "Akuta vattenläckor och stopp i avlopp väntar sällan. När ni står ute på jobb ringer kunden ofta nästa firma direkt.",
    call: "Hej, det läcker under diskbänken och jag behöver hjälp snabbt.",
    response: "Leadmap svarar lugnt, tar namn, telefon, adress, problemet och hur brådskande det är.",
    roi: "1 akutjobb kan betala pilotmånaden.",
  },
  tandlakare: {
    label: "Tandläkare",
    slug: "tandlakare",
    h1: "AI-telefonist för tandläkare i {city}",
    pain: "När receptionen är upptagen blir nya patienter och återbud lätt liggande.",
    call: "Jag har tandvärk och undrar om ni har en tid snart.",
    response: "Leadmap samlar namn, nummer, besvär, önskad tid och markerar om ärendet är akut.",
    roi: "1-2 fyllda tider kan täcka kostnaden.",
  },
  bilverkstad: {
    label: "Bilverkstad",
    slug: "bilverkstad",
    h1: "AI-telefonist för bilverkstäder i {city}",
    pain: "Kunder som behöver felsökning, service eller däcktid går ofta vidare om ingen svarar.",
    call: "Bilen startar inte och jag behöver boka en tid.",
    response: "Leadmap tar registreringsnummer om kunden har det, problem, kontaktuppgifter och önskad tid.",
    roi: "1 extra bokning kan räcka.",
  },
  "elektriker-jour": {
    label: "Elektriker jour",
    slug: "elektriker-jour",
    h1: "AI-telefonist för elektriker jour i {city}",
    pain: "Jourkunder är högintenta. Missas samtalet kan jobbet försvinna på minuter.",
    call: "Halva huset är utan el och säkringarna går hela tiden.",
    response: "Leadmap tar namn, telefon, adress, problemet, risknivå och önskad tid.",
    roi: "Snabba samtal är högintenta och behöver fångas direkt.",
  },
};

const demoOptions = Object.values(niches);
const trustChips = [
  "Svensk AI-telefonist",
  "Från 2 900 kr/mån",
  "Setup ingår",
  "Ingen bindning första månaden",
  "Ni bekräftar själva varje bokning",
];

type PageMode = "home" | "audit" | "pricing" | "demo" | "niche";

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function Section({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cx("border-t border-white/10 px-4 py-16 sm:px-6 lg:px-8", className)}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

function MarketingButton({
  children,
  variant = "primary",
  onClick,
  href,
  testId,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary";
  onClick?: () => void;
  href?: string;
  testId?: string;
}) {
  const className =
    variant === "primary"
      ? "bg-white text-slate-950 hover:bg-white/90"
      : "border border-white/20 bg-white/5 text-white hover:bg-white/10";

  if (href) {
    return (
      <Button asChild className={cx("h-11 rounded-md px-5 text-sm font-semibold", className)} data-testid={testId}>
        <a href={href}>{children}</a>
      </Button>
    );
  }

  return (
    <Button onClick={onClick} className={cx("h-11 rounded-md px-5 text-sm font-semibold", className)} data-testid={testId}>
      {children}
    </Button>
  );
}

function Header({ onBook }: { onBook: () => void }) {
  const [open, setOpen] = useState(false);
  const nav = [
    ["Så fungerar det", "#sa-fungerar-det"],
    ["Exempel", "#demo"],
    ["Priser", "#priser"],
    ["Gratis audit", "#audit"],
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/88 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-semibold text-white">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-white text-sm font-black text-slate-950">L</span>
          <span>Leadmap</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
          {nav.map(([label, href]) => (
            <a key={href} href={href} className="hover:text-white">
              {label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Link to="/partners" className="text-sm text-slate-500 hover:text-slate-300">
            Partners
          </Link>
          <Button onClick={onBook} className="h-10 rounded-md bg-white px-4 font-semibold text-slate-950 hover:bg-white/90" data-testid="booking-open">
            Boka demo
          </Button>
        </div>
        <button className="rounded-md border border-white/15 p-2 text-white md:hidden" onClick={() => setOpen(!open)} aria-label="Meny">
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
      {open && (
        <div className="mx-auto grid max-w-6xl gap-2 pb-4 md:hidden">
          {nav.map(([label, href]) => (
            <a key={href} href={href} onClick={() => setOpen(false)} className="rounded-md px-3 py-2 text-sm text-slate-200 hover:bg-white/10">
              {label}
            </a>
          ))}
          <button onClick={onBook} className="rounded-md bg-white px-3 py-2 text-left text-sm font-semibold text-slate-950">
            Boka demo
          </button>
        </div>
      )}
    </header>
  );
}

function Hero({ onBook }: { onBook: () => void }) {
  return (
    <section className="px-4 pb-14 pt-12 sm:px-6 lg:px-8 lg:pb-20 lg:pt-16">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-sm text-emerald-100">
            <PhoneCall size={14} /> Byggt för svenska serviceföretag
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-normal text-white sm:text-5xl lg:text-6xl">
            Missade samtal blir tappade jobb. Leadmap svarar direkt.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
            När ni är upptagna, ute på jobb eller har stängt tar Leadmap samtalet, samlar kundens uppgifter och skickar en tydlig
            bokningsförfrågan till er.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <MarketingButton href="#demo" testId="hero-primary-cta">
              Hör hur Leadmap svarar <ArrowRight size={16} />
            </MarketingButton>
            <MarketingButton href="#audit" variant="secondary">
              Få gratis missade-samtal audit
            </MarketingButton>
          </div>
          <div className="mt-7 flex flex-wrap gap-2">
            {trustChips.map((chip) => (
              <span key={chip} className="rounded-md border border-white/12 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-200">
                {chip}
              </span>
            ))}
          </div>
        </div>
        <PhoneMockup onBook={onBook} />
      </div>
    </section>
  );
}

function PhoneMockup({ onBook }: { onBook: () => void }) {
  const steps = [
    ["Inkommande samtal", "Kund ringer när ni inte hinner svara"],
    ["AI ställer frågor", "Namn, nummer, ärende och önskad tid"],
    ["Info samlas", "Akutgrad och nästa steg blir tydliga"],
    ["Lead skickas", "Ägaren får bokningsförfrågan direkt"],
  ];

  return (
    <div className="rounded-lg border border-white/12 bg-slate-900 p-4 shadow-2xl shadow-black/40">
      <div className="rounded-md bg-slate-950 p-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Incoming call</div>
            <div className="mt-1 font-semibold text-white">Okänd kund · 21:18</div>
          </div>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-400 text-slate-950">
            <PhoneCall size={19} />
          </span>
        </div>
        <div className="mt-4 space-y-3">
          {steps.map(([title, body], index) => (
            <div key={title} className="grid grid-cols-[32px_1fr] gap-3 rounded-md border border-white/10 bg-white/[0.035] p-3">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-white text-sm font-bold text-slate-950">{index + 1}</span>
              <div>
                <div className="text-sm font-semibold text-white">{title}</div>
                <div className="text-sm text-slate-400">{body}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-md border border-emerald-300/20 bg-emerald-300/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
            <MailCheck size={16} /> Lead till ägare
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-300">Johan behöver akut hjälp med vattenläcka. Vill bli kontaktad så snart som möjligt.</p>
          <button onClick={onBook} className="mt-3 text-sm font-semibold text-white underline underline-offset-4">
            Boka demo av flödet
          </button>
        </div>
      </div>
    </div>
  );
}

function PainSection() {
  const missed = ["Ni är ute på jobb", "Kunden ringer", "Ingen svarar", "Kunden går till nästa företag"];
  const withLeadmap = ["Samtalet besvaras", "Kundinfo samlas", "Ni får tydligt lead", "Ni bekräftar själva"];
  const roi = [
    ["VVS", "1 akutjobb kan betala pilotmånaden"],
    ["Tandläkare", "1-2 fyllda tider kan täcka kostnaden"],
    ["Bilverkstad", "1 extra bokning kan räcka"],
    ["Bärgning/jour", "Snabba samtal är högintenta"],
  ];

  return (
    <Section id="sa-fungerar-det" className="bg-slate-900/55">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-200">Problemet</p>
          <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Ett missat samtal kan vara ett förlorat jobb.</h2>
          <p className="mt-4 text-slate-300">Leadmap fångar det första behovet när personalen gör annat, utan att ta bort kontrollen från er.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FlowCard title="Utan svar" items={missed} tone="rose" />
          <FlowCard title="Med Leadmap" items={withLeadmap} tone="emerald" />
          <div className="md:col-span-2 grid gap-3 sm:grid-cols-2">
            {roi.map(([title, text]) => (
              <div key={title} className="rounded-md border border-white/10 bg-white/[0.035] p-4">
                <div className="font-semibold text-white">{title}</div>
                <div className="mt-1 text-sm text-slate-300">{text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

function FlowCard({ title, items, tone }: { title: string; items: string[]; tone: "rose" | "emerald" }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950 p-5">
      <h3 className={cx("font-semibold", tone === "rose" ? "text-rose-200" : "text-emerald-200")}>{title}</h3>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item} className="flex items-center gap-3 text-sm text-slate-300">
            <span className={cx("h-2 w-2 rounded-full", tone === "rose" ? "bg-rose-300" : "bg-emerald-300")} />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function DemoSection() {
  const [active, setActive] = useState(demoOptions[0]);

  return (
    <Section id="demo">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200">Ärlig sample call</p>
        <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Så här låter ett missat samtal med Leadmap</h2>
        <p className="mt-4 text-slate-300">Exemplen nedan är sample calls för att visa flödet. De är inte riktiga kundsamtal.</p>
      </div>
      <div className="mt-8 flex flex-wrap gap-2">
        {demoOptions.map((option) => (
          <button
            key={option.slug}
            onClick={() => setActive(option)}
            className={cx(
              "rounded-md border px-4 py-2 text-sm font-semibold",
              active.slug === option.slug ? "border-white bg-white text-slate-950" : "border-white/15 bg-white/[0.04] text-slate-300",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_0.95fr]">
        <div className="rounded-lg border border-white/10 bg-slate-900 p-5">
          <h3 className="font-semibold text-white">Sample call transcript</h3>
          <div className="mt-4 space-y-3 text-sm leading-6">
            <Message who="Kund">{active.call}</Message>
            <Message who="Leadmap">Hej, jag hjälper företaget att ta emot ärendet. Vad heter du?</Message>
            <Message who="Kund">Johan Andersson.</Message>
            <Message who="Leadmap">{active.response}</Message>
            <Message who="Leadmap">Tack. Jag skickar detta till ägaren så att de kan återkomma och bekräfta.</Message>
          </div>
        </div>
        <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-5">
          <h3 className="flex items-center gap-2 font-semibold text-emerald-100">
            <Send size={17} /> Lead summary sent to owner
          </h3>
          <dl className="mt-4 grid gap-3 text-sm">
            <SummaryRow label="Namn" value="Johan Andersson" />
            <SummaryRow label="Telefon" value="07X XXX XX XX" />
            <SummaryRow label="Ärende" value={active.slug === "vvs" ? "Akut vattenläcka under diskbänk" : active.call} />
            <SummaryRow label="Önskad tid" value="Så snart som möjligt" />
            <SummaryRow label="Status" value="Skickad till ägaren" />
          </dl>
          <a href="#audit" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white underline underline-offset-4">
            Vill du se detta för ditt företag? <ChevronRight size={15} />
          </a>
        </div>
      </div>
    </Section>
  );
}

function Message({ who, children }: { who: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{who}</div>
      <div className="mt-1 text-slate-200">{children}</div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-3 border-b border-white/10 pb-2 last:border-b-0">
      <dt className="text-slate-400">{label}:</dt>
      <dd className="font-medium text-white">{value}</dd>
    </div>
  );
}

function PricingSection({ onBook }: { onBook: () => void }) {
  return (
    <Section id="priser" className="bg-slate-900/55">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-200">Priser</p>
          <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Starta utan bindning första månaden</h2>
        </div>
        <p className="max-w-xl text-slate-300">Ni bekräftar alltid själva kunden. Leadmap skickar kvalificerade bokningsförfrågningar.</p>
      </div>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <PriceCard
          title="Pilot"
          price="från 2 900 kr/mån"
          items={[
            "AI svarar när ni inte hinner",
            "Samlar namn, nummer, ärende och önskad tid",
            "Skickar tydlig bokningsförfrågan",
            "Setup ingår för första kunder",
            "Ingen bindning första månaden",
          ]}
          cta="Få gratis audit"
          href="#audit"
        />
        <PriceCard
          title="Pro"
          price="4 900 kr/mån"
          items={["Allt i Pilot", "Mer anpassade samtalsflöden", "Passar jour/kliniker/högre volym", "Prioriterad setup/support"]}
          cta="Boka demo"
          onClick={onBook}
          featured
        />
      </div>
      <div className="mt-5 rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-200">
        Testa första månaden utan bindning. Setup ingår för första kunder.
      </div>
    </Section>
  );
}

function PriceCard({
  title,
  price,
  items,
  cta,
  href,
  onClick,
  featured,
}: {
  title: string;
  price: string;
  items: string[];
  cta: string;
  href?: string;
  onClick?: () => void;
  featured?: boolean;
}) {
  return (
    <div className={cx("rounded-lg border p-6", featured ? "border-white/25 bg-white/[0.075]" : "border-white/10 bg-slate-950")}>
      <div className="text-lg font-semibold text-white">{title}</div>
      <div className="mt-2 text-3xl font-semibold text-white">{price}</div>
      <ul className="mt-6 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm text-slate-300">
            <Check size={16} className="mt-0.5 shrink-0 text-emerald-300" />
            {item}
          </li>
        ))}
      </ul>
      <MarketingButton href={href} onClick={onClick} variant={featured ? "primary" : "secondary"} testId="pricing-cta">
        {cta}
      </MarketingButton>
    </div>
  );
}

function AuditSection({ mode, attribution }: { mode: PageMode; attribution?: Partial<MarketingAttribution> }) {
  return (
    <Section id="audit">
      <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-200">Gratis audit</p>
          <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Få gratis audit</h2>
          <p className="mt-4 text-slate-300">Vi kollar ert företag och skickar en kort demo eller förslag på hur Leadmap skulle svara åt er.</p>
          <div className="mt-6 grid gap-3 text-sm text-slate-200">
            {["Tar under 45 sekunder", "Ingen bindning", "Ingen spam", "Vi skickar en kort demo/förslag"].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <ShieldCheck size={17} className="text-emerald-300" /> {item}
              </div>
            ))}
          </div>
        </div>
        <AuditForm pageType={mode} attribution={attribution} />
      </div>
    </Section>
  );
}

function AuditForm({ pageType, attribution }: { pageType: PageMode; attribution?: Partial<MarketingAttribution> }) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    industry: attribution?.niche || "",
    city: attribution?.city || "",
    phoneOrEmail: "",
    website: "",
    missedCalls: "",
    preferredContact: "SMS",
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step === 1) {
      setStep(2);
      return;
    }
    setSubmitting(true);
    try {
      await submitMarketingLead({
        intent: "audit",
        ...form,
        attribution: getMarketingAttribution({ page_type: pageType, cta_variant: "audit_form", ...attribution }),
      });
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 p-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-emerald-300 text-slate-950">
          <Check size={20} />
        </div>
        <h3 className="mt-4 text-xl font-semibold text-white">Tack - vi kollar på ert företag och skickar en kort demo/förslag.</h3>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-white/10 bg-slate-900 p-5" data-testid="audit-form">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="font-semibold text-white">Steg {step} av 2</h3>
        <span className="text-sm text-slate-400">{step === 1 ? "Kontakt" : "Samtalsläge"}</span>
      </div>
      {step === 1 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Företagsnamn">
            <Input required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="bg-slate-950" />
          </Field>
          <Field label="Bransch">
            <Input required value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="bg-slate-950" />
          </Field>
          <Field label="Stad">
            <Input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="bg-slate-950" />
          </Field>
          <Field label="Telefon eller e-post">
            <Input required value={form.phoneOrEmail} onChange={(e) => setForm({ ...form, phoneOrEmail: e.target.value })} className="bg-slate-950" />
          </Field>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Webbplats">
            <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="bg-slate-950" />
          </Field>
          <Field label="Missade samtal per vecka">
            <Input value={form.missedCalls} onChange={(e) => setForm({ ...form, missedCalls: e.target.value })} className="bg-slate-950" />
          </Field>
          <Field label="Föredragen kontakt">
            <Select value={form.preferredContact} onValueChange={(value) => setForm({ ...form, preferredContact: value })}>
              <SelectTrigger className="bg-slate-950">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SMS">SMS</SelectItem>
                <SelectItem value="E-post">E-post</SelectItem>
                <SelectItem value="Samtal">Samtal</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}
      <div className="mt-5 flex gap-3">
        {step === 2 && (
          <Button type="button" variant="ghost" onClick={() => setStep(1)}>
            Tillbaka
          </Button>
        )}
        <Button type="submit" className="bg-white text-slate-950 hover:bg-white/90" disabled={submitting}>
          {step === 1 ? "Nästa" : submitting ? "Skickar..." : "Få gratis audit"}
        </Button>
      </div>
    </form>
  );
}

function BookingDialog({ open, onOpenChange, attribution }: { open: boolean; onOpenChange: (open: boolean) => void; attribution?: Partial<MarketingAttribution> }) {
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ companyName: "", industry: "", city: "", phoneOrEmail: "", email: "", website: "", notes: "" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await submitMarketingLead({
        intent: "demo",
        ...form,
        missedCalls: form.notes,
        preferredContact: "Samtal",
        attribution: getMarketingAttribution({ page_type: "booking", cta_variant: "booking_dialog", ...attribution }),
      });
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-slate-950 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Boka 10 min demo</DialogTitle>
        </DialogHeader>
        {done ? (
          <div className="rounded-md border border-emerald-300/20 bg-emerald-300/10 p-4 text-emerald-50">
            Tack - vi kollar på ert företag och återkommer med en kort demo/förslag.
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <Field label="Företagsnamn">
              <Input required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bransch">
                <Input required value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
              </Field>
              <Field label="Stad">
                <Input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Telefon">
                <Input required value={form.phoneOrEmail} onChange={(e) => setForm({ ...form, phoneOrEmail: e.target.value })} />
              </Field>
              <Field label="E-post (valfritt)">
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
            </div>
            <Field label="Webbplats">
              <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </Field>
            <Field label="Kort om ert samtalsläge">
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-20" />
            </Field>
            <Button className="bg-white text-slate-950 hover:bg-white/90" disabled={submitting}>
              {submitting ? "Skickar..." : "Boka demo"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label className="text-sm text-slate-300">{label}</Label>
      {children}
    </div>
  );
}

function FAQSection() {
  const items = [
    ["Är det riktiga bokningar?", "Leadmap skickar kvalificerade bokningsförfrågningar. Ni bekräftar själva."],
    ["Måste vi byta telefonnummer?", "Nej, setup kan anpassas efter ert nuvarande flöde."],
    ["Låter det som en robot?", "Samtalet byggs kort, lugnt och naturligt på svenska."],
    ["Vad händer om kunden frågar något svårt?", "Leadmap samlar information och skickar vidare till er."],
    ["Kan vi avsluta?", "Ja, ingen bindning första månaden."],
    ["Fungerar det när vi har stängt?", "Ja, Leadmap kan svara även utanför öppettider."],
  ];

  return (
    <Section id="faq">
      <h2 className="text-3xl font-semibold text-white sm:text-4xl">Vanliga frågor</h2>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {items.map(([q, a]) => (
          <div key={q} className="rounded-md border border-white/10 bg-white/[0.035] p-5">
            <h3 className="font-semibold text-white">{q}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">{a}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function FounderTrust() {
  return (
    <Section className="bg-slate-900/55">
      <div className="grid gap-8 md:grid-cols-[0.8fr_1.2fr] md:items-center">
        <div className="rounded-lg border border-white/10 bg-slate-950 p-6">
          <div className="grid h-14 w-14 place-items-center rounded-md bg-white text-xl font-black text-slate-950">M</div>
          <h2 className="mt-5 text-2xl font-semibold text-white">Byggt av Maged i Göteborg för svenska serviceföretag som tappar kunder på missade samtal.</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {["Göteborg, Sverige", "Svensk setup", "Personlig onboarding", "Första kunder får setup inkluderad"].map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-md border border-white/10 bg-white/[0.035] p-4 text-slate-200">
              <MapPin size={17} className="text-cyan-200" /> {item}
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function FinalCTA({ onBook }: { onBook: () => void }) {
  return (
    <Section className="bg-white text-slate-950">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
        <div>
          <h2 className="text-3xl font-semibold sm:text-4xl">Vill du se hur Leadmap skulle svara åt ditt företag?</h2>
          <p className="mt-3 text-slate-600">Ingen bindning. Setup ingår för första kunder.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild className="bg-slate-950 text-white hover:bg-slate-800">
            <a href="#audit">Få gratis audit</a>
          </Button>
          <Button onClick={onBook} variant="outline" className="border-slate-300 text-slate-950">
            Boka 10 min demo
          </Button>
        </div>
      </div>
    </Section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[1fr_1.2fr]">
        <div>
          <div className="font-semibold text-white">Leadmap</div>
          <p className="mt-2 text-sm text-slate-400">AI-telefonist för svenska serviceföretag.</p>
          <p className="mt-3 text-sm text-slate-500">Göteborg, Sverige</p>
          <a href="mailto:hello@leadmap.se" className="mt-1 block text-sm text-slate-400 hover:text-white">
            hello@leadmap.se
          </a>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          <a href="#priser" className="text-slate-400 hover:text-white">Priser</a>
          <a href="#audit" className="text-slate-400 hover:text-white">Audit</a>
          <a href="#demo" className="text-slate-400 hover:text-white">Demo</a>
          <Link to="/partners" className="text-slate-400 hover:text-white">Partner</Link>
          <Link to="/privacy" className="text-slate-400 hover:text-white">Privacy</Link>
        </div>
      </div>
    </footer>
  );
}

function NichePageContent({ onBook }: { onBook: () => void }) {
  const params = useParams();
  const location = useLocation();
  const city = params.city ? params.city.charAt(0).toUpperCase() + params.city.slice(1) : "Göteborg";
  const pathSlug = location.pathname.split("/").filter(Boolean).at(-1) || "vvs";
  const niche = niches[(params.niche || pathSlug) as keyof typeof niches] || niches.vvs;
  const attribution = { page_type: params.city ? "city_page" : "niche_page", niche: niche.slug, city };

  useEffect(() => {
    document.title = `${niche.h1.replace("{city}", city)} | Leadmap`;
  }, [city, niche]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: niche.h1.replace("{city}", city),
    areaServed: city,
    provider: { "@type": "Organization", name: "Leadmap" },
  };

  return (
    <>
      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <Link to="/" className="hover:text-white">Leadmap</Link>
            <ChevronRight size={14} />
            <span>{city}</span>
            <ChevronRight size={14} />
            <span>{niche.label}</span>
          </div>
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-center">
            <div>
              <h1 className="text-4xl font-semibold text-white sm:text-5xl">{niche.h1.replace("{city}", city)}</h1>
              <p className="mt-5 text-lg leading-8 text-slate-300">{niche.pain}</p>
              <p className="mt-4 text-slate-300">Från 2 900 kr/mån. Setup ingår för första kunder. Ingen bindning första månaden.</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <MarketingButton href="#audit">Få gratis audit</MarketingButton>
                <MarketingButton onClick={onBook} variant="secondary">Boka 10 min demo</MarketingButton>
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-900 p-5">
              <h2 className="font-semibold text-white">Exempelscenario</h2>
              <Message who="Missat samtal">{niche.call}</Message>
              <Message who="AI-svar">{niche.response}</Message>
              <div className="mt-4 rounded-md border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm text-slate-200">
                Ägaren får: namn, telefon, ärende, önskad tid och tydlig status.
              </div>
              <div className="mt-3 text-sm font-semibold text-amber-100">{niche.roi}</div>
            </div>
          </div>
        </div>
      </section>
      <DemoSection />
      <PricingSection onBook={onBook} />
      <FAQSection />
      <AuditSection mode="niche" attribution={attribution} />
      <Section>
        <h2 className="text-2xl font-semibold text-white">Relaterade sidor</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {demoOptions.map((item) => (
            <Link key={item.slug} to={`/${item.slug}`} className="rounded-md border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">
              {item.label}
            </Link>
          ))}
          {["stockholm", "goteborg", "malmo"].map((relatedCity) => (
            <Link key={relatedCity} to={`/${relatedCity}/${niche.slug}`} className="rounded-md border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">
              {relatedCity.charAt(0).toUpperCase() + relatedCity.slice(1)} {niche.label}
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}

export default function MarketingPage({ mode = "home" }: { mode?: PageMode }) {
  const [bookingOpen, setBookingOpen] = useState(false);
  const attribution = useMemo(() => getMarketingAttribution({ page_type: mode, cta_variant: "page" }), [mode]);

  useEffect(() => {
    document.documentElement.dataset.product = "leadmap";
    document.title = "Leadmap - AI-telefonist för svenska serviceföretag";
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Header onBook={() => setBookingOpen(true)} />
      {mode === "niche" ? (
        <NichePageContent onBook={() => setBookingOpen(true)} />
      ) : (
        <>
          <Hero onBook={() => setBookingOpen(true)} />
          <DemoSection />
          <PainSection />
          <PricingSection onBook={() => setBookingOpen(true)} />
          <AuditSection mode={mode} />
          <FAQSection />
          <FounderTrust />
          <FinalCTA onBook={() => setBookingOpen(true)} />
        </>
      )}
      <Footer />
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-slate-950/95 p-3 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
          <Button asChild className="bg-white text-slate-950 hover:bg-white/90">
            <a href="#audit">Få gratis audit</a>
          </Button>
          <Button onClick={() => setBookingOpen(true)} variant="outline" className="border-white/20 bg-white/5 text-white">
            Boka demo
          </Button>
        </div>
      </div>
      <BookingDialog open={bookingOpen} onOpenChange={setBookingOpen} attribution={attribution} />
    </div>
  );
}
