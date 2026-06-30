import Link from "next/link";
import { listAlerts } from "@ruleradar/db";
import { SeverityBadge } from "../ui";

export const dynamic = "force-dynamic";

export default async function SampleAlertsPage() {
  const alerts = await listAlerts(9);

  return (
    <main className="premium-page inner-page">
      <section className="premium-page-hero reveal">
        <div>
          <div className="kicker">Evidence briefs</div>
          <h1>Sample alerts with source, review, and action layers.</h1>
          <p className="hero-lead">These examples are illustrative for screenshots and demos. Production alerts are generated only from stored source snapshots and include the official source URL.</p>
        </div>
        <div className="summary-panel premium-glass">
          <strong>{alerts.length}</strong>
          <span>demo briefs</span>
          <p>Each one includes impact, action, review state, source URL, and evidence excerpt in the app view.</p>
        </div>
      </section>

      <section className="evidence-brief-list stagger">
        {alerts.map((summary) => (
          <article className="evidence-row" key={summary.id}>
            <div className="evidence-main">
              <div className="brief-topline">
                <span>{summary.agency}</span>
                <SeverityBadge severity={summary.severity} />
              </div>
              <h2>{summary.title}</h2>
              <p>{summary.summary_plain_english}</p>
              <dl className="evidence-list">
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
            <aside className="evidence-meta">
              <span>{summary.status.replace("_", " ")}</span>
              <span>{Math.round(summary.confidence * 100)}% confidence</span>
              <span>{summary.needs_human_review ? "manual review" : "ready path"}</span>
              <Link href={`/app/alerts/${summary.id}`}>Open evidence</Link>
            </aside>
          </article>
        ))}
      </section>
      <div className="actions">
        <Link className="button premium" href="/app">Open demo dashboard</Link>
        <Link className="button ghost dark" href="/pricing">See pricing</Link>
      </div>
    </main>
  );
}
