import Link from "next/link";
import { AlertTriangle, ArrowRight, Bell, CheckCircle2, Clock3, FileSearch, Settings } from "lucide-react";
import { getSubscriptionForOrganization, listAlerts, listSources } from "@ruleradar/db";
import { AppTabs, SeverityBadge } from "../ui";
import { requireUser } from "../auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireUser("/app");
  const [alerts, sources, subscription] = await Promise.all([
    listAlerts(50, session?.organizationId || undefined),
    listSources(),
    getSubscriptionForOrganization(session?.organizationId)
  ]);
  const reviewCount = alerts.filter((summary) => summary.needs_human_review).length;
  const enabledSources = sources.filter((source) => source.enabled);
  const lastChecked = newestCheck(sources.map((source) => source.lastCheckedAt));
  const needsCheckout = !subscription || ["signup_started", "checkout_started"].includes(subscription.status);

  return (
    <main className="page console-page">
      <AppTabs />
      <section className="console-hero">
        <div><div className="kicker">Er bevakningsyta</div><h1>Alertar</h1><p className="lead">Upptäckta ändringar från officiella källor, med evidens och leveransstatus samlat för teamet.</p></div>
        <Link className="button secondary" href="/sample-alerts">Se exempelalert <ArrowRight size={16} /></Link>
      </section>

      {needsCheckout ? (
        <section className="subscription-banner warning"><AlertTriangle size={21} /><div><strong>Provperioden är inte aktiverad ännu</strong><p>Slutför Stripe-kassan för att starta bevakning och alertleverans.</p></div><form action={`/api/billing/checkout?plan=${subscription?.planId || "team"}`} method="post"><button className="button primary" type="submit">Aktivera provperiod</button></form></section>
      ) : subscription.status === "past_due" ? (
        <section className="subscription-banner danger"><AlertTriangle size={21} /><div><strong>Betalningen behöver åtgärdas</strong><p>Alertleverans är pausad tills betalningsmetoden har uppdaterats.</p></div><Link className="button secondary" href="/app/settings">Öppna fakturering</Link></section>
      ) : (
        <section className="subscription-banner success"><CheckCircle2 size={21} /><div><strong>{subscription.status === "trialing" ? "Provperioden är aktiv" : "Bevakningen är aktiv"}</strong><p>Plan: {formatPlan(subscription.planId)} · alertleverans tillåten.</p></div><Link className="text-link" href="/app/settings">Hantera <Settings size={14} /></Link></section>
      )}

      <div className="metric-grid">
        <div className="metric-card"><Bell size={18} /><div className="metric">{alerts.length}</div><p>ändringar i arbetsytan</p></div>
        <div className="metric-card"><FileSearch size={18} /><div className="metric">{reviewCount}</div><p>behöver granskning</p></div>
        <div className="metric-card"><CheckCircle2 size={18} /><div className="metric">{enabledSources.length}</div><p>aktiverade källor</p></div>
        <div className="metric-card"><Clock3 size={18} /><div className="metric metric-date">{lastChecked ? formatRelative(lastChecked) : "Baslinje"}</div><p>senaste källkontroll</p></div>
      </div>

      <section className="console-grid">
        <div className="card table-card">
          <div className="card-header"><div><h2>Senaste källändringar</h2><p className="muted">Öppna en alert för sammanfattning, evidens och rekommenderad åtgärd.</p></div></div>
          {alerts.length > 0 ? (
            <table className="table">
              <thead><tr><th>Källa</th><th>Sammanfattning</th><th>Grad</th><th>Status</th></tr></thead>
              <tbody>{alerts.map((summary) => (
                <tr key={summary.id}>
                  <td data-label="Källa">{summary.source_name}</td>
                  <td data-label="Sammanfattning"><Link className="table-link" href={`/app/alerts/${summary.id}`}>{summary.summary_plain_english}</Link></td>
                  <td data-label="Grad"><SeverityBadge severity={summary.severity} /></td>
                  <td data-label="Status">{statusLabel(summary.status)}<br /><span className="muted">{deliveryLabel(summary.deliveryStatus)}</span></td>
                </tr>
              ))}</tbody>
            </table>
          ) : (
            <div className="empty-state"><span className="empty-icon"><Bell size={20} /></span><h3>Inga källändringar har upptäckts ännu.</h3><p>Baslinjen är startpunkten. När en bevakad sida ändras visas sammanfattning, evidens och granskningsstatus här.</p><div className="actions"><Link className="button primary" href="/sample-alerts">Se ett exempel</Link><Link className="button secondary" href="/app/settings">Kontrollera mottagare</Link></div></div>
          )}
        </div>

        <aside className="card source-health">
          <div className="card-header"><div><h2>Bevakade källor</h2><p className="muted">Aktuell källtäckning.</p></div><span className="pill success">{enabledSources.length} aktiva</span></div>
          <div className="source-stack">{sources.slice(0, 7).map((source) => (
            <div className="source-health-row" key={source.id}><span className={source.enabled ? "health-dot ok" : "health-dot"}></span><div><strong>{source.agency}</strong><small>{source.name}</small><small>{source.lastCheckedAt ? `Kontrollerad ${new Date(source.lastCheckedAt).toLocaleString("sv-SE")}` : "Inväntar första kontroll"}</small></div></div>
          ))}</div>
        </aside>
      </section>
    </main>
  );
}

function newestCheck(values: Array<string | null | undefined>) {
  return values.filter(Boolean).sort().reverse()[0] || null;
}

function formatRelative(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} tim`;
  return new Date(value).toLocaleDateString("sv-SE");
}

function formatPlan(plan?: string | null) {
  if (plan === "solo") return "Solo";
  if (plan === "multi_office") return "Flera kontor";
  return "Team";
}

function statusLabel(status: string) {
  return ({ review_required: "Granskning krävs", approved: "Godkänd", sent: "Skickad", suppressed: "Undertryckt", draft: "Utkast" } as Record<string, string>)[status] || status.replace(/_/g, " ");
}

function deliveryLabel(status?: string) {
  return ({ sent: "levererad", delivered: "levererad", not_sent: "inte skickad", queued: "köad", failed: "misslyckad" } as Record<string, string>)[status || ""] || status || "inte skickad";
}
