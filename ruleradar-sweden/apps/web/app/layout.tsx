import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "RuleRadar Sweden",
  description: "Official Swedish payroll, tax, and filing change alerts for accounting firms."
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
              <Link href="/app">Dashboard</Link>
              <Link href="/admin">Admin</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
