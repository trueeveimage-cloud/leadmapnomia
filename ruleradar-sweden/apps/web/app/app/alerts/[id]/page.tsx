import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileCheck2 } from "lucide-react";
import { getAlertById } from "@ruleradar/db";
import { AppTabs, SeverityBadge } from "../../../ui";
import { requireUser } from "../../../auth";

export const dynamic = "force-dynamic";

export default async function AlertDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireUser(`/app/alerts/${id}`);
  const alert = await getAlertById(id, session?.organizationId || undefined);
  if (!alert) notFound();

  return (
    <main className="page alert-detail-page">
      <AppTabs />
      <Link className="back-link" href="/app"><ArrowLeft size={14} /> Tillbaka till alertar</Link>
      <div className="detail-heading"><div><p className="eyebrow">{alert.source_name}</p><h1>{alert.title}</h1></div><SeverityBadge severity={alert.severity} /></div>
      <div className="grid two detail-grid">
        <section className="card"><h2>Bedömning</h2><p>{alert.summary_plain_english}</p><h3>Vem berörs?</h3><p>{alert.who_is_affected}</p><h3>Rekommenderad åtgärd</h3><p>{alert.recommended_action}</p></section>
        <section className="card"><h2>Revisionsspår</h2><dl className="meta-list"><div><dt>Källa</dt><dd><a className="source-link" href={alert.source_url} target="_blank" rel="noreferrer">{safeHost(alert.source_url) || "Öppna officiell källa"} <ExternalLink size={13} /></a></dd></div><div><dt>Status</dt><dd>{statusLabel(alert.status)}</dd></div><div><dt>Upptäckt</dt><dd>{new Date(alert.createdAt).toLocaleString("sv-SE")}</dd></div><div><dt>Leverans</dt><dd>{deliveryLabel(alert.deliveryStatus)}</dd></div><div><dt>Modellsäkerhet</dt><dd>{Math.round(alert.confidence * 100)}%</dd></div></dl></section>
      </div>
      <section className="card detail-excerpt"><div className="card-header"><div><h2>Ändringsutdrag</h2><p className="muted">Text som låg till grund för sammanfattningen.</p></div><FileCheck2 size={22} /></div><pre className="diff">{alert.evidence_excerpts.join("\n")}</pre></section>
    </main>
  );
}

function safeHost(value: string) { try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return ""; } }
function statusLabel(status: string) { return ({ review_required: "Granskning krävs", approved: "Godkänd", sent: "Skickad", suppressed: "Undertryckt", draft: "Utkast" } as Record<string, string>)[status] || status.replace(/_/g, " "); }
function deliveryLabel(status?: string) { return ({ sent: "Levererad", delivered: "Levererad", not_sent: "Inte skickad", queued: "Köad", failed: "Misslyckad" } as Record<string, string>)[status || ""] || status || "Inte skickad"; }
