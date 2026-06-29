import { listSources } from "@ruleradar/db";
import { AppTabs } from "../../ui";

export const dynamic = "force-dynamic";

export default async function AdminSourcesPage() {
  const sources = await listSources();

  return (
    <main className="page">
      <AppTabs />
      <h1>Sources</h1>
      <div className="card">
        <table className="table">
          <thead><tr><th>Agency</th><th>Name</th><th>Strategy</th><th>Topics</th><th>Status</th></tr></thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id}>
                <td>{source.agency}</td>
                <td><a href={source.url}>{source.name}</a></td>
                <td>{source.strategy}</td>
                <td>{source.topics.join(", ")}</td>
                <td>{source.enabled ? "enabled" : "disabled"}<br/><span className="muted">{source.healthStatus || "unknown"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="card" style={{ marginTop: 18 }}>
        <h2>Add source</h2>
        <form action="/api/admin/sources" method="post">
          <div className="grid two">
            <label className="form-row">Name<input name="name" className="input" placeholder="Source name" required /></label>
            <label className="form-row">Agency<input name="agency" className="input" placeholder="Official agency" required /></label>
            <label className="form-row">URL<input name="url" className="input" placeholder="https://official-source.example" required /></label>
            <label className="form-row">Strategy<select name="strategy" className="input"><option>html</option><option>news_index</option><option>pdf</option><option>document_page</option><option>browser_fallback</option></select></label>
            <label className="form-row">Topics<input name="topics" className="input" placeholder="payroll, vat" /></label>
            <label className="form-row">Priority<select name="priority" className="input"><option>medium</option><option>core</option><option>high</option><option>optional</option></select></label>
          </div>
          <button className="button" type="submit">Save source</button>
        </form>
      </section>
    </main>
  );
}
