import { Check, ExternalLink, X } from "lucide-react";
import { listReviewQueue } from "@ruleradar/db";
import { AppTabs, SeverityBadge } from "../../ui";
import { requireAdmin } from "../../auth";

export const dynamic = "force-dynamic";

export default async function ReviewQueuePage({ searchParams }: { searchParams?: Promise<{ reviewed?: string }> }) {
  const params = await searchParams;
  await requireAdmin("/admin/review");
  const queue = await listReviewQueue();

  return (
    <main className="page review-page">
      <AppTabs />
      <section className="console-hero"><div><div className="kicker">Mänsklig kontroll</div><h1>Granskningskö</h1><p className="lead">Godkänn endast när sammanfattning, påverkan och evidens stämmer med primärkällan.</p></div><span className="readiness-score">{queue.length} väntar</span></section>
      {params?.reviewed ? <p className="form-success">Beslutet är sparat. Ett godkännande försöker leverera alerten till aktiva abonnemang.</p> : null}
      <div className="review-list">
        {queue.map((summary) => (
          <article className="card review-card" key={summary.id}>
            <div className="review-card-head"><div><span className="eyebrow">{summary.source_name}</span><h2>{summary.title}</h2></div><SeverityBadge severity={summary.severity} /></div>
            <p>{summary.summary_plain_english}</p>
            <dl className="evidence-list"><div><dt>Vem berörs?</dt><dd>{summary.who_is_affected}</dd></div><div><dt>Rekommenderad åtgärd</dt><dd>{summary.recommended_action}</dd></div></dl>
            <pre className="diff">{summary.evidence_excerpts.join("\n")}</pre>
            <a className="source-link" href={summary.source_url} target="_blank" rel="noreferrer">Kontrollera primärkälla <ExternalLink size={13} /></a>
            <div className="review-actions">
              <form action={`/api/admin/review/${summary.id}`} method="post"><input type="hidden" name="decision" value="approved" /><label className="form-row">Granskningsanteckning<textarea className="input review-note" name="note" placeholder="Vad kontrollerades?" /></label><button className="button primary" type="submit"><Check size={16} /> Godkänn och leverera</button></form>
              <form action={`/api/admin/review/${summary.id}`} method="post"><input type="hidden" name="decision" value="suppressed" /><button className="button danger" type="submit"><X size={16} /> Undertryck</button></form>
            </div>
          </article>
        ))}
        {queue.length === 0 ? <article className="card empty-state"><span className="empty-icon"><Check size={20} /></span><h2>Kön är tom.</h2><p>Det finns inga ändringar som väntar på mänskligt beslut.</p></article> : null}
      </div>
    </main>
  );
}
