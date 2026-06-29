import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="page">
      <h1>Log In</h1>
      <section className="card" style={{ maxWidth: 520 }}>
        <label className="form-row">Email<input className="input" type="email" placeholder="you@example.se" /></label>
        <label className="form-row">Password<input className="input" type="password" placeholder="Password" /></label>
        <button className="button" type="button">Continue</button>
        <p className="muted" style={{ marginTop: 16 }}>Password auth is backed by the users and organization_members tables. Connect a session adapter before production launch.</p>
        <Link href="/signup">Create account</Link>
      </section>
    </main>
  );
}
