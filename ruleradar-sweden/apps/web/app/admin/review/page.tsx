import { listReviewQueue } from "@ruleradar/db";
import { AppTabs, SeverityBadge } from "../../ui";

export const dynamic = "force-dynamic";

export default async function ReviewQueuePage() {
  const queue = await listReviewQueue();

  return (
    <main className="page">
      <AppTabs />
      <h1>Review Queue</h1>
      <div className="grid">
        {queue.map((summary) => (
          <article className="card" key={summary.id}>
            <div className="eyebrow">{summary.source_name}</div>
            <h2>{summary.title}</h2>
            <p>{summary.summary_plain_english}</p>
            <pre className="diff">{summary.evidence_excerpts.join("\n")}</pre>
            <div className="actions">
              <form action={`/api/admin/review/${summary.id}`} method="post">
                <input type="hidden" name="decision" value="approved" />
                <button className="button" type="submit">Approve</button>
              </form>
              <form action={`/api/admin/review/${summary.id}`} method="post">
                <input type="hidden" name="decision" value="suppressed" />
                <button className="button secondary" type="submit">Suppress</button>
              </form>
              <SeverityBadge severity={summary.severity} />
            </div>
          </article>
        ))}
        {queue.length === 0 && (
          <article className="card">
            <h2>No review items</h2>
            <p className="muted">Run the worker or add sources to create reviewable detected changes.</p>
          </article>
        )}
      </div>
    </main>
  );
}
