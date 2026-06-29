import Link from "next/link";

const plans = [
  { id: "solo", name: "Solo", price: "SEK 399", detail: "1 seat, email alerts, daily digest, standard source bundle" },
  { id: "team", name: "Team", price: "SEK 799", detail: "5 seats, immediate alerts, acknowledgement tracking" },
  { id: "multi_office", name: "Multi-office", price: "SEK 1,499", detail: "15 seats, org units, priority review queue" }
];

export default function PricingPage() {
  return (
    <main className="page">
      <h1>Pricing</h1>
      <p className="lead">Launch pricing for Swedish accounting and payroll firms. SMS stays optional so the MVP remains email-first and cost controlled.</p>
      <div className="grid">
        {plans.map((plan) => (
          <article className="card" key={plan.id}>
            <h2>{plan.name}</h2>
            <div className="metric">{plan.price}</div>
            <p className="muted">per month</p>
            <p>{plan.detail}</p>
            <form action={`/api/billing/checkout?plan=${plan.id}`} method="post">
              <button className="button" type="submit">Start trial</button>
            </form>
          </article>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 18 }}>Alerts are informational and include official source links. RuleRadar is not legal advice software.</p>
      <Link className="button secondary" href="/faq">Read FAQ</Link>
    </main>
  );
}
