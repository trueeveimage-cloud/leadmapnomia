import type { Metadata } from "next";
import Link from "next/link";
import { UserCheck } from "lucide-react";

export const metadata: Metadata = { title: "Acceptera inbjudan" };

export default async function JoinPage({ searchParams }: { searchParams?: Promise<{ token?: string; error?: string }> }) {
  const params = await searchParams;
  const token = params?.token || "";
  return (
    <main className="inner-page auth-page compact-auth">
      <section className="auth-form card">
        <div className="auth-form-head"><UserCheck size={22} /><div><h1>Anslut till teamet.</h1><p>Skapa din inloggning för den arbetsyta du har blivit inbjuden till.</p></div></div>
        {params?.error ? <p className="form-error">{params.error === "workspace" ? "E-postadressen tillhör redan en annan arbetsyta. Kontakta support för hjälp." : "Inbjudan är ogiltig, använd eller har gått ut."}</p> : null}
        {!token ? <p className="form-error">Inbjudningslänken saknar en giltig token.</p> : <form action="/api/team/accept" method="post"><input type="hidden" name="token" value={token} /><label className="form-row">Ditt namn<input className="input" name="name" autoComplete="name" required /></label><label className="form-row">Välj lösenord<input className="input" name="password" type="password" minLength={10} autoComplete="new-password" required /></label><label className="form-row">Bekräfta lösenord<input className="input" name="passwordConfirm" type="password" minLength={10} autoComplete="new-password" required /></label><label className="checkbox-row"><input type="checkbox" name="termsAccepted" value="yes" required /><span>Jag godkänner <Link href="/terms">användarvillkoren</Link> och har läst <Link href="/privacy">integritetspolicyn</Link>.</span></label><button className="button primary button-large form-submit" type="submit">Acceptera och logga in</button></form>}
      </section>
    </main>
  );
}
