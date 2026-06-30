import Image from "next/image";
import Link from "next/link";
import { listAlerts, listSources } from "@ruleradar/db";
import { SeverityBadge } from "./ui";

export const dynamic = "force-dynamic";

const workflow = [
  ["01", "Monitor", "Track official pages from Skatteverket, Bolagsverket, Verksamt, Forsakringskassan, and other source families."],
  ["02", "Compare", "Store snapshots, isolate changed sections, and filter routine page noise from meaningful guidance changes."],
  ["03", "Review", "Route tax, filing, deadline, and low-confidence changes into a human approval path before customer delivery."],
  ["04", "Notify", "Send concise alerts with source links, evidence excerpts, impact, and the next action."]
];

const buyerPoints = [
  "Payroll consultants preparing employer declarations",
  "Accounting firms maintaining customer filing checklists",
  "Operators who need proof before forwarding compliance updates"
];

const productSignals = ["official source", "diff excerpt", "review state", "recommended action"];

export default async function HomePage() {
  const [alerts, sources] = await Promise.all([listAlerts(3), listSources()]);
  const featured = alerts[0]!;

  return (
    <main className="premium-page">
      <section className="premium-hero">
        <div className="hero-depth" aria-hidden="true">
          <div className="scan-grid"></div>
          <div className="scan-line"></div>
        </div>

        <div className="hero-shell">
          <div className="hero-copy reveal">
            <div className="kicker">RuleRadar Sweden</div>
            <h1>Premium source intelligence for Swedish payroll teams.</h1>
            <p className="hero-lead">
              Monitor official guidance, detect what changed, and turn source evidence into reviewable client alerts before the next payroll mistake lands on your desk.
            </p>
            <ul className="signal-list" aria-label="Who RuleRadar helps">
              {buyerPoints.map((point) => <li key={point}>{point}</li>)}
            </ul>
            <div className="actions">
              <Link className="button premium" href="/sample-alerts">Inspect evidence briefs</Link>
              <Link className="button ghost" href="/app">Open live demo</Link>
            </div>
          </div>

          <div className="radar-visual reveal" aria-label="Layered monitoring radar preview">
            <div className="radar-plane parallax-slow">
              <div className="radar-rings"></div>
              <div className="radar-sweep"></div>
              {sources.slice(0, 6).map((source, index) => (
                <div className={`source-node node-${index + 1}`} key={source.id}>
                  <span>{source.agency}</span>
                </div>
              ))}
            </div>
            <div className="floating-brief parallax-fast">
              <div className="brief-topline">
                <span>Live demo brief</span>
                <SeverityBadge severity={featured.severity} />
              </div>
              <h2>{featured.title}</h2>
              <p>{featured.summary_plain_english}</p>
              <div className="brief-meta">
                <span>{Math.round(featured.confidence * 100)}% confidence</span>
                <span>{featured.needs_human_review ? "human review" : "ready to send"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="hero-metrics stagger" aria-label="Demo scope">
          <div>
            <span><strong>{sources.length}</strong> source families</span>
            <small>Skatteverket, Verksamt, Bolagsverket, and more</small>
          </div>
          <div>
            <span><strong>{alerts.length}</strong> alert examples</span>
            <small>Fixture data for safe public review</small>
          </div>
          <div>
            <span><strong>0 kr</strong> to inspect demo</span>
            <small>No paid Render infrastructure enabled</small>
          </div>
        </div>
      </section>

      <section className="premium-section source-intel reveal">
        <div className="section-copy">
          <div className="kicker">Source coverage</div>
          <h2>Built around official pages, not recycled news.</h2>
          <p>RuleRadar is designed to watch primary Swedish source families and keep the evidence trail attached to every alert.</p>
        </div>

        <div className="source-board stagger">
          {sources.slice(0, 6).map((source) => (
            <article className="source-tile" key={source.id}>
              <div className="source-tile-head">
                <span>{source.priority}</span>
                <strong>{source.agency}</strong>
              </div>
              <h3>{source.name}</h3>
              <p>{source.topics.join(" / ")}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="premium-section anatomy-section">
        <div className="section-copy reveal">
          <div className="kicker">Alert anatomy</div>
          <h2>Every alert has a proof layer.</h2>
          <p>The premium experience should feel like an evidence console: clear impact, source URL, changed excerpt, review state, and action.</p>
        </div>

        <div className="anatomy-grid reveal">
          <article className="evidence-brief premium-glass">
            <div className="brief-topline">
              <span>{featured.source_name}</span>
              <SeverityBadge severity={featured.severity} />
            </div>
            <h3>{featured.title}</h3>
            <p>{featured.summary_plain_english}</p>
            <dl className="evidence-list">
              <div>
                <dt>Affected</dt>
                <dd>{featured.who_is_affected}</dd>
              </div>
              <div>
                <dt>Action</dt>
                <dd>{featured.recommended_action}</dd>
              </div>
            </dl>
          </article>
          <aside className="proof-rail">
            {productSignals.map((signal) => <span key={signal}>{signal}</span>)}
          </aside>
        </div>
      </section>

      <section className="premium-section workflow-section reveal">
        <div className="section-copy">
          <div className="kicker">Workflow</div>
          <h2>From source scan to reviewed client alert.</h2>
        </div>
        <div className="workflow-lanes stagger">
          {workflow.map(([step, title, body]) => (
            <article className="workflow-card" key={title}>
              <span>{step}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-showcase">
        <div className="dashboard-copy reveal">
          <div className="kicker">Demo dashboard</div>
          <h2>A compliance inbox with signal hierarchy.</h2>
          <p>The dashboard shows severity, review status, source name, and delivery state without burying the operator in a news feed.</p>
          <div className="actions">
            <Link className="button premium" href="/app">Open dashboard</Link>
            <Link className="button ghost dark" href="/sample-alerts">View evidence</Link>
          </div>
        </div>
        <div className="product-shot-frame reveal">
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

      <section className="premium-cta reveal">
        <div>
          <div className="kicker">Next step</div>
          <h2>Inspect the free demo before spending on infrastructure.</h2>
          <p>The live Render demo runs on sample data. Database persistence, scheduled scanning, email delivery, and Stripe checkout stay off until the product earns the spend.</p>
        </div>
        <Link className="button premium light" href="/pricing">See beta pricing</Link>
      </section>
    </main>
  );
}
