import { Bell, CreditCard, ExternalLink, Mail, ShieldCheck } from "lucide-react";
import { getSubscriptionForOrganization, listNotificationRecipients } from "@ruleradar/db";
import { AppTabs } from "../../ui";
import { requireUser } from "../../auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams?: Promise<{ saved?: string; checkout?: string; billing?: string }> }) {
  const params = await searchParams;
  const session = await requireUser("/app/settings");
  const [recipients, subscription] = await Promise.all([
    listNotificationRecipients(session?.organizationId || undefined),
    getSubscriptionForOrganization(session?.organizationId)
  ]);
  const first = recipients[0];

  return (
    <main className="page settings-page">
      <AppTabs />
      <section className="console-hero"><div><div className="kicker">Arbetsyta</div><h1>Inställningar</h1><p className="lead">Styr vem som får alertar och hantera abonnemanget utan att kontakta support.</p></div></section>
      {params?.saved === "notifications" ? <p className="form-success">Alertinställningarna är sparade.</p> : null}
      {params?.checkout === "success" ? <p className="form-success">Stripe-kassan är klar. Abonnemangsstatus uppdateras så snart webhooken har behandlats.</p> : null}
      {params?.billing === "cancel_scheduled" ? <p className="form-success">Uppsägningen är registrerad och gäller vid periodens slut.</p> : null}

      <div className="settings-grid">
        <section className="card settings-card">
          <div className="settings-card-head"><Bell size={21} /><div><h2>Alertleverans</h2><p>Välj primär mottagare och leveranssätt.</p></div></div>
          <form action="/api/settings/notifications" method="post">
            {first?.id ? <input type="hidden" name="recipientId" value={first.id} /> : null}
            <label className="form-row">Leveranssätt<select name="deliveryMode" className="input" defaultValue={first?.immediate ? "immediate" : "digest"}><option value="immediate">Omedelbart efter godkänd ändring</option><option value="digest">Endast daglig sammanställning</option></select></label>
            <label className="form-row">Mottagarens e-post<input name="recipientEmail" className="input" type="email" defaultValue={first?.recipientEmail || session?.email || ""} required /></label>
            <label className="form-row">Ämnesfilter <span className="field-help">Lämna tomt för alla ämnen.</span><input name="topics" className="input" defaultValue={first?.topics.join(", ") || ""} placeholder="lön, arbetsgivaravgifter, AGI" /></label>
            <button className="button primary" type="submit">Spara alertinställningar</button>
          </form>
          <p className="settings-foot"><Mail size={13} /> {recipients.length} aktiv {recipients.length === 1 ? "mottagare" : "mottagare"} i arbetsytan.</p>
        </section>

        <section className="card settings-card billing-card">
          <div className="settings-card-head"><CreditCard size={21} /><div><h2>Plan och fakturering</h2><p>Betalning och fakturor hanteras säkert i Stripe.</p></div></div>
          <dl className="billing-facts">
            <div><dt>Plan</dt><dd>{formatPlan(subscription?.planId)}</dd></div>
            <div><dt>Status</dt><dd><span className={`pill ${statusTone(subscription?.status)}`}>{statusLabel(subscription?.status)}</span></dd></div>
            <div><dt>Periodslut</dt><dd>{subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString("sv-SE") : "Inte fastställt"}</dd></div>
          </dl>
          {subscription?.status === "past_due" ? <p className="form-error">Betalningen behöver åtgärdas. Alertleverans är pausad tills betalningsmetoden är uppdaterad.</p> : null}
          {subscription?.status === "cancel_at_period_end" ? <p className="form-success">Uppsägningen är registrerad. Tjänsten fortsätter till periodens slut.</p> : null}
          <div className="billing-actions">
            {subscription?.stripeCustomerId ? <form action="/api/billing/portal" method="post"><button className="button primary" type="submit">Öppna Stripes kundportal <ExternalLink size={15} /></button></form> : <form action={`/api/billing/checkout?plan=${subscription?.planId || "team"}`} method="post"><button className="button primary" type="submit">Aktivera provperiod</button></form>}
            {subscription?.stripeSubscriptionId && !["cancel_at_period_end", "canceled"].includes(subscription.status) ? (
              <details className="cancel-disclosure"><summary className="button secondary">Avsluta abonnemang</summary><div><p>Uppsägningen gäller vid slutet av aktuell period. Detta stoppar framtida förnyelser.</p><form action="/api/billing/cancel" method="post"><button className="button danger" type="submit">Bekräfta uppsägning</button></form></div></details>
            ) : null}
          </div>
          <p className="settings-foot"><ShieldCheck size={13} /> RuleRadar lagrar inte fullständiga kortuppgifter.</p>
        </section>
      </div>
    </main>
  );
}

function formatPlan(plan?: string | null) { return plan === "solo" ? "Solo" : plan === "multi_office" ? "Flera kontor" : "Team"; }
function statusLabel(status?: string | null) { return ({ trialing: "Provperiod", active: "Aktiv", past_due: "Förfallen betalning", cancel_at_period_end: "Avslutas vid periodslut", canceled: "Avslutad", signup_started: "Ej aktiverad", checkout_started: "Kassan påbörjad", checkout_completed: "Aktiveras" } as Record<string, string>)[status || ""] || "Ej startad"; }
function statusTone(status?: string | null) { return status === "active" || status === "trialing" ? "success" : status === "past_due" ? "danger" : "neutral"; }
