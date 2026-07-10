import type { Metadata } from "next";
import { Mail, Send } from "lucide-react";

export const metadata: Metadata = { title: "Kontakt" };

export default async function ContactPage({ searchParams }: { searchParams?: Promise<{ sent?: string; error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="inner-page auth-page">
      <div className="auth-layout contact-layout">
        <section className="auth-copy"><div className="kicker">Kontakt</div><h1>Berätta hur ni bevakar regler i dag.</h1><p className="hero-lead">Vi svarar konkret på frågor om källor, arbetsflöde, säkerhet eller vilken plan som passar.</p><div className="contact-direct"><Mail size={19} /><div><strong>E-post</strong><a href="mailto:hello@ruleradar.se">hello@ruleradar.se</a><small>Normalt svar inom en arbetsdag.</small></div></div></section>
        <section className="auth-form card">
          <div className="auth-form-head"><Send size={22} /><div><h2>Skicka en fråga</h2><p>Inga säljknep. Vi svarar på det ni faktiskt frågar.</p></div></div>
          {params?.sent === "1" ? <p className="form-success">Tack. Meddelandet är mottaget och vi återkommer via e-post.</p> : null}
          {params?.error ? <p className="form-error">Meddelandet kunde inte skickas. Försök igen eller mejla hello@ruleradar.se.</p> : null}
          <form action="/api/contact" method="post">
            <label className="form-row">Namn<input className="input" name="name" autoComplete="name" required /></label>
            <label className="form-row">E-post på arbetet<input className="input" name="email" type="email" autoComplete="email" required /></label>
            <label className="form-row">Företag<input className="input" name="company" autoComplete="organization" required /></label>
            <label className="form-row">Teamstorlek<select className="input" name="teamSize" defaultValue="2-5"><option value="1">1 person</option><option value="2-5">2–5 personer</option><option value="6-15">6–15 personer</option><option value="16+">16+ personer</option></select></label>
            <label className="form-row">Vad vill ni lösa?<textarea className="input" name="message" placeholder="Beskriv vilka källor eller arbetsflöden som tar mest tid..." required /></label>
            <label className="honeypot" aria-hidden="true">Webbplats<input name="website" tabIndex={-1} autoComplete="off" /></label>
            <button className="button primary button-large form-submit" type="submit">Skicka meddelande <Send size={17} /></button>
          </form>
        </section>
      </div>
    </main>
  );
}
