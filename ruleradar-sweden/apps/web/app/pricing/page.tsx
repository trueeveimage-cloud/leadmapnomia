import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, CreditCard, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Priser",
  description: "Tydliga månadspriser för RuleRadar: Solo, Team och Flera kontor. Prova kostnadsfritt i 14 dagar."
};

const plans = [
  {
    id: "solo",
    name: "Solo",
    price: "399 kr",
    note: "För dig som själv ansvarar för regelbevakningen.",
    seats: "1 användare",
    alerts: "E-post + daglig sammanställning",
    review: "Personlig granskningskö",
    sources: "Standardpaket med källor",
    support: "Support via e-post"
  },
  {
    id: "team",
    name: "Team",
    price: "799 kr",
    note: "För löne- eller redovisningsteam som granskar tillsammans.",
    seats: "Upp till 5 användare",
    alerts: "Omedelbara alertar + sammanställning",
    review: "Gemensam status och kvittens",
    sources: "Standardpaket med källor",
    support: "Prioriterad betasupport",
    recommended: true
  },
  {
    id: "multi_office",
    name: "Flera kontor",
    price: "1 499 kr",
    note: "För byråer som fördelar granskningen mellan kontor.",
    seats: "Upp till 15 användare",
    alerts: "Omedelbara alertar + sammanställning",
    review: "Prioriterad granskningskö",
    sources: "Utökade källönskemål",
    support: "Prioriterad betasupport"
  }
];

const rows = [
  ["Användare", "seats"],
  ["Alertleverans", "alerts"],
  ["Granskningsflöde", "review"],
  ["Källtäckning", "sources"],
  ["Support", "support"]
] as const;

export default async function PricingPage({ searchParams }: { searchParams?: Promise<{ checkout?: string }> }) {
  const params = await searchParams;
  return (
    <main className="inner-page pricing-page">
      <section className="page-hero pricing-hero reveal">
        <div>
          <div className="kicker">Enkel månadsprissättning</div>
          <h1>Välj hur många som ska hinna se ändringen.</h1>
          <p className="hero-lead">Alla planer börjar med 14 kostnadsfria dagar. Kort registreras i Stripe och första debiteringen sker efter provperioden om ni väljer att fortsätta.</p>
          {params?.checkout === "cancelled" ? <p className="form-error">Kassan stängdes utan köp. Inget har debiterats och er arbetsyta finns kvar.</p> : null}
        </div>
        <aside className="summary-panel pricing-assurance">
          <ShieldCheck size={24} />
          <strong>14 dagar</strong>
          <span>Kostnadsfri provperiod</span>
          <p>Ingen bindningstid. Byt betalningsmetod eller avsluta själv i Stripes kundportal.</p>
        </aside>
      </section>

      <section className="pricing-matrix stagger" aria-label="Jämförelse av RuleRadars prisplaner">
        <div className="matrix-header matrix-row">
          <div>Plan</div>
          {plans.map((plan) => (
            <article className={plan.recommended ? "recommended" : ""} key={plan.id}>
              {plan.recommended ? <span className="plan-label">Mest vald</span> : null}
              <h2>{plan.name}</h2>
              <strong>{plan.price}</strong>
              <p>per månad, exkl. moms</p>
              <small>{plan.note}</small>
              <Link className={`button ${plan.recommended ? "primary" : "secondary"}`} href={`/signup?plan=${plan.id}`}>Prova gratis <ArrowRight size={16} /></Link>
            </article>
          ))}
        </div>
        {rows.map(([label, key]) => (
          <div className="matrix-row" key={key}>
            <div className="matrix-label">{label}</div>
            {plans.map((plan) => <div data-label={plan.name} key={`${plan.id}-${key}`}><Check size={14} className="matrix-check" /> {plan[key]}</div>)}
          </div>
        ))}
      </section>

      <section className="pricing-details stagger">
        <article><CreditCard size={21} /><div><h3>Säker betalning</h3><p>Betalningsuppgifter hanteras av Stripe. RuleRadar lagrar inte kortnummer.</p></div></article>
        <article><ShieldCheck size={21} /><div><h3>Kontroll före utskick</h3><p>Alertar med hög påverkan eller låg säkerhet kan kräva mänskligt godkännande.</p></div></article>
        <article><Check size={21} /><div><h3>Ingen inlåsning</h3><p>Avsluta när ni vill. Tjänsten fortsätter till slutet av aktuell period.</p></div></article>
      </section>

      <section className="note-band reveal">
        <div><h2>Osäker på planen?</h2><p>Börja med Team om flera personer delar ansvar för lönekörning eller kundkommunikation. Ni kan justera senare.</p></div>
        <Link className="button secondary" href="/contact">Prata med oss</Link>
      </section>
    </main>
  );
}
