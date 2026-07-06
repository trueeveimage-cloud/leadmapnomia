import Link from "next/link";
import { notFound } from "next/navigation";
import { getAlertById } from "@ruleradar/db";
import { AppTabs, SeverityBadge } from "../../../ui";

export const dynamic = "force-dynamic";

export default async function AlertDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alert = await getAlertById(id);
  if (!alert) notFound();
  const sourceHost = safeHost(alert.source_url);

  return (
    <main className="page">
      <AppTabs />
      <Link className="back-link" href="/app">Back to alerts</Link>
      <div className="detail-heading">
        <div>
          <p className="eyebrow">{alert.source_name}</p>
          <h1>{alert.title}</h1>
        </div>
        <SeverityBadge severity={alert.severity} />
      </div>
      <div className="grid two detail-grid">
        <section className="card">
          <h2>Summary</h2>
          <p>{alert.summary_plain_english}</p>
          <h3>Who is affected</h3>
          <p>{alert.who_is_affected}</p>
          <h3>Recommended action</h3>
          <p>{alert.recommended_action}</p>
        </section>
        <section className="card">
          <h2>Audit Trail</h2>
          <dl className="meta-list">
            <div><dt>Source</dt><dd><a className="source-link" href={alert.source_url}>{sourceHost || "Open official source"}</a></dd></div>
            <div><dt>Status</dt><dd>{alert.status}</dd></div>
            <div><dt>Created</dt><dd>{new Date(alert.createdAt).toLocaleString("en-SE")}</dd></div>
            <div><dt>Delivery</dt><dd>{alert.deliveryStatus || "not sent"}</dd></div>
          </dl>
        </section>
      </div>
      <section className="card detail-excerpt">
        <h2>Changed excerpt</h2>
        <pre className="diff">{alert.evidence_excerpts.join("\n")}</pre>
      </section>
    </main>
  );
}

function safeHost(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
