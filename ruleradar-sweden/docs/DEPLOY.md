# Deploy

## Local

```bash
cp env.example .env
npm install
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev
```

Run the worker in a second terminal:

```bash
npm run worker
```

## Render

1. Create a new Blueprint from `infra/render/render.yaml`.
2. Set `APP_URL`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, OpenAI, Stripe, Resend, and sender email environment variables.
3. Confirm the managed Postgres connection is injected as `DATABASE_URL`.
4. Deploy the web container. Its startup command runs the idempotent `db:migrate` and `db:seed` tasks, starts the monitoring worker, and then starts Next. This works on Render's free tier where shell and pre-deploy commands are unavailable.
5. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before the first deploy to create the platform admin. Later seed runs preserve an existing password when `ADMIN_PASSWORD` is absent.
6. Configure Stripe Customer Portal so customers can update payment methods from `/app/settings`.
7. Configure Stripe webhook URL: `https://your-app.example/api/billing/webhook` and subscribe at minimum to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded`, and `invoice.payment_action_required`.
8. Configure Resend domain DNS, SPF, and DKIM before sending production alerts.
9. Confirm all migrations through `0007_digest_delivery_runs.sql` ran before testing signup, password reset, team invites, Stripe webhooks, or daily digests.
10. Open `/admin` and require `5/5 system klara` before paid traffic is enabled.
11. Open `/api/health/worker` and require HTTP 200 with no stale or degraded sources.

## Domain Cutover

1. Add the custom domain to the Render web service.
2. Copy Render's DNS target into the domain provider and wait for TLS verification.
3. Change `APP_URL` to the final `https://` domain.
4. Update the Stripe webhook endpoint and customer portal return URLs.
5. Update the Resend sender domain and `ALERT_FROM_EMAIL`.
6. Redeploy, then verify `/api/health`, signup, reset-password email, checkout, portal, and one alert delivery.

## Backups

Render paid Postgres plans provide managed backups and PITR windows. Also run:

```bash
npm run backup:logical
```

Ship compressed logical backups to object storage nightly.

## Free-tier limitation

The bundled monitoring worker runs every 30 minutes while the web instance is awake. Render free web services sleep during inactivity, so strict around-the-clock monitoring requires an always-on instance or an external scheduler calling `/api/cron/scan` with `SYSTEM_CRON_SECRET`.

The worker scans every enabled source unless `SCAN_LIMIT` is deliberately configured. Digest-only recipients receive one consolidated email after 07:00 Europe/Stockholm when approved changes are pending.

## Zero-Downtime Notes

Keep migrations additive for the MVP. Add nullable columns first, backfill separately, then enforce constraints in a later deploy.
