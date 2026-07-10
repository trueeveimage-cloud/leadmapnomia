import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";

export const metadata: Metadata = { title: "Återställ lösenord" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams?: Promise<{ sent?: string }> }) {
  const params = await searchParams;
  return (
    <main className="inner-page auth-page compact-auth">
      <section className="auth-form card">
        <div className="auth-form-head"><Mail size={22} /><div><h1>Återställ lösenord.</h1><p>Vi skickar en säker länk om adressen finns i RuleRadar.</p></div></div>
        {params?.sent ? <p className="form-success">Kontrollera inkorgen. Av säkerhetsskäl visar vi samma besked även om adressen inte finns.</p> : (
          <form action="/api/auth/forgot-password" method="post"><label className="form-row">E-post<input className="input" name="email" type="email" autoComplete="email" required /></label><button className="button primary button-large form-submit" type="submit">Skicka återställningslänk</button></form>
        )}
        <p className="auth-switch"><Link href="/login"><ArrowLeft size={13} /> Tillbaka till inloggning</Link></p>
      </section>
    </main>
  );
}
