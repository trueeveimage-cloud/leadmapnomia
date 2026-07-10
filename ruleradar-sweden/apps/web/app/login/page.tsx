import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";

export const metadata: Metadata = { title: "Logga in" };

export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const next = safeNext(params?.next);

  return (
    <main className="inner-page auth-page compact-auth">
      <section className="auth-form card">
        <div className="auth-form-head"><LockKeyhole size={22} /><div><h1>Välkommen tillbaka.</h1><p>Logga in i er RuleRadar-arbetsyta.</p></div></div>
        {params?.error === "invalid" ? <p className="form-error">E-postadressen eller lösenordet stämmer inte.</p> : null}
        {params?.error === "rate" ? <p className="form-error">För många inloggningsförsök. Vänta några minuter och försök igen.</p> : null}
        <form action={`/api/auth/login?next=${encodeURIComponent(next)}`} method="post">
          <label className="form-row">E-post<input className="input" name="email" type="email" placeholder="namn@foretag.se" autoComplete="email" required /></label>
          <label className="form-row">Lösenord <Link className="forgot-link" href="/forgot-password">Glömt lösenordet?</Link><input className="input" name="password" type="password" autoComplete="current-password" required /></label>
          <button className="button primary button-large form-submit" type="submit">Logga in <ArrowRight size={18} /></button>
        </form>
        <p className="auth-switch">Nytt team? <Link href="/signup?plan=team">Starta 14 dagar gratis</Link></p>
      </section>
    </main>
  );
}

function safeNext(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/app";
}
