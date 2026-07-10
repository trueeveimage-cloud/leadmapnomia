import Link from "next/link";
import type { Severity } from "@ruleradar/shared";
import { Bell, Database, LogOut, Settings, ShieldCheck, Users } from "lucide-react";
import { authIsRequired, getSession } from "./auth";

const severityLabels: Record<Severity, string> = {
  low: "Låg",
  medium: "Medel",
  high: "Hög",
  critical: "Kritisk"
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`badge ${severity}`}>{severityLabels[severity]}</span>;
}

export async function AppTabs() {
  const session = await getSession();
  const showAdmin = !authIsRequired() || Boolean(session?.isPlatformAdmin);

  return (
    <nav className="nav" aria-label="Applikationsnavigation">
      <Link href="/app"><Bell size={14} /> Alertar</Link>
      <Link href="/app/team"><Users size={14} /> Team</Link>
      <Link href="/app/settings"><Settings size={14} /> Inställningar</Link>
      {showAdmin ? <Link href="/admin"><ShieldCheck size={14} /> Driftöversikt</Link> : null}
      {showAdmin ? <Link href="/admin/sources"><Database size={14} /> Källor</Link> : null}
      {showAdmin ? <Link href="/admin/review">Granskningskö</Link> : null}
      {authIsRequired() ? (
        <form action="/api/auth/logout" method="post">
          <button className="nav-button" type="submit"><LogOut size={14} /> Logga ut</button>
        </form>
      ) : null}
    </nav>
  );
}
