import type { Metadata } from "next";
import { loadConfig } from "@ruleradar/shared";

export const metadata: Metadata = { title: "Användarvillkor" };

export default function TermsPage() {
  const config = loadConfig();
  const legalEntity = config.LEGAL_ENTITY_NAME || "RuleRadar Sweden";
  const legalDetails = [config.LEGAL_ORG_NUMBER, config.LEGAL_POSTAL_ADDRESS].filter(Boolean).join(", ");
  const contactEmail = config.LEGAL_CONTACT_EMAIL || "legal@ruleradar.se";
  return (
    <main className="inner-page legal-page">
      <section className="premium-page-hero"><div><div className="kicker">Senast uppdaterad 10 juli 2026</div><h1>Användarvillkor.</h1><p className="hero-lead">Villkoren gäller för RuleRadars webbplats, provperiod och abonnemang.</p></div></section>
      <article className="legal-copy">
        <h2>1. Tjänsten</h2><p>RuleRadar tillhandahålls av {legalEntity}{legalDetails ? `, ${legalDetails}` : ""}. Tjänsten bevakar utvalda offentliga källor och skapar informationsunderlag om upptäckta förändringar. Tjänsten är inte juridisk, skatte- eller lönerådgivning och ersätter inte kontroll av primärkällan eller professionell bedömning.</p>
        <h2>2. Konto och behörighet</h2><p>Du ansvarar för korrekta kontouppgifter, ett säkert lösenord och aktivitet som sker i ditt konto. Konton får endast användas för lagliga affärsändamål och får inte delas utanför den organisation som abonnemanget avser.</p>
        <h2>3. Provperiod och betalning</h2><p>Provperioden är 14 dagar om inget annat anges. Betalningsmetod registreras via Stripe. Efter provperioden debiteras vald månadsplan tills abonnemanget avslutas. Angivna priser är exklusive moms.</p>
        <h2>4. Uppsägning</h2><p>Abonnemang kan avslutas via kundportalen. Uppsägningen gäller från slutet av aktuell betalningsperiod. Redan betalda avgifter återbetalas inte om tvingande lag inte kräver annat.</p>
        <h2>5. Tillgänglighet och förändringar</h2><p>Vi strävar efter stabil bevakning men garanterar inte oavbruten drift, fullständig källtäckning eller att varje ändring upptäcks. Källor kan ändras, blockeras eller tas bort. Väsentliga förändringar i tjänsten eller pris kommuniceras i rimlig tid.</p>
        <h2>6. Tillåten användning</h2><p>Du får inte försöka kringgå åtkomstskydd, överbelasta tjänsten, extrahera data automatiskt i strid med instruktioner eller använda RuleRadar för att sprida vilseledande eller olaglig information.</p>
        <h2>7. Ansvarsbegränsning</h2><p>RuleRadar ansvarar inte för beslut som fattas utan kontroll av officiell källa eller för indirekt skada, utebliven vinst eller följdskada, i den utsträckning lagen tillåter.</p>
        <h2>8. Kontakt och lag</h2><p>Svensk lag gäller. Frågor om villkoren skickas till <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.</p>
      </article>
    </main>
  );
}
