import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import { ScrollEffects } from "./scroll-effects";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans"
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"]
});

export const metadata: Metadata = {
  title: "RuleRadar Sweden",
  description: "Official Swedish payroll, tax, and filing change alerts for accounting and payroll firms."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html className={`${inter.variable} ${plexMono.variable}`} lang="en">
      <body>
        <ScrollEffects />
        <div className="shell">
          <header className="topbar">
            <Link className="brand" href="/">
              <span className="mark">RR</span>
              <span>RuleRadar Sweden</span>
            </Link>
            <nav className="nav" aria-label="Main navigation">
              <Link href="/sample-alerts">Evidence</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/faq">FAQ</Link>
              <Link className="nav-cta" href="/app">Open demo</Link>
            </nav>
          </header>
          {children}
          <footer className="footer">
            <div>
              <strong>RuleRadar Sweden</strong>
              <p>Official-source change monitoring for Swedish accounting and payroll teams. Demo data is illustrative until live monitoring is enabled.</p>
            </div>
            <nav className="footer-links" aria-label="Footer navigation">
              <Link href="/sample-alerts">Evidence</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/admin">Ops console</Link>
            </nav>
          </footer>
        </div>
      </body>
    </html>
  );
}
