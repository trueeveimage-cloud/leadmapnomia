# Beta Start Guide

This is the operator checklist for moving RuleRadar Sweden from local MVP to paid beta.

## 1. Accounts You Need Open

- Render for hosting, Postgres, worker, and cron.
- Stripe for paid trial subscriptions.
- Resend for alert email sending.
- OpenAI for structured summaries.
- Domain/DNS provider for app URL and email DNS records.

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

Open:

- `http://localhost:3000`
- `http://localhost:3000/admin`
- `http://localhost:3000/admin/review`
- `http://localhost:3000/app`

## 3. Render Setup

Use the root `render.yaml`. It points every service at the `ruleradar-sweden/` monorepo folder.

Set these variables:

- `APP_URL`
- `DATABASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `RESEND_API_KEY`
- `ALERT_FROM_EMAIL`
- `ADMIN_ALERT_EMAIL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_SOLO_PRICE_ID`
- `STRIPE_TEAM_PRICE_ID`
- `STRIPE_MULTI_OFFICE_PRICE_ID`
- `SYSTEM_CRON_SECRET`
- `SESSION_SECRET`

After first deploy:

```bash
npm run db:migrate
npm run db:seed
```

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
- Do not publish, push, deploy, or email real customers without explicit owner approval.
