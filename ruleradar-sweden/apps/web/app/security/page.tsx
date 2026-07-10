import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Database, Eye, FileCheck2, KeyRound, ShieldCheck } from "lucide-react";

export const metadata: Metadata = { title: "Säkerhet" };

const controls = [
  [ShieldCheck, "Mänsklig granskningsspärr", "Ändringar med hög påverkan, låg modellsäkerhet eller särskilda riskmönster kan inte passera utan granskning."],
  [FileCheck2, "Evidens före slutsats", "Varje underlag kopplas till URL, snapshot, ändringsutdrag och tidpunkt så att teamet kan kontrollera originalet."],
  [KeyRound, "Skyddade konton", "Lösenord lagras som scrypt-hashar och sessioner signeras i HTTP-only cookies med begränsad livslängd."],
  [Database, "Minimerad datamängd", "Tjänsten behöver inte individbaserad lönedata. Konto-, abonnemangs- och alertuppgifter hålls separerade per arbetsyta."],
  [Eye, "Kontrollerad åtkomst", "Kundvyer kräver inloggning och operatörsvyer kräver plattformsadministratör. API-rutter följer samma åtkomstmodell."]
] as const;

export default function SecurityPage() {
  return (
    <main className="inner-page legal-page">
      <section className="premium-page-hero reveal">
        <div><div className="kicker">Säkerhet och kvalitet</div><h1>Kontrollbar information, tydliga spärrar.</h1><p className="hero-lead">RuleRadar är byggt för ett arbetsflöde där en alert ska kunna verifieras innan den påverkar lönekörning, rapportering eller kundråd.</p></div>
      </section>
      <section className="security-grid stagger">
        {controls.map(([Icon, title, body]) => <article key={title}><Icon size={24} /><h2>{title}</h2><p>{body}</p></article>)}
      </section>
      <section className="legal-copy reveal">
        <h2>Leverantörer och dataflöde</h2>
        <p>Drift och datalagring sker i Render/Postgres. Stripe behandlar betalningsuppgifter. Resend levererar e-post och OpenAI används för strukturerade sammanfattningar med lagring av modellinput avstängd i API-anropet. Endast källmetadata och det relevanta ändringsutdraget skickas för sammanfattning.</p>
        <h2>Incidenthantering</h2>
        <p>Vid misstänkt incident pausas riskfyllda utskick, berörda nycklar roteras, loggar bevaras och påverkan bedöms. Kunder och tillsynsmyndighet underrättas när tillämpliga regler kräver det.</p>
        <h2>Viktigt om betastatus</h2>
        <p>RuleRadar är ett tidigt produktionssystem. Vi lovar inte att varje myndighetsändring upptäcks eller att en sammanfattning är komplett. Därför följer primärkällan alltid med och högriskhändelser kan kräva mänskligt godkännande.</p>
      </section>
      <section className="note-band"><div><h2>Behöver ni ett säkerhetssvar?</h2><p>Skicka era frågor om databehandling, åtkomst eller leverantörer så svarar vi skriftligt.</p></div><Link className="button primary" href="/contact">Kontakta oss <ArrowRight size={16} /></Link></section>
    </main>
  );
}
