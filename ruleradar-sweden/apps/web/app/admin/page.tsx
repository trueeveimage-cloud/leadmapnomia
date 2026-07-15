import { Activity, AlertTriangle, Bot, CheckCircle2, CreditCard, Database, Mail, Radar } from "lucide-react";
import { databaseConfigured, getAdminMetrics, getConversionMetrics, getWorkerHealth, listContactRequests } from "@ruleradar/db";
import { loadConfig } from "@ruleradar/shared";
import { AppTabs } from "../ui";
import { requireAdmin } from "../auth";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams?: Promise<{ lead?: string }> }) {
  const params = await searchParams;
  await requireAdmin("/admin");
  const [metrics, conversion, worker, leads] = await Promise.all([getAdminMetrics(), getConversionMetrics(), getWorkerHealth(), listContactRequests()]);
  const config = loadConfig();
  const readiness = [
    { label: "Databas", ready: databaseConfigured(), icon: Database, detail: databaseConfigured() ? "Ansluten" : "DATABASE_URL saknas" },
    { label: "OpenAI", ready: Boolean(config.OPENAI_API_KEY), icon: Bot, detail: config.OPENAI_API_KEY ? config.OPENAI_MODEL : "API-nyckel saknas" },
    { label: "E-post", ready: Boolean(config.RESEND_API_KEY && config.ADMIN_ALERT_EMAIL && !config.ALERT_FROM_EMAIL.includes("example.com")), icon: Mail, detail: config.RESEND_API_KEY ? "Resend ansluten" : "Resend saknas" },
    { label: "Stripe", ready: Boolean(config.STRIPE_SECRET_KEY && config.STRIPE_WEBHOOK_SECRET && config.STRIPE_SOLO_PRICE_ID && config.STRIPE_TEAM_PRICE_ID && config.STRIPE_MULTI_OFFICE_PRICE_ID), icon: CreditCard, detail: config.STRIPE_WEBHOOK_SECRET ? "Checkout + webhook" : "Ofullständig konfiguration" },
    { label: "Bevakningsmotor", ready: worker.ok, icon: Radar, detail: worker.lastScanAt ? `${worker.healthySources}/${worker.enabledSources} källor friska` : "Ingen slutförd scan" }
  ];
  const readyCount = readiness.filter((item) => item.ready).length;

  return (
    <main className="page console-page">
      <AppTabs />
      <section className="console-hero"><div><div className="kicker">Operatörskonsol</div><h1>Driftöversikt</h1><p className="lead">Källor, granskningskö, leveranser och extern konfiguration utan förskönade statusar.</p></div><span className={`readiness-score ${readyCount === readiness.length ? "ready" : ""}`}>{readyCount}/{readiness.length} system klara</span></section>

      <div className="metric-grid admin-metrics">
        <div className="metric-card"><Database size={18} /><div className="metric">{worker.healthySources}/{metrics.enabledSources}</div><p>friska aktiva källor</p></div>
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
        <div className="conversion-metrics"><div><strong>{conversion.visitors}</strong><span>besökare</span></div><div><strong>{conversion.pricingViews}</strong><span>prisvisningar</span></div><div><strong>{conversion.trialClicks}</strong><span>provklick</span></div><div><strong>{conversion.contactRequests}</strong><span>kontaktförfrågningar</span></div><div><strong>{conversion.signups}</strong><span>registreringar</span></div><div><strong>{conversion.checkouts}</strong><span>kassor startade</span></div><div><strong>{conversion.activated}</strong><span>aktiverade provperioder</span></div></div>
      </section>

      <section className="conversion-panel card">
        <div className="card-header"><div><h2>Pilotpipeline</h2><p className="muted">Senaste kontaktförfrågningarna och nästa kommersiella steg.</p></div><span className="pill neutral">{leads.length} leads</span></div>
        {params?.lead === "saved" ? <p className="form-success">Leadstatusen är uppdaterad.</p> : null}
        {leads.length ? <div className="table-scroll"><table className="table"><thead><tr><th>Företag</th><th>Kontakt</th><th>Behov</th><th>Status</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id}><td data-label="Företag"><strong>{lead.company}</strong><br /><span className="muted">{lead.teamSize || "Teamstorlek saknas"} · {new Date(lead.createdAt).toLocaleDateString("sv-SE")}</span></td><td data-label="Kontakt"><a className="table-link" href={`mailto:${lead.email}`}>{lead.name}</a><br /><span className="muted">{lead.email}</span></td><td data-label="Behov"><span className="lead-message">{lead.message}</span></td><td data-label="Status"><form className="lead-status-form" action={`/api/admin/leads/${lead.id}`} method="post"><select className="input" name="status" defaultValue={lead.status}><option value="new">Ny</option><option value="contacted">Kontaktad</option><option value="qualified">Kvalificerad</option><option value="pilot">Pilot</option><option value="won">Vunnen</option><option value="lost">Förlorad</option></select><button className="button secondary" type="submit">Spara</button></form></td></tr>)}</tbody></table></div> : <div className="empty-state compact"><h3>Inga kontaktförfrågningar ännu.</h3><p>Nya formulärförfrågningar visas här och skickas även till administratörens e-post.</p></div>}
      </section>

      <section className="ops-grid">
        <article className="card ops-card"><div className="card-header"><div><h2>Källflöde</h2><p className="muted">Faktisk hälsa och scanresultat från det senaste dygnet.</p></div><span className={worker.ok ? "pill success" : "pill danger"}>{worker.ok ? "Friskt" : "Åtgärd krävs"}</span></div><dl className="ops-list"><div><dt>Friska aktiva källor</dt><dd>{worker.healthySources}/{worker.enabledSources}</dd></div><div><dt>Skanningar senaste 24 h</dt><dd>{worker.scans24h}</dd></div><div><dt>Misslyckade senaste 24 h</dt><dd>{worker.failedScans24h}</dd></div><div><dt>Senaste skanning</dt><dd>{worker.lastScanAt ? new Date(worker.lastScanAt).toLocaleString("sv-SE") : "Saknas"}</dd></div></dl></article>
        <article className="card ops-card"><div className="card-header"><div><h2>E-postleverans</h2><p className="muted">Köade, skickade och misslyckade alertar.</p></div><span className={metrics.failedDeliveries > 0 ? "pill danger" : "pill success"}>{metrics.failedDeliveries > 0 ? "Åtgärd krävs" : "Ingen känd störning"}</span></div><dl className="ops-list"><div><dt>Skickade</dt><dd>{metrics.sentAlerts}</dd></div><div><dt>Köade</dt><dd>{metrics.queuedDeliveries}</dd></div><div><dt>Misslyckade</dt><dd>{metrics.failedDeliveries}</dd></div></dl></article>
        <article className="card ops-card"><div className="card-header"><div><h2>Betalning</h2><p className="muted">Teknisk konfiguration för provperiod och abonnemang.</p></div><span className={readiness[3]!.ready ? "pill success" : "pill warning"}>{readiness[3]!.ready ? "Klar" : "Ofullständig"}</span></div><dl className="ops-list"><div><dt>Standardplan</dt><dd>Team</dd></div><div><dt>Provperiod</dt><dd>14 dagar</dd></div><div><dt>Aktiverade senaste 30 d</dt><dd>{conversion.activated}</dd></div><div><dt>Webhook</dt><dd>{config.STRIPE_WEBHOOK_SECRET ? "Konfigurerad" : "Saknas"}</dd></div></dl></article>
      </section>

      <section className="readiness-panel card">
        <div className="card-header"><div><h2>Driftbevis</h2><p className="muted">Mätvärden som ska följas under de första kundpiloterna.</p></div><Activity size={20} /></div>
        <dl className="ops-list"><div><dt>Källor som är för gamla</dt><dd>{worker.staleSources}</dd></div><div><dt>Degraderade källor</dt><dd>{worker.degradedSources}</dd></div><div><dt>Granskningskö</dt><dd>{metrics.reviewQueue}</dd></div><div><dt>Misslyckade leveranser</dt><dd>{metrics.failedDeliveries}</dd></div></dl>
      </section>
    </main>
  );
}
