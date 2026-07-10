import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = { title: "Vanliga frågor" };

const faqs = [
  ["Är RuleRadar juridisk rådgivning?", "Nej. RuleRadar är ett informations- och bevakningsverktyg. Alertarna visar primärkällan och evidensutdraget så att er byrå kan göra sin professionella bedömning."],
  ["Är källbevakningen automatiserad?", "Ja. Aktiverade källor hämtas och jämförs mot tidigare sparade versioner. När en relevant skillnad upptäcks skapas ett underlag för sammanfattning och granskning."],
  ["Vilka svenska källor ingår?", "Startpaketet omfattar utvalda sidor hos Skatteverket, Försäkringskassan, Verksamt och Arbetsmiljöverket. Källistan utvecklas utifrån stabilitet och kundbehov. Källor som kräver särskild API- eller webbläsaråtkomst aktiveras först när den anslutningen är verifierad."],
  ["Kan AI hitta på en regeländring?", "Modellen får endast den upptäckta ändringen och källmetadata. Den instrueras att undvika spekulation, och svaret valideras mot ett strikt format. Hög påverkan eller låg säkerhet skickas till mänsklig granskning. Originalkällan visas alltid."],
  ["När skickas ett e-postlarm?", "Ett utskick kräver en lagrad källändring, en validerad sammanfattning och, när policyn kräver det, ett mänskligt godkännande. Leveransstatus sparas i arbetsytan."],
  ["Behöver vi ladda upp lönedata?", "Nej. Regelbevakningen bygger på offentliga myndighetskällor. För att leverera tjänsten behövs konto-, abonnemangs- och mottagaruppgifter, men inga individbaserade löneunderlag."],
  ["Hur fungerar den kostnadsfria perioden?", "Ni registrerar en betalningsmetod i Stripe och får 14 dagar utan debitering. Vald månadsplan börjar därefter om ni inte avslutar innan provperioden är slut."],
  ["Kan vi avsluta själva?", "Ja. I inställningarna öppnar ni Stripes kundportal för betalningsmetod, fakturor och abonnemang. En uppsägning gäller vid slutet av aktuell period."],
  ["Vad bör vi utvärdera under provperioden?", "Kontrollera om källtäckningen matchar ert arbete, om evidensen är tydlig, om rekommenderade åtgärder är användbara och om granskningsflödet passar teamets ansvarsfördelning."],
  ["Skickar ni SMS?", "E-post är standardkanalen. SMS ingår inte i nuvarande planer och aktiveras inte utan ett separat, tydligt kundbehov."]
];

export default function FaqPage() {
  return (
    <main className="inner-page">
      <section className="premium-page-hero reveal">
        <div>
          <div className="kicker">Vanliga frågor</div>
          <h1>Raka svar innan ni litar på bevakningen.</h1>
          <p className="hero-lead">Regelbevakning berör viktig information. Därför beskriver vi tydligt vad tjänsten gör, vad den inte gör och var människan fortfarande bestämmer.</p>
        </div>
      </section>
      <section className="faq-accordion faq-page-list stagger">
        {faqs.map(([question, answer], index) => (
          <details key={question} open={index === 0}>
            <summary><span>{String(index + 1).padStart(2, "0")}</span>{question}<b>+</b></summary>
            <p>{answer}</p>
          </details>
        ))}
      </section>
      <section className="note-band reveal">
        <div><h2>Saknas din fråga?</h2><p>Berätta hur er byrå arbetar i dag så svarar vi konkret utifrån ert flöde.</p></div>
        <Link className="button primary" href="/contact">Kontakta oss <ArrowRight size={16} /></Link>
      </section>
    </main>
  );
}
