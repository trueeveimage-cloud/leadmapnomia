import Link from "next/link";
import Image from "next/image";
import { listAlerts, listSources } from "@ruleradar/db";
import { SeverityBadge } from "./ui";

export const dynamic = "force-dynamic";

const workflow = [
  ["Monitor", "Track official pages from Skatteverket, Bolagsverket, Verksamt, Forsakringskassan, and other source families."],
  ["Compare", "Store snapshots, identify changed sections, and separate meaningful guidance changes from ordinary page noise."],
  ["Review", "Flag tax, filing, deadline, and low-confidence changes for a human check before customer-facing alerts."],
  ["Notify", "Send concise email alerts with source links, excerpts, impact, and a recommended next action."]
];

const buyerPoints = [
  "Payroll consultants preparing employer declarations",
  "Accounting firms maintaining customer filing checklists",
  "Operators who need proof before forwarding compliance updates"
];

export default async function HomePage() {
  const [alerts, sources] = await Promise.all([listAlerts(3), listSources()]);
  const featured = alerts[0]!;

  return (
    <main className="page">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">Official-source monitoring for Swedish payroll teams</div>
          <h1>Know what changed before your clients ask.</h1>
          <p className="lead">
            RuleRadar watches the Swedish government pages accounting and payroll firms already rely on, then turns source changes into short, reviewable alerts with evidence and next steps.
          </p>
          <ul className="check-list" aria-label="Who RuleRadar helps">
            {buyerPoints.map((point) => <li key={point}>{point}</li>)}
          </ul>
          <div className="actions">
            <Link className="button" href="/sample-alerts">View sample alerts</Link>
            <Link className="button secondary" href="/app">Open demo dashboard</Link>
          </div>
          <div className="stat-strip" aria-label="Demo scope">
            <span><strong>{sources.length}</strong> source families</span>
            <span><strong>{alerts.length}</strong> alert examples</span>
            <span><strong>0 kr</strong> to inspect demo</span>
          </div>
        </div>
        <aside className="alert-preview" aria-label="Latest sample alert">
          <div className="alert-window">
            <div className="window-bar">
              <span></span><span></span><span></span>
            </div>
            <div className="eyebrow">Latest sample alert</div>
            <h2>{featured.title}</h2>
            <p>{featured.summary_plain_english}</p>
            <dl className="mini-facts">
              <div>
                <dt>Affected</dt>
                <dd>{featured.who_is_affected}</dd>
              </div>
              <div>
                <dt>Next action</dt>
                <dd>{featured.recommended_action}</dd>
              </div>
            </dl>
            <div className="inline-meta">
              <SeverityBadge severity={featured.severity} />
              <span>{Math.round(featured.confidence * 100)}% confidence</span>
              <span>{featured.needs_human_review ? "Review required" : "Ready to send"}</span>
            </div>
          </div>
        </aside>
      </section>

      <section className="section-band">
        <div className="section-heading">
          <div className="eyebrow">Workflow</div>
          <h2>From official page change to reviewed client alert</h2>
          <p className="muted">The MVP is built around evidence first: every alert should point back to the source page, changed excerpt, and review status.</p>
        </div>
        <div className="steps">
          {workflow.map(([title, body], index) => (
            <article className="step" key={title}>
              <div className="step-index">{index + 1}</div>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="split-section">
        <div>
          <div className="eyebrow">Demo dashboard</div>
          <h2>A compliance inbox, not another news feed</h2>
          <p className="lead compact">
            The dashboard groups source, severity, status, delivery state, and review flags so an operator can decide what needs action today.
          </p>
          <div className="actions">
            <Link className="button" href="/app">Open dashboard</Link>
            <Link className="button secondary" href="/sample-alerts">View sample alerts</Link>
          </div>
        </div>
        <div className="product-shot-frame">
          <Image
            src="/dashboard-demo.png"
            width={1280}
            height={820}
            alt="RuleRadar demo dashboard showing alert totals and source-change rows"
            className="product-shot"
            priority
          />
        </div>
      </section>

      <section className="section-band">
        <div className="section-heading">
          <div className="eyebrow">Source coverage</div>
          <h2>Default monitored sources</h2>
          <p className="muted">The free demo uses fixture data, but these are the source categories the paid beta is designed around.</p>
        </div>
        <div className="source-grid">
          {sources.slice(0, 6).map((source) => (
            <article className="source-card" key={source.id}>
              <div>
                <h3>{source.agency}</h3>
                <p>{source.name}</p>
              </div>
              <p className="muted">{source.topics.join(", ")}</p>
              <span className={`source-priority ${source.priority}`}>{source.priority}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="cta-band">
        <div>
          <div className="eyebrow">Next step</div>
          <h2>Use the demo to judge the workflow before paying for infrastructure.</h2>
          <p>The live Render demo runs on the free tier with sample data. Database persistence, scheduled scanning, email delivery, and Stripe checkout can be switched on later when the product is worth the spend.</p>
        </div>
        <Link className="button light" href="/pricing">See beta pricing</Link>
      </section>
    </main>
  );
}
