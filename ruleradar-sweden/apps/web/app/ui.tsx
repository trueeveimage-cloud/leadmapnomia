import Link from "next/link";
import type { Severity } from "@ruleradar/shared";

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`badge ${severity}`}>{severity}</span>;
}

export function AppTabs() {
  return (
    <nav className="nav" aria-label="App navigation">
      <Link href="/app">Alerts</Link>
      <Link href="/app/settings">Settings</Link>
      <Link href="/admin">Admin overview</Link>
      <Link href="/admin/sources">Sources</Link>
      <Link href="/admin/review">Review queue</Link>
    </nav>
  );
}
