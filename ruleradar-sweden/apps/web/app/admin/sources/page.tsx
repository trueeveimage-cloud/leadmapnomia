import { Database, ExternalLink, Plus } from "lucide-react";
import { listSources } from "@ruleradar/db";
import { AppTabs } from "../../ui";
import { requireAdmin } from "../../auth";

export const dynamic = "force-dynamic";

export default async function AdminSourcesPage({ searchParams }: { searchParams?: Promise<{ saved?: string }> }) {
  const params = await searchParams;
  await requireAdmin("/admin/sources");
  const sources = await listSources();

  return (
    <main className="page sources-page">
      <AppTabs />
      <section className="console-hero"><div><div className="kicker">Bevakningsregister</div><h1>Källor</h1><p className="lead">Primära myndighetssidor, hämtningsstrategi, ämnen och senaste kända hälsostatus.</p></div><span className="readiness-score">{sources.filter((source) => source.enabled).length} aktiva</span></section>
      {params?.saved ? <p className="form-success">Källan är sparad.</p> : null}
      <div className="card table-card">
        <table className="table"><thead><tr><th>Myndighet</th><th>Källa</th><th>Strategi</th><th>Ämnen</th><th>Status</th></tr></thead><tbody>{sources.map((source) => (
          <tr key={source.id}><td data-label="Myndighet">{source.agency}</td><td data-label="Källa"><a className="source-link" href={source.url} target="_blank" rel="noreferrer">{source.name} <ExternalLink size={12} /></a></td><td data-label="Strategi">{source.strategy}</td><td data-label="Ämnen">{source.topics.join(", ")}</td><td data-label="Status"><span className={source.enabled ? "pill success" : "pill neutral"}>{source.enabled ? "Aktiv" : "Pausad"}</span><br /><span className="muted">{source.healthStatus || "okänd"}</span><br /><span className="muted">{source.lastCheckedAt ? new Date(source.lastCheckedAt).toLocaleString("sv-SE") : "Aldrig kontrollerad"}</span></td></tr>
        ))}</tbody></table>
      </div>
      <section className="card source-form-card">
        <div className="settings-card-head"><Database size={21} /><div><h2>Lägg till källa</h2><p>Nya källor granskas som standard innan alertar kan levereras.</p></div></div>
        <form action="/api/admin/sources" method="post"><div className="grid two"><label className="form-row">Namn<input name="name" className="input" placeholder="Källans namn" required /></label><label className="form-row">Myndighet<input name="agency" className="input" placeholder="Skatteverket" required /></label><label className="form-row">URL<input name="url" type="url" className="input" placeholder="https://..." required /></label><label className="form-row">Hämtningsstrategi<select name="strategy" className="input"><option value="html">HTML</option><option value="news_index">Nyhetsindex</option><option value="pdf">PDF</option><option value="document_page">Dokumentsida</option><option value="browser_fallback">Webbläsarfallback</option></select></label><label className="form-row">Ämnen<input name="topics" className="input" placeholder="payroll, employer_contributions" /></label><label className="form-row">Prioritet<select name="priority" className="input"><option value="medium">Medel</option><option value="core">Kärnkälla</option><option value="high">Hög</option><option value="optional">Valfri</option></select></label></div><button className="button primary" type="submit"><Plus size={16} /> Spara källa</button></form>
      </section>
    </main>
  );
}
