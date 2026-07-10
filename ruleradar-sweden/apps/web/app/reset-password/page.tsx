import type { Metadata } from "next";
import { KeyRound } from "lucide-react";

export const metadata: Metadata = { title: "Välj nytt lösenord" };

export default async function ResetPasswordPage({ searchParams }: { searchParams?: Promise<{ token?: string; error?: string }> }) {
  const params = await searchParams;
  const token = params?.token || "";
  return (
    <main className="inner-page auth-page compact-auth">
      <section className="auth-form card">
        <div className="auth-form-head"><KeyRound size={22} /><div><h1>Välj nytt lösenord.</h1><p>Länken kan användas en gång och gäller i 60 minuter.</p></div></div>
        {params?.error ? <p className="form-error">Länken är ogiltig eller har gått ut. Begär en ny återställningslänk.</p> : null}
        {!token ? <p className="form-error">Återställningslänken saknar en giltig token.</p> : (
          <form action="/api/auth/reset-password" method="post"><input type="hidden" name="token" value={token} /><label className="form-row">Nytt lösenord<input className="input" name="password" type="password" minLength={10} autoComplete="new-password" required /></label><label className="form-row">Bekräfta lösenord<input className="input" name="passwordConfirm" type="password" minLength={10} autoComplete="new-password" required /></label><button className="button primary button-large form-submit" type="submit">Spara och logga in</button></form>
        )}
      </section>
    </main>
  );
}
