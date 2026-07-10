import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Menu, Radar } from "lucide-react";
import { ConversionTracker } from "./conversion-tracker";
import "./globals.css";

const publicUrl = process.env.APP_URL || "https://ruleradar.se";

export const metadata: Metadata = {
  metadataBase: new URL(publicUrl),
  title: {
    default: "RuleRadar | Regelbevakning för svensk lön och redovisning",
    template: "%s | RuleRadar"
  },
  description: "RuleRadar bevakar svenska myndighetskällor och gör regeländringar begripliga, spårbara och redo för granskning.",
  openGraph: {
    type: "website",
    locale: "sv_SE",
    siteName: "RuleRadar Sweden",
    title: "Regelbevakning för svensk lön och redovisning",
    description: "Upptäck viktiga ändringar i svenska myndighetskällor innan de blir kundfel."
  },
  robots: { index: true, follow: true }
};

const mainLinks = [
  ["Produkt", "/#produkt"],
  ["Så fungerar det", "/#sa-fungerar-det"],
  ["Källor", "/#kallor"],
  ["Pris", "/pricing"],
  ["Säkerhet", "/security"]
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>
        <Suspense fallback={null}><ConversionTracker /></Suspense>
        <div className="shell">
          <header className="topbar">
            <Link className="brand" href="/" aria-label="RuleRadar startsida">
              <span className="mark"><Radar size={19} strokeWidth={2.2} /></span>
              <span className="brand-name">RuleRadar <small>SWEDEN</small></span>
            </Link>

            <nav className="desktop-nav" aria-label="Huvudnavigation">
              {mainLinks.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
            </nav>

            <div className="nav-actions">
              <Link className="nav-login" href="/login">Logga in</Link>
              <Link className="nav-cta" href="/signup?plan=team">Prova gratis</Link>
              <details className="mobile-nav">
                <summary aria-label="Öppna meny" title="Meny"><Menu size={20} /></summary>
                <nav aria-label="Mobilnavigation">
                  {mainLinks.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
                  <Link href="/login">Logga in</Link>
                  <Link className="mobile-menu-cta" href="/signup?plan=team">Prova gratis</Link>
                </nav>
              </details>
            </div>
          </header>

          {children}

          <footer className="footer">
            <div className="footer-brand">
              <Link className="brand" href="/">
                <span className="mark"><Radar size={19} /></span>
                <span className="brand-name">RuleRadar <small>SWEDEN</small></span>
              </Link>
              <p>Regelbevakning med primärkällan kvar. Byggt för svenska löne- och redovisningsteam.</p>
              <span className="footer-note">Informationsverktyg, inte juridisk rådgivning.</span>
            </div>
            <nav className="footer-column" aria-label="Produktlänkar">
              <strong>Produkt</strong>
              <Link href="/#produkt">Översikt</Link>
              <Link href="/sample-alerts">Exempelalert</Link>
              <Link href="/pricing">Priser</Link>
              <Link href="/faq">Vanliga frågor</Link>
            </nav>
            <nav className="footer-column" aria-label="Förtroendelänkar">
              <strong>Förtroende</strong>
              <Link href="/security">Säkerhet</Link>
              <Link href="/privacy">Integritet</Link>
              <Link href="/terms">Villkor</Link>
              <Link href="/contact">Kontakt</Link>
            </nav>
            <div className="footer-column">
              <strong>Kom igång</strong>
              <Link href="/signup?plan=team">Starta provperiod</Link>
              <Link href="/login">Kundinloggning</Link>
              <a href="mailto:hello@ruleradar.se">hello@ruleradar.se</a>
            </div>
          </footer>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} RuleRadar Sweden</span>
            <span>Stockholm, Sverige</span>
          </div>
        </div>
      </body>
    </html>
  );
}
