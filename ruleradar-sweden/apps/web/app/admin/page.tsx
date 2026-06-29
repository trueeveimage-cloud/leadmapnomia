import { getAdminMetrics } from "@ruleradar/db";
import { AppTabs } from "../ui";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const metrics = await getAdminMetrics();

  return (
    <main className="page">
      <AppTabs />
      <h1>Admin Overview</h1>
      <div className="grid">
        <div className="card"><div className="metric">{metrics.sources}</div><p className="muted">sources</p></div>
        <div className="card"><div className="metric">{metrics.reviewQueue}</div><p className="muted">review queue</p></div>
        <div className="card"><div className="metric">{metrics.organizations}</div><p className="muted">beta workspaces</p></div>
        <div className="card"><div className="metric">{metrics.sentAlerts}</div><p className="muted">sent alerts</p></div>
      </div>
    </main>
  );
}
