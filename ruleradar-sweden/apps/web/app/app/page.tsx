import Link from "next/link";
import { listAlerts } from "@ruleradar/db";
import { AppTabs, SeverityBadge } from "../ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const alerts = await listAlerts();
  const reviewCount = alerts.filter((summary) => summary.needs_human_review).length;

  return (
    <main className="page">
      <AppTabs />
      <h1>Alerts</h1>
      <div className="grid">
        <div className="card"><div className="metric">{alerts.length}</div><p className="muted">latest changes</p></div>
        <div className="card"><div className="metric">{reviewCount}</div><p className="muted">needs review</p></div>
        <div className="card"><div className="metric">98%</div><p className="muted">target scan success</p></div>
      </div>
      <div className="card" style={{ marginTop: 20 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Summary</th>
              <th>Severity</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((summary) => (
              <tr key={summary.id}>
                <td data-label="Source">{summary.source_name}</td>
                <td data-label="Summary"><Link href={`/app/alerts/${summary.id}`}>{summary.summary_plain_english}</Link></td>
                <td data-label="Severity"><SeverityBadge severity={summary.severity} /></td>
                <td data-label="Status">{summary.status}<br/><span className="muted">{summary.deliveryStatus}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
