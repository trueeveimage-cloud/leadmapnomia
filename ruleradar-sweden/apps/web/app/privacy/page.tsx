import type { Metadata } from "next";

export const metadata: Metadata = { title: "Integritetspolicy" };

export default function PrivacyPage() {
  return (
    <main className="inner-page legal-page">
      <section className="premium-page-hero"><div><div className="kicker">Senast uppdaterad 10 juli 2026</div><h1>Integritetspolicy.</h1><p className="hero-lead">Här beskriver vi vilka personuppgifter RuleRadar behandlar och varför.</p></div></section>
      <article className="legal-copy">
        <h2>Personuppgiftsansvarig</h2><p>RuleRadar Sweden ansvarar för behandlingen av personuppgifter i tjänsten. Frågor skickas till <a href="mailto:privacy@ruleradar.se">privacy@ruleradar.se</a>.</p>
        <h2>Uppgifter vi behandlar</h2><p>Vi behandlar namn, e-postadress, företagsnamn, kontoroll, inloggningsuppgifter i hashad form, valda alertmottagare, abonnemangsstatus, supportmeddelanden samt tekniska drift- och revisionsloggar. Stripe behandlar betalningsuppgifter och RuleRadar lagrar inte fullständiga kortnummer.</p>
        <h2>Ändamål och rättslig grund</h2><p>Uppgifterna används för att skapa och skydda konton, leverera alertar, administrera abonnemang, ge support, förebygga missbruk och uppfylla avtal. Behandlingen grundas främst på avtal, berättigat intresse och rättsliga skyldigheter.</p>
        <h2>Leverantörer</h2><p>Vi använder Render/Postgres för drift och data, Stripe för betalning, Resend för e-post och OpenAI för strukturerad sammanfattning av offentlig källtext. Leverantörer får endast de uppgifter som behövs för respektive uppgift.</p>
        <h2>Lagring</h2><p>Kontouppgifter sparas så länge kontot är aktivt och därefter under den tid som behövs för rättsliga skyldigheter, tvist eller säkerhetsloggning. Supportförfrågningar och revisionsloggar raderas eller anonymiseras enligt fastställda gallringsrutiner.</p>
        <h2>Dina rättigheter</h2><p>Du kan begära tillgång, rättelse, radering, begränsning eller dataportabilitet och invända mot viss behandling. Du kan också lämna klagomål till Integritetsskyddsmyndigheten (IMY).</p>
        <h2>Cookies</h2><p>RuleRadar använder en nödvändig HTTP-only sessionscookie för inloggning. Vi använder inte annonseringscookies. Om ytterligare analysverktyg införs uppdateras denna policy och samtycke hanteras när det krävs.</p>
        <h2>Kontakt</h2><p>Kontakta <a href="mailto:privacy@ruleradar.se">privacy@ruleradar.se</a> för integritetsfrågor eller registrerades rättigheter.</p>
      </article>
    </main>
  );
}
