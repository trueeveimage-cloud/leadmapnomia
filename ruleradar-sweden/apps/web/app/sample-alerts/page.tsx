import Link from "next/link";
import { listAlerts } from "@ruleradar/db";
import { SeverityBadge } from "../ui";

export const dynamic = "force-dynamic";

export default async function SampleAlertsPage() {
  const alerts = await listAlerts(9);

  return (
    <main className="page">
      <section className="page-hero compact-hero">
        <div>
          <div className="eyebrow">Demo examples</div>
          <h1>Sample alerts that show the product shape.</h1>
          <p className="lead">These examples are illustrative for screenshots and demos. Production alerts are generated only from stored source snapshots and include the official source URL.</p>
        </div>
        <div className="summary-panel">
          <strong>{alerts.length}</strong>
          <span>alert examples</span>
          <p>Each one includes impact, action, review state, source URL, and evidence excerpt in the app view.</p>
        </div>
      </section>

      <section className="alert-list">
        {alerts.map((summary) => (
          <article className="alert-card" key={summary.id}>
            <div className="alert-card-main">
              <div className="eyebrow">{summary.agency}</div>
              <h2>{summary.title}</h2>
              <p>{summary.summary_plain_english}</p>
              <dl className="mini-facts">
                <div>
                  <dt>Who is affected</dt>
                  <dd>{summary.who_is_affected}</dd>
                </div>
                <div>
                  <dt>Recommended action</dt>
                  <dd>{summary.recommended_action}</dd>
                </div>
              </dl>
            </div>
            <aside className="alert-card-meta">
              <SeverityBadge severity={summary.severity} />
              <span>{summary.status.replace("_", " ")}</span>
              <span>{Math.round(summary.confidence * 100)}% confidence</span>
              <Link href={`/app/alerts/${summary.id}`}>Open evidence</Link>
            </aside>
          </article>
        ))}
      </section>
      <div className="actions">
        <Link className="button" href="/app">Open demo dashboard</Link>
        <Link className="button secondary" href="/pricing">See pricing</Link>
      </div>
    </main>
  );
}
