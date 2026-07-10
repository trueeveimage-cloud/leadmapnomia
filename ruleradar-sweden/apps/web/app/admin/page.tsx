import { AlertTriangle, Bot, CheckCircle2, CreditCard, Database, Mail, Radar } from "lucide-react";
import { databaseConfigured, getAdminMetrics, getConversionMetrics } from "@ruleradar/db";
import { loadConfig } from "@ruleradar/shared";
import { AppTabs } from "../ui";
import { requireAdmin } from "../auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin("/admin");
  const [metrics, conversion] = await Promise.all([getAdminMetrics(), getConversionMetrics()]);
  const config = loadConfig();
  const readiness = [
    { label: "Databas", ready: databaseConfigured(), icon: Database, detail: databaseConfigured() ? "Ansluten" : "DATABASE_URL saknas" },
    { label: "OpenAI", ready: Boolean(config.OPENAI_API_KEY), icon: Bot, detail: config.OPENAI_API_KEY ? config.OPENAI_MODEL : "API-nyckel saknas" },
    { label: "E-post", ready: Boolean(config.RESEND_API_KEY && config.ADMIN_ALERT_EMAIL && !config.ALERT_FROM_EMAIL.includes("example.com")), icon: Mail, detail: config.RESEND_API_KEY ? "Resend ansluten" : "Resend saknas" },
    { label: "Stripe", ready: Boolean(config.STRIPE_SECRET_KEY && config.STRIPE_WEBHOOK_SECRET && config.STRIPE_SOLO_PRICE_ID && config.STRIPE_TEAM_PRICE_ID && config.STRIPE_MULTI_OFFICE_PRICE_ID), icon: CreditCard, detail: config.STRIPE_WEBHOOK_SECRET ? "Checkout + webhook" : "Ofullständig konfiguration" },
    { label: "Schemalagd scan", ready: Boolean(config.SYSTEM_CRON_SECRET), icon: Radar, detail: config.SYSTEM_CRON_SECRET ? "Skyddad endpoint klar" : "Cron-hemlighet saknas" }
  ];
  const readyCount = readiness.filter((item) => item.ready).length;

  return (
    <main className="page console-page">
      <AppTabs />
      <section className="console-hero"><div><div className="kicker">Operatörskonsol</div><h1>Driftöversikt</h1><p className="lead">Källor, granskningskö, leveranser och extern konfiguration utan förskönade statusar.</p></div><span className={`readiness-score ${readyCount === readiness.length ? "ready" : ""}`}>{readyCount}/{readiness.length} system klara</span></section>

      <div className="metric-grid admin-metrics">
        <div className="metric-card"><Database size={18} /><div className="metric">{metrics.sources}</div><p>konfigurerade källor</p></div>
        <div className="metric-card"><AlertTriangle size={18} /><div className="metric">{metrics.reviewQueue}</div><p>i granskningskön</p></div>
        <div className="metric-card"><CheckCircle2 size={18} /><div className="metric">{metrics.organizations}</div><p>arbetsytor</p></div>
        <div className="metric-card"><Mail size={18} /><div className="metric">{metrics.failedDeliveries}</div><p>misslyckade leveranser</p></div>
      </div>

      <section className="readiness-panel card">
        <div className="card-header"><div><h2>Lanseringsstatus</h2><p className="muted">Läser endast om nödvändiga miljövariabler finns, aldrig deras värden.</p></div></div>
        <div className="readiness-list">{readiness.map(({ label, ready, icon: Icon, detail }) => <div key={label}><Icon size={18} /><span><strong>{label}</strong><small>{detail}</small></span><b className={ready ? "ok" : "missing"}>{ready ? "Klar" : "Saknas"}</b></div>)}</div>
      </section>

      <section className="conversion-panel card">
        <div className="card-header"><div><h2>Konvertering, senaste 30 dagarna</h2><p className="muted">Anonym förstapartsdata utan annonscookies.</p></div></div>
        <div className="conversion-metrics"><div><strong>{conversion.visitors}</strong><span>besökare</span></div><div><strong>{conversion.pricingViews}</strong><span>prisvisningar</span></div><div><strong>{conversion.trialClicks}</strong><span>provklick</span></div><div><strong>{conversion.contactRequests}</strong><span>kontaktförfrågningar</span></div></div>
      </section>

      <section className="ops-grid">
        <article className="card ops-card"><div className="card-header"><div><h2>Källflöde</h2><p className="muted">Kontrollera bevakning och granskningsbelastning.</p></div><span className={metrics.sources > 0 ? "pill success" : "pill danger"}>{metrics.sources > 0 ? "Konfigurerat" : "Saknas"}</span></div><dl className="ops-list"><div><dt>Källor</dt><dd>{metrics.sources}</dd></div><div><dt>Granskningskö</dt><dd>{metrics.reviewQueue}</dd></div><div><dt>Arbetsytor</dt><dd>{metrics.organizations}</dd></div></dl></article>
        <article className="card ops-card"><div className="card-header"><div><h2>E-postleverans</h2><p className="muted">Köade, skickade och misslyckade alertar.</p></div><span className={metrics.failedDeliveries > 0 ? "pill danger" : "pill success"}>{metrics.failedDeliveries > 0 ? "Åtgärd krävs" : "Ingen känd störning"}</span></div><dl className="ops-list"><div><dt>Skickade</dt><dd>{metrics.sentAlerts}</dd></div><div><dt>Köade</dt><dd>{metrics.queuedDeliveries}</dd></div><div><dt>Misslyckade</dt><dd>{metrics.failedDeliveries}</dd></div></dl></article>
        <article className="card ops-card"><div className="card-header"><div><h2>Betalning</h2><p className="muted">Teknisk konfiguration för provperiod och abonnemang.</p></div><span className={readiness[3]!.ready ? "pill success" : "pill warning"}>{readiness[3]!.ready ? "Klar" : "Ofullständig"}</span></div><dl className="ops-list"><div><dt>Standardplan</dt><dd>Team</dd></div><div><dt>Provperiod</dt><dd>14 dagar</dd></div><div><dt>Webhook</dt><dd>{config.STRIPE_WEBHOOK_SECRET ? "Konfigurerad" : "Saknas"}</dd></div></dl></article>
      </section>
    </main>
  );
}
