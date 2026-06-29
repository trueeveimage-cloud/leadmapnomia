import Link from "next/link";
import { listAlerts } from "@ruleradar/db";
import { SeverityBadge } from "../ui";

export const dynamic = "force-dynamic";

export default async function SampleAlertsPage() {
  const alerts = await listAlerts(9);

  return (
    <main className="page">
      <h1>Sample Alerts</h1>
      <p className="lead">Plausible examples for screenshots and demos. Production alerts are generated only from stored source snapshots and include the official source URL.</p>
      <div className="grid">
        {alerts.map((summary) => (
          <article className="card" key={summary.id}>
            <div className="eyebrow">{summary.agency}</div>
            <h2>{summary.title}</h2>
            <p>{summary.summary_plain_english}</p>
            <p className="muted">{summary.recommended_action}</p>
            <SeverityBadge severity={summary.severity} />
          </article>
        ))}
      </div>
      <div className="actions">
        <Link className="button" href="/pricing">Start trial</Link>
      </div>
    </main>
  );
}
