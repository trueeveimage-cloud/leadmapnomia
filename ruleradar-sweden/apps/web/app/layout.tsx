import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "RuleRadar Sweden",
  description: "Official Swedish payroll, tax, and filing change alerts for accounting and payroll firms."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <Link className="brand" href="/">
              <span className="mark">RR</span>
              <span>RuleRadar Sweden</span>
            </Link>
            <nav className="nav" aria-label="Main navigation">
              <Link href="/sample-alerts">Sample alerts</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/faq">FAQ</Link>
              <Link href="/app">Demo dashboard</Link>
            </nav>
          </header>
          {children}
          <footer className="footer">
            <div>
              <strong>RuleRadar Sweden</strong>
              <p>Official-source change monitoring for Swedish accounting and payroll teams. Demo data is illustrative until live monitoring is enabled.</p>
            </div>
            <nav className="footer-links" aria-label="Footer navigation">
              <Link href="/sample-alerts">Sample alerts</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/admin">Ops console</Link>
            </nav>
          </footer>
        </div>
      </body>
    </html>
  );
}
