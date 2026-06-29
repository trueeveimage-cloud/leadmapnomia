import Link from "next/link";

export default function SignupPage() {
  return (
    <main className="page">
      <h1>Start Trial</h1>
      <section className="card" style={{ maxWidth: 560 }}>
        <form action="/api/beta/signup" method="post">
          <label className="form-row">Firm name<input name="organizationName" className="input" placeholder="Accounting firm AB" required /></label>
          <label className="form-row">Your name<input name="name" className="input" placeholder="Maged" /></label>
          <label className="form-row">Work email<input name="email" className="input" type="email" placeholder="you@example.se" required /></label>
          <button className="button" type="submit">Create workspace</button>
        </form>
        <p className="muted" style={{ marginTop: 16 }}>This creates a 14-day beta workspace, owner user, trialing Team subscription record, and alert recipient. Password/session auth can be connected before public traffic.</p>
        <Link href="/login">Already have an account?</Link>
      </section>
    </main>
  );
}
