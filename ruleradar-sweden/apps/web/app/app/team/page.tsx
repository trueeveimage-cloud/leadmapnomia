import { MailPlus, Trash2, UserCheck, Users } from "lucide-react";
import { getOrganizationSeatUsage, listOrganizationInvites, listOrganizationMembers } from "@ruleradar/db";
import { AppTabs } from "../../ui";
import { requireUser } from "../../auth";

export const dynamic = "force-dynamic";

export default async function TeamPage({ searchParams }: { searchParams?: Promise<{ invited?: string; error?: string; joined?: string }> }) {
  const params = await searchParams;
  const session = await requireUser("/app/team");
  const [members, invites, usage] = await Promise.all([
    listOrganizationMembers(session?.organizationId),
    listOrganizationInvites(session?.organizationId),
    getOrganizationSeatUsage(session?.organizationId)
  ]);
  const canManage = session?.role === "owner" || session?.role === "admin";
  const usedSeats = usage.members + usage.pendingInvites;

  return (
    <main className="page team-page">
      <AppTabs />
      <section className="console-hero"><div><div className="kicker">Arbetsytans åtkomst</div><h1>Team</h1><p className="lead">Hantera vilka som kan se alertar och dela granskningsansvaret.</p></div><span className="readiness-score">{usedSeats}/{usage.includedSeats} platser använda</span></section>
      {params?.invited ? <p className="form-success">Inbjudan är skickad och gäller i sju dagar.</p> : null}
      {params?.joined ? <p className="form-success">Du har anslutit till arbetsytan.</p> : null}
      {params?.error ? <p className="form-error">{inviteError(params.error)}</p> : null}

      <section className="team-layout">
        <div className="card team-members">
          <div className="settings-card-head"><Users size={21} /><div><h2>Medlemmar</h2><p>{members.length} personer har åtkomst.</p></div></div>
          <div className="member-list">{members.map((member) => <div key={member.membershipId}><span className="member-avatar">{initials(member.name || member.email)}</span><div><strong>{member.name || "Namnlös användare"}</strong><small>{member.email}</small></div><span className="pill neutral">{roleLabel(member.role)}</span></div>)}</div>
        </div>

        {canManage ? (
          <aside className="card invite-card">
            <div className="settings-card-head"><MailPlus size={21} /><div><h2>Bjud in kollega</h2><p>{Math.max(usage.includedSeats - usedSeats, 0)} platser kvar på planen.</p></div></div>
            <form action="/api/team/invite" method="post"><label className="form-row">Kollegans e-post<input className="input" name="email" type="email" placeholder="kollega@foretag.se" required /></label><label className="form-row">Behörighet<select className="input" name="role" defaultValue="member"><option value="member">Medlem – se alertar</option><option value="admin">Admin – hantera team och inställningar</option></select></label><button className="button primary form-submit" type="submit" disabled={usedSeats >= usage.includedSeats}>Skicka inbjudan</button></form>
            {usedSeats >= usage.includedSeats ? <p className="form-error">Planens platser är slut. Uppgradera planen eller återkalla en väntande inbjudan.</p> : null}
          </aside>
        ) : null}
      </section>

      {invites.length > 0 ? <section className="card pending-invites"><div className="settings-card-head"><UserCheck size={21} /><div><h2>Väntande inbjudningar</h2><p>Platser reserveras tills inbjudan går ut eller återkallas.</p></div></div>{invites.map((invite) => <div className="pending-row" key={invite.id}><div><strong>{invite.email}</strong><small>{roleLabel(invite.role)} · gäller till {new Date(invite.expiresAt).toLocaleDateString("sv-SE")}</small></div>{canManage ? <form action={`/api/team/invites/${invite.id}`} method="post"><button className="icon-button danger-icon" type="submit" title="Återkalla inbjudan" aria-label={`Återkalla inbjudan till ${invite.email}`}><Trash2 size={16} /></button></form> : null}</div>)}</section> : null}
    </main>
  );
}

function initials(value: string) { return value.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(""); }
function roleLabel(role: string) { return role === "owner" ? "Ägare" : role === "admin" ? "Admin" : "Medlem"; }
function inviteError(error: string) { return ({ seat_limit: "Planens platser är slut.", exists: "Personen är redan medlem eller har en aktiv inbjudan.", setup: "E-postleveransen är inte konfigurerad ännu.", invalid: "Kontrollera e-postadress och behörighet.", send: "Inbjudan kunde inte skickas. Försök igen." } as Record<string, string>)[error] || "Inbjudan kunde inte hanteras."; }
