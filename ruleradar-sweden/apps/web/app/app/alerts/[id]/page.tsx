import Link from "next/link";
import { notFound } from "next/navigation";
import { getAlertById } from "@ruleradar/db";
import { AppTabs, SeverityBadge } from "../../../ui";

export const dynamic = "force-dynamic";

export default async function AlertDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alert = await getAlertById(id);
  if (!alert) notFound();

  return (
    <main className="page">
      <AppTabs />
      <Link className="muted" href="/app">Back to alerts</Link>
      <h1>{alert.title}</h1>
      <div className="grid two">
        <section className="card">
          <h2>Summary</h2>
          <p>{alert.summary_plain_english}</p>
          <h3>Who is affected</h3>
          <p>{alert.who_is_affected}</p>
          <h3>Recommended action</h3>
          <p>{alert.recommended_action}</p>
          <SeverityBadge severity={alert.severity} />
        </section>
        <section className="card">
          <h2>Audit Trail</h2>
          <p><strong>Source:</strong> <a href={alert.source_url}>{alert.source_url}</a></p>
          <p><strong>Status:</strong> {alert.status}</p>
          <p><strong>Created:</strong> {new Date(alert.createdAt).toLocaleString("en-SE")}</p>
          <p><strong>Delivery:</strong> {alert.deliveryStatus || "not sent"}</p>
        </section>
      </div>
      <section className="card" style={{ marginTop: 18 }}>
        <h2>Changed excerpt</h2>
        <pre className="diff">{alert.evidence_excerpts.join("\n")}</pre>
      </section>
    </main>
  );
}
