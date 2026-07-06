import Link from "next/link";

const plans = [
  {
    id: "solo",
    name: "Solo",
    price: "SEK 399",
    detail: "For one operator validating whether source-change alerts save enough admin time.",
    features: ["1 seat", "Email alerts", "Daily digest", "Standard source bundle"]
  },
  {
    id: "team",
    name: "Team",
    price: "SEK 799",
    detail: "For a payroll or accounting team that needs review ownership and faster alert handling.",
    features: ["5 seats", "Immediate alerts", "Acknowledgement tracking", "Review queue"]
  },
  {
    id: "multi_office",
    name: "Multi-office",
    price: "SEK 1,499",
    detail: "For firms splitting work across offices, client groups, or payroll specialties.",
    features: ["15 seats", "Org units", "Priority review queue", "Expanded source requests"]
  }
];

export default function PricingPage() {
  return (
    <main className="premium-page inner-page">
      <section className="premium-page-hero reveal">
        <div>
          <div className="kicker">Beta pricing</div>
          <h1>Upgrade only when the alert workflow proves useful.</h1>
          <p className="hero-lead">The current public demo is free to inspect. Paid plans are for the database-backed beta with real monitoring, scheduled scanning, and email delivery.</p>
        </div>
        <div className="summary-panel premium-glass">
          <strong>14 days</strong>
          <span>trial target</span>
          <p>Use the trial to measure whether alerts reduce manual checking and missed source changes.</p>
        </div>
      </section>

      <div className="premium-pricing-grid stagger">
        {plans.map((plan) => (
          <article className={`price-card ${plan.id === "team" ? "featured-plan" : ""}`} key={plan.id}>
            {plan.id === "team" ? <div className="plan-label">Suggested beta default</div> : null}
            <h2>{plan.name}</h2>
            <div className="metric">{plan.price}</div>
            <p className="muted">per month</p>
            <p>{plan.detail}</p>
            <ul className="feature-list">
              {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
            <form action={`/api/billing/checkout?plan=${plan.id}`} method="post">
              <button className="button premium" type="submit">Start 14-day trial</button>
            </form>
          </article>
        ))}
      </div>

      <section className="note-band reveal">
        <div>
          <h2>Keep SMS and paid infrastructure off until the beta earns it.</h2>
          <p>Alerts are informational and include official source links. RuleRadar is not legal advice software. The free demo uses fixture data; live monitoring requires paid hosting, a database, source scanning, and email configuration.</p>
        </div>
        <Link className="button ghost dark" href="/faq">Read FAQ</Link>
      </section>
    </main>
  );
}
