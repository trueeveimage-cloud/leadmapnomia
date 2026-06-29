# RuleRadar Sweden

RuleRadar Sweden is a focused B2B SaaS MVP for Swedish accounting and payroll firms. It monitors official government sources, detects changes in pages and PDFs, produces structured AI summaries, and sends reviewable email alerts with source links and diff excerpts.

## Stack

- Node.js 22 and TypeScript
- Next.js 15 App Router for marketing, customer app, admin, and API routes
- Postgres with Drizzle schema and SQL migrations
- Database-backed scan jobs for v1
- OpenAI Responses API with strict JSON schema output
- Resend email delivery abstraction
- Stripe Checkout, portal, and webhook sync
- Render Blueprint plus Docker Compose for local development

## Quick Start

```bash
cp env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Run a one-off scan:

```bash
npm run scan:run
```

For the paid beta setup sequence, use `docs/BETA_START.md`.

Run verification:

```bash
npm run typecheck
npm test
npm run build
```

The app intentionally falls back to seeded fixture data when `DATABASE_URL` is absent so UI and tests remain inspectable without live infrastructure. Production paths require a real Postgres database, Stripe secrets, Resend key, and OpenAI key.
