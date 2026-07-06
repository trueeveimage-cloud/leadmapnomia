# Beta Start Guide

This is the operator checklist for moving RuleRadar Sweden from local MVP to paid beta.

## 1. Accounts You Need Open

- Render for the free public demo web app.
- Stripe for paid trial subscriptions later.
- Resend for alert email sending later.
- OpenAI for structured summaries later.
- Domain/DNS provider for app URL and email DNS records later.

Do not paste passwords into the repo. Add API keys as environment variables in Render or local `.env`.

## 2. Local Beta Setup

```bash
cp env.example .env
npm install
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev
```

Then run a worker pass:

```bash
npm run scan:run
```

Or run the same pipeline through the protected web cron endpoint:

```bash
curl -X POST http://localhost:3000/api/cron/scan \
  -H "Authorization: Bearer $SYSTEM_CRON_SECRET"
```

Open:

- `http://localhost:3000`
- `http://localhost:3000/admin`
- `http://localhost:3000/admin/review`
- `http://localhost:3000/app`

## 3. Render Free Demo Setup

Use the root `render.yaml`. It deploys one free Render web service from the `ruleradar-sweden/` monorepo folder.

The free demo intentionally does not create paid Postgres, worker, or cron services. Without `DATABASE_URL`, the app serves fixture data so the UI can be reviewed without infrastructure cost.

After the demo is live, add these when you are ready for real summaries, email, and paid checkout:

- `APP_URL`
- `DATABASE_URL`
- `SYSTEM_CRON_SECRET`
- `SESSION_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `RESEND_API_KEY`
- `ADMIN_ALERT_EMAIL`
- `ALERT_FROM_EMAIL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_SOLO_PRICE_ID`
- `STRIPE_TEAM_PRICE_ID`
- `STRIPE_MULTI_OFFICE_PRICE_ID`

When you upgrade to the paid beta infrastructure, add managed Postgres, run:

```bash
npm run db:migrate
npm run db:seed
```

Then extend the Blueprint with managed Postgres, the background worker, and the scan cron when you intentionally move to paid beta infrastructure. The cron should call:

```text
POST /api/cron/scan
Authorization: Bearer YOUR_SYSTEM_CRON_SECRET
```

Optional query parameters:

- `sourceLimit=10`
- `deliveryLimit=25`
- `deliverApproved=false` for scan-only runs

## 4. Paid Beta Setup

Stripe products:

- Solo: SEK 399/month
- Team: SEK 799/month
- Multi-office: SEK 1,499/month

Beta default:

- 14-day trial
- Team plan as default founder-led onboarding
- Manual review for every high-impact alert

Configure Stripe webhook:

```text
https://YOUR_APP_URL/api/billing/webhook
```

## 5. Email Setup

In Resend:

- Verify sending domain.
- Add SPF/DKIM DNS records.
- Send only internal test alerts first.

Production alert rule:

- No customer alert sends until a change is stored, summarized, reviewed when required, and approved.
- If `RESEND_API_KEY` is missing, approved alert deliveries stay queued as `queued_missing_resend_key`; they are not marked sent.

## 6. First Outreach Batch

Start with 100 firms:

- 50 payroll/payroll-bureau firms.
- 50 accounting firms.

Track:

- emails sent
- replies
- demos booked
- trials started
- paid conversions

After 2 weeks, focus on whichever segment books more demos and asks fewer "why would we need this?" questions.

## 7. Beta Safety Rules

- Keep SMS off unless a customer specifically pays for critical alerts.
- Treat OpenAI summaries as drafts until reviewed for high-impact topics.
- Every alert must include official source URL and "not legal advice" language.
- Approval attempts delivery immediately, but only for approved alerts and only when Resend is configured.
- Do not publish, push, deploy, or email real customers without explicit owner approval.
