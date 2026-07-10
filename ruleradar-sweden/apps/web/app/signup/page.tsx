import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, LockKeyhole, ShieldCheck } from "lucide-react";

export const metadata: Metadata = { title: "Starta provperiod" };

const planNames: Record<string, string> = { solo: "Solo", team: "Team", multi_office: "Flera kontor" };
const planPrices: Record<string, string> = { solo: "399 kr", team: "799 kr", multi_office: "1 499 kr" };

export default async function SignupPage({ searchParams }: { searchParams?: Promise<{ plan?: string; error?: string }> }) {
  const params = await searchParams;
  const plan = normalizePlan(params?.plan);
  const error = signupError(params?.error);

  return (
    <main className="inner-page auth-page">
      <div className="auth-layout">
        <section className="auth-copy">
          <div className="kicker">14 dagar kostnadsfritt</div>
          <h1>Skapa er bevakningsyta.</h1>
          <p className="hero-lead">Ett konto tar någon minut. Därefter öppnas Stripe för att aktivera provperioden för vald plan.</p>
          <div className="auth-benefits">
            <span><Check size={17} /> Primärkällan och evidens i varje alert</span>
            <span><Check size={17} /> Mänsklig kontroll för riskfyllda ändringar</span>
            <span><Check size={17} /> Avsluta själv innan första debiteringen</span>
          </div>
          <div className="selected-plan">
            <span>VALD PLAN</span>
            <strong>{planNames[plan]}</strong>
            <p><b>{planPrices[plan]}</b> / månad, exkl. moms</p>
            <Link href="/pricing">Byt plan</Link>
          </div>
        </section>

        <section className="auth-form card">
          <div className="auth-form-head"><ShieldCheck size={22} /><div><h2>Starta provperiod</h2><p>Ingen debitering under de första 14 dagarna.</p></div></div>
          {error ? <p className="form-error">{error}</p> : null}
          <form action={`/api/beta/signup?plan=${plan}`} method="post">
            <input type="hidden" name="plan" value={plan} />
            <label className="form-row">Företagsnamn<input name="organizationName" className="input" placeholder="Exempel Redovisning AB" autoComplete="organization" required /></label>
            <label className="form-row">Ditt namn<input name="name" className="input" placeholder="För- och efternamn" autoComplete="name" required /></label>
            <label className="form-row">E-post på arbetet<input name="email" className="input" type="email" placeholder="namn@foretag.se" autoComplete="email" required /></label>
            <label className="form-row">Lösenord<input name="password" className="input" type="password" minLength={10} placeholder="Minst 10 tecken" autoComplete="new-password" required /></label>
            <label className="checkbox-row"><input type="checkbox" name="termsAccepted" value="yes" required /><span>Jag godkänner <Link href="/terms">användarvillkoren</Link> och har läst <Link href="/privacy">integritetspolicyn</Link>.</span></label>
            <button className="button primary button-large form-submit" type="submit">Fortsätt till säker betalning <ArrowRight size={18} /></button>
          </form>
          <p className="form-security"><LockKeyhole size={14} /> Lösenordet krypteras. Kortuppgifter hanteras av Stripe.</p>
          <p className="auth-switch">Har du redan ett konto? <Link href="/login">Logga in</Link></p>
        </section>
      </div>
    </main>
  );
}

function normalizePlan(plan?: string) {
  return plan === "solo" || plan === "multi_office" || plan === "team" ? plan : "team";
}

function signupError(error?: string) {
  if (error === "exists") return "E-postadressen har redan ett konto. Logga in i stället eller använd en annan adress.";
  if (error === "terms") return "Du behöver godkänna villkoren för att skapa kontot.";
  if (error === "invalid") return "Kontrollera att alla uppgifter är korrekt ifyllda och att lösenordet har minst 10 tecken.";
  if (error === "rate") return "För många försök på kort tid. Vänta några minuter och försök igen.";
  if (error === "setup") return "Kontoregistreringen är tillfälligt otillgänglig. Kontakta oss så hjälper vi dig.";
  return "";
}
