import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileSearch,
  Radar,
  ShieldCheck,
  Sparkles,
  UserCheck
} from "lucide-react";
import { listSources, sampleSummaries } from "@ruleradar/db";
import { SeverityBadge } from "./ui";

export const dynamic = "force-dynamic";

const sample = sampleSummaries[0]!;

const workflow = [
  { icon: Radar, step: "01", title: "Bevakar", body: "Utvalda sidor och dokument hos svenska myndigheter läses av enligt schema." },
  { icon: FileSearch, step: "02", title: "Jämför", body: "Nya versioner jämförs med föregående snapshot så att den faktiska ändringen isoleras." },
  { icon: Sparkles, step: "03", title: "Förklarar", body: "RuleRadar sammanfattar påverkan, berörda grupper och nästa rimliga åtgärd." },
  { icon: UserCheck, step: "04", title: "Granskar", body: "Känsliga eller osäkra ändringar går till mänsklig kontroll innan de skickas vidare." },
  { icon: BellRing, step: "05", title: "Larmar", body: "Teamet får en kort alert med källa, evidens och tydlig granskningsstatus." }
];

const outcomes = [
  ["Färre blinda fläckar", "Slipp hoppas att någon hann kontrollera alla myndighetssidor före nästa körning."],
  ["Snabbare intern bedömning", "Se ändringen, målgruppen och rekommenderad åtgärd i samma granskningsvy."],
  ["Spårbar kundkommunikation", "Behåll källänk, evidensutdrag och beslutshistorik när ni agerar på en ändring."]
];

const faqs = [
  ["Ersätter RuleRadar vår professionella bedömning?", "Nej. RuleRadar minskar bevakningsarbetet och gör ändringen lättare att granska. Ert team beslutar alltid hur informationen ska användas."],
  ["Vilka källor bevakas?", "Startpaketet fokuserar på Skatteverket, Försäkringskassan, Bolagsverket, Verksamt och utvalda arbetsgivarrelaterade publikationer. Källor prioriteras efter påverkan och stabilitet."],
  ["Kan en felaktig AI-sammanfattning skickas direkt?", "Ändringar med hög påverkan, låg säkerhet eller särskilda riskmönster markeras för mänsklig granskning. Varje alert visar dessutom originalkällan och det ändrade utdraget."],
  ["Vad händer efter de 14 gratis dagarna?", "Vald månadsplan börjar löpa om ni inte avslutar före provperiodens slut. Abonnemang och betalningsmetod hanteras i Stripes säkra kundportal."]
];

export default async function HomePage() {
  const sources = await listSources();
  const enabledSources = sources.filter((source) => source.enabled);
  const coverageAgencies = [...new Set(enabledSources.map((source) => source.agency))].slice(0, 5);

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "RuleRadar Sweden",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: "Regelbevakning för svenska löne- och redovisningsteam.",
        offers: plansForStructuredData()
      }) }} />
      <section className="hero-stage">
        <div className="hero-scene" aria-hidden="true">
          <div className="scene-rail">
            <span className="scene-logo"><Radar size={18} /></span>
            <span></span><span></span><span></span>
          </div>
          <div className="scene-window">
            <div className="scene-toolbar">
              <span>Granskningskö</span>
              <span className="scene-status"><i></i> Bevakning aktiv</span>
            </div>
            <div className="scene-alert">
              <div className="scene-alert-head">
                <span>Skatteverket · AGI</span>
                <b>HÖG</b>
              </div>
              <h2>Vägledning om nedsatta arbetsgivaravgifter har ändrats</h2>
              <p>Ny formulering berör arbetsgivare med anställda inom angivet födelseårsintervall.</p>
              <div className="scene-data">
                <span><small>Säkerhet</small><strong>91%</strong></span>
                <span><small>Status</small><strong>Granskning krävs</strong></span>
              </div>
            </div>
            <div className="scene-evidence">
              <FileCheck2 size={18} />
              <span><small>Evidens fångad</small><strong>Källtext och versionsskillnad sparad</strong></span>
            </div>
          </div>
        </div>

        <div className="hero-content reveal">
          <div className="hero-kicker"><span></span> Regelbevakning för svenska byråer</div>
          <h1>Fånga regeländringen innan den blir ett kundfel.</h1>
          <p>RuleRadar bevakar svenska myndighetskällor, hittar betydelsefulla ändringar och ger ert löne- eller redovisningsteam en spårbar alert att agera på.</p>
          <div className="actions hero-actions">
            <Link className="button primary button-large" href="/signup?plan=team">Starta 14 dagar gratis <ArrowRight size={18} /></Link>
            <Link className="button hero-secondary button-large" href="/sample-alerts">Se exempelalert <ExternalLink size={17} /></Link>
          </div>
          <div className="hero-assurance">
            <span><Check size={15} /> 14 dagar gratis</span>
            <span><Check size={15} /> Avsluta när du vill</span>
            <span><Check size={15} /> Källan följer alltid med</span>
          </div>
        </div>
      </section>

      <section className="coverage-rail" aria-label="Bevakade källfamiljer">
        <span className="coverage-label">BEVAKAR PRIMÄRKÄLLOR FRÅN</span>
        <div>
          {coverageAgencies.map((agency) => <strong key={agency}>{agency}</strong>)}
        </div>
        <small>Oberoende tjänst, inte ansluten till myndigheterna.</small>
      </section>

      <section className="content-section problem-band" id="produkt">
        <div className="section-intro reveal">
          <span className="section-number">01 / PROBLEMET</span>
          <h2>Myndighetssidan ändras tyst.<br />Konsekvensen gör det inte.</h2>
        </div>
        <div className="problem-layout">
          <p className="problem-lead reveal">När kontrollen bygger på bokmärken, nyhetsbrev och någons minne uppstår luckor precis när arbetsbelastningen är som högst.</p>
          <div className="problem-sequence stagger">
            <div><span>FÖRE</span><strong>Manuell kontroll</strong><p>Flera källor, många undersidor och ingen gemensam historik.</p></div>
            <ArrowRight className="sequence-arrow" size={22} />
            <div className="after"><span>MED RULERADAR</span><strong>En granskningskö</strong><p>Ändring, påverkan, evidens och status samlat på ett ställe.</p></div>
          </div>
        </div>
      </section>

      <section className="content-section evidence-section">
        <div className="section-intro reveal">
          <span className="section-number">02 / PRODUKTBEVIS</span>
          <h2>Se exakt vad som ändrades.<br />Inte bara att något hände.</h2>
          <p>Varje alert är byggd för snabb intern granskning, med primärkällan bara ett klick bort.</p>
        </div>

        <div className="alert-anatomy reveal">
          <div className="anatomy-sidebar">
            <span className="anatomy-label">EXEMPEL PÅ ALERTFORMAT</span>
            <div className="anatomy-source"><span>SKV</span><div><strong>Skatteverket</strong><small>Arbetsgivaravgifter</small></div></div>
            <nav aria-label="Alertinnehåll">
              <a className="active" href="#alert-summary">Översikt</a>
              <a href="#alert-evidence">Evidens</a>
              <a href="#alert-action">Åtgärd</a>
            </nav>
          </div>
          <article className="anatomy-main" id="alert-summary">
            <div className="anatomy-topline">
              <span>Upptäckt 07:42 · idag</span>
              <SeverityBadge severity="high" />
            </div>
            <h3>Vägledning om nedsatta arbetsgivaravgifter har ändrats</h3>
            <p>Skatteverket har uppdaterat vägledningen om nedsatta arbetsgivaravgifter för yngre anställda.</p>
            <div className="anatomy-grid">
              <div><small>BERÖR</small><strong>Arbetsgivare och lönebyråer med anställda i aktuellt åldersintervall.</strong></div>
              <div id="alert-action"><small>REKOMMENDERAD ÅTGÄRD</small><strong>Kontrollera löneinställningar före nästa arbetsgivardeklaration.</strong></div>
            </div>
            <div className="evidence-box" id="alert-evidence">
              <div><FileCheck2 size={18} /><span>Evidensutdrag</span><b>91% säkerhet</b></div>
              <p>Den ändrade texten hänvisar till nedsatta arbetsgivaravgifter och ett intervall för den anställdes födelseår.</p>
            </div>
            <a className="source-button" href={sample.source_url} target="_blank" rel="noreferrer">Öppna originalkälla <ExternalLink size={15} /></a>
          </article>
        </div>
      </section>

      <section className="workflow-band" id="sa-fungerar-det">
        <div className="content-section">
          <div className="section-intro light reveal">
            <span className="section-number">03 / SÅ FUNGERAR DET</span>
            <h2>Från ändrad källtext till ett tryggt beslut.</h2>
            <p>Automatisera letandet. Behåll människan där omdömet spelar roll.</p>
          </div>
          <div className="workflow-line stagger">
            {workflow.map(({ icon: Icon, step, title, body }) => (
              <article key={step}>
                <div className="workflow-icon"><Icon size={20} /></div>
                <span>{step}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="content-section outcomes-section">
        <div className="section-intro reveal">
          <span className="section-number">04 / RESULTATET</span>
          <h2>Mer kontroll utan mer kontrollarbete.</h2>
        </div>
        <div className="outcome-grid stagger">
          {outcomes.map(([title, body], index) => (
            <article key={title}>
              <span>0{index + 1}</span>
              <CheckCircle2 size={24} />
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="source-section" id="kallor">
        <div className="content-section source-layout">
          <div className="section-intro reveal">
            <span className="section-number">05 / KÄLLOR</span>
            <h2>Primärkällan först.</h2>
            <p>RuleRadar börjar där regeln faktiskt publiceras. Varje bevakning sparar URL, snapshot och tidpunkt så att teamet kan verifiera underlaget.</p>
            <Link className="text-link" href="/sample-alerts">Granska ett alert-exempel <ArrowRight size={16} /></Link>
          </div>
          <div className="source-list stagger">
            {enabledSources.slice(0, 6).map((source, index) => (
              <a href={source.url} target="_blank" rel="noreferrer" key={source.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{source.agency}</strong><small>{swedishSourceName(source.name)}</small></div>
                <span className="source-topics">{source.topics.slice(0, 2).map(swedishTopic).join(" · ")}</span>
                <ExternalLink size={16} />
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="content-section trust-section">
        <div className="trust-copy reveal">
          <span className="section-number">06 / FÖRTROENDE</span>
          <h2>Byggd för information som måste gå att kontrollera.</h2>
          <p>Ingen svart låda. Varje alert visar källa och evidens, och riskfyllda ändringar kan stoppas för mänsklig granskning före leverans.</p>
          <Link className="text-link" href="/security">Läs om säkerhet och databehandling <ArrowRight size={16} /></Link>
        </div>
        <div className="trust-controls stagger">
          <div><ShieldCheck size={22} /><span><strong>Spårbar evidens</strong><small>URL, tidsstämpel, snapshot och ändringsutdrag.</small></span></div>
          <div><UserCheck size={22} /><span><strong>Mänsklig kontroll</strong><small>Hög påverkan och låg säkerhet går till granskning.</small></span></div>
          <div><FileCheck2 size={22} /><span><strong>Dataminimering</strong><small>Ingen individbaserad lönedata behövs för källbevakningen.</small></span></div>
          <div><Clock3 size={22} /><span><strong>Revisionsspår</strong><small>Beslut, leveransstatus och underlag hålls samman.</small></span></div>
        </div>
      </section>

      <section className="pricing-callout">
        <div className="pricing-callout-copy reveal">
          <span className="section-number">07 / KOM IGÅNG</span>
          <h2>Börja med teamet som faktiskt granskar reglerna.</h2>
          <p>Team-planen ger upp till fem användare, omedelbara alertar och gemensam granskningsstatus.</p>
          <ul>
            <li><Check size={17} /> 14 dagars kostnadsfri provperiod</li>
            <li><Check size={17} /> Ingen bindningstid</li>
            <li><Check size={17} /> Hantera eller avsluta själv i Stripe</li>
          </ul>
        </div>
        <div className="featured-price reveal">
          <span className="price-tag">REKOMMENDERAD</span>
          <div><strong>Team</strong><small>För löne- och redovisningsteam</small></div>
          <p><b>799 kr</b> / månad</p>
          <small>exkl. moms · upp till 5 användare</small>
          <Link className="button primary button-large" href="/signup?plan=team">Starta gratis <ArrowRight size={18} /></Link>
          <Link className="price-link" href="/pricing">Jämför alla planer</Link>
        </div>
      </section>

      <section className="content-section faq-preview">
        <div className="section-intro reveal">
          <span className="section-number">08 / VANLIGA FRÅGOR</span>
          <h2>Det viktigaste innan ni börjar.</h2>
        </div>
        <div className="faq-accordion stagger">
          {faqs.map(([question, answer], index) => (
            <details key={question} open={index === 0}>
              <summary><span>{String(index + 1).padStart(2, "0")}</span>{question}<b>+</b></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
        <Link className="text-link" href="/faq">Se alla vanliga frågor <ArrowRight size={16} /></Link>
      </section>

      <section className="final-cta">
        <div className="final-cta-signal"><Radar size={28} /><span></span></div>
        <div>
          <span className="section-number">REDO ATT TESTA?</span>
          <h2>Gör nästa regeländring enklare att hantera.</h2>
          <p>Sätt upp er arbetsyta, välj alertmottagare och prova hela flödet i 14 dagar.</p>
        </div>
        <Link className="button light button-large" href="/signup?plan=team">Starta gratis <ArrowRight size={18} /></Link>
      </section>
    </main>
  );
}

function swedishSourceName(name: string) {
  const labels: Record<string, string> = {
    "Employer hub": "Arbetsgivaringång",
    "Employer contributions": "Arbetsgivaravgifter",
    "Employer contributions guidance": "Vägledning för arbetsgivaravgifter",
    "Employer news": "Nyheter för arbetsgivare",
    "News archive": "Nyhetsarkiv",
    "Agreements and publications": "Avtal och publikationer"
  };
  return labels[name] || name;
}

function swedishTopic(topic: string) {
  const labels: Record<string, string> = {
    payroll: "lön",
    employer_declaration: "AGI",
    employer_contributions: "arbetsgivaravgifter",
    tax_rate: "skattesats",
    absence_reporting: "frånvaro",
    sick_leave: "sjukfrånvaro",
    rehabilitation: "rehabilitering",
    annual_reports: "årsredovisning",
    fees: "avgifter",
    company_filings: "bolagsärenden",
    work_environment: "arbetsmiljö",
    employer_rules: "arbetsgivarregler",
    occupational_safety: "arbetarskydd"
  };
  return labels[topic] || topic.replace(/_/g, " ");
}

function plansForStructuredData() {
  return [
    { "@type": "Offer", name: "Solo", price: "399", priceCurrency: "SEK" },
    { "@type": "Offer", name: "Team", price: "799", priceCurrency: "SEK" },
    { "@type": "Offer", name: "Flera kontor", price: "1499", priceCurrency: "SEK" }
  ];
}
