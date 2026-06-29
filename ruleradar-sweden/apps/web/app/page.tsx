import Link from "next/link";
import { listAlerts, listSources } from "@ruleradar/db";
import { SeverityBadge } from "./ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [alerts, sources] = await Promise.all([listAlerts(3), listSources()]);
  const featured = alerts[0]!;

  return (
    <main className="page">
      <section className="hero">
        <div>
          <div className="eyebrow">Official-source monitoring for Swedish payroll teams</div>
          <h1>RuleRadar Sweden</h1>
          <p className="lead">
            We monitor the Swedish government pages accounting and payroll firms already rely on. When guidance, forms, fees, or filing workflows change, RuleRadar sends a short alert with the source link, changed excerpt, and next action.
          </p>
          <div className="actions">
            <Link className="button" href="/pricing">Start trial</Link>
            <Link className="button secondary" href="/sample-alerts">View sample alerts</Link>
          </div>
        </div>
        <div className="card">
          <div className="eyebrow">Latest example</div>
          <h2>{featured.title}</h2>
          <p>{featured.summary_plain_english}</p>
          <p className="muted">{featured.recommended_action}</p>
          <SeverityBadge severity={featured.severity} />
        </div>
      </section>

      <section>
        <h2>Default monitored sources</h2>
        <div className="grid">
          {sources.slice(0, 6).map((source) => (
            <article className="card" key={source.id}>
              <h3>{source.agency}</h3>
              <p>{source.name}</p>
              <p className="muted">{source.topics.join(", ")}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
