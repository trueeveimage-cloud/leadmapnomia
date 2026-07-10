import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ExternalLink, FileCheck2 } from "lucide-react";
import { sampleSummaries } from "@ruleradar/db";
import { SeverityBadge } from "../ui";

export const metadata: Metadata = { title: "Exempelalert" };

export default function SampleAlertsPage() {
  return (
    <main className="inner-page">
      <section className="premium-page-hero reveal">
        <div>
          <div className="kicker">Produktbevis</div>
          <h1>Så ser en RuleRadar-alert ut.</h1>
          <p className="hero-lead">Exemplen nedan är illustrativa. Produktionsalertar skapas från lagrade källversioner och behåller länken till den officiella källan.</p>
        </div>
        <aside className="summary-panel"><FileCheck2 size={23} /><strong>{sampleSummaries.length}</strong><span>Exempelunderlag</span><p>Påverkan, rekommenderad åtgärd, säkerhet och evidens i samma vy.</p></aside>
      </section>

      <section className="evidence-brief-list stagger">
        {sampleSummaries.map((summary) => (
          <article className="evidence-row" key={summary.id}>
            <div className="evidence-main">
              <div className="brief-topline"><span className="eyebrow">{summary.agency}</span><SeverityBadge severity={summary.severity} /></div>
              <h2>{summary.title}</h2>
              <p>{summary.summary_plain_english}</p>
              <dl className="evidence-list">
                <div><dt>Vem berörs?</dt><dd>{summary.who_is_affected}</dd></div>
                <div><dt>Rekommenderad åtgärd</dt><dd>{summary.recommended_action}</dd></div>
                <div><dt>Evidensutdrag</dt><dd>{summary.evidence_excerpts[0]}</dd></div>
              </dl>
            </div>
            <aside className="evidence-meta">
              <span>{statusLabel(summary.status)}</span>
              <span>{Math.round(summary.confidence * 100)}% säkerhet</span>
              <span>{summary.needs_human_review ? "Mänsklig granskning" : "Automatisk väg"}</span>
              <a href={summary.source_url} target="_blank" rel="noreferrer">Officiell källa <ExternalLink size={13} /></a>
            </aside>
          </article>
        ))}
      </section>
      <div className="actions">
        <Link className="button primary button-large" href="/signup?plan=team">Starta gratis <ArrowRight size={18} /></Link>
        <Link className="button secondary button-large" href="/pricing">Se priser</Link>
      </div>
    </main>
  );
}

function statusLabel(status: string) {
  if (status === "review_required") return "Granskning krävs";
  if (status === "approved") return "Godkänd";
  if (status === "sent") return "Skickad";
  return status.replace(/_/g, " ");
}
