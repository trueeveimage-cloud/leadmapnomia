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
2. Set `APP_URL`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, OpenAI, Stripe, Resend, sender email, and the four `LEGAL_*` environment variables.
3. Confirm the managed Postgres connection is injected as `DATABASE_URL`.
4. Deploy the web container. Its startup command runs the idempotent `db:migrate` and `db:seed` tasks, starts the monitoring worker, and then starts Next. This works on Render's free tier where shell and pre-deploy commands are unavailable.
5. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before the first deploy to create the platform admin. Later seed runs preserve an existing password when `ADMIN_PASSWORD` is absent.
6. Configure Stripe Customer Portal so customers can update payment methods from `/app/settings`.
7. Configure Stripe webhook URL: `https://your-app.example/api/billing/webhook` and subscribe at minimum to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded`, and `invoice.payment_action_required`.
8. Configure Resend domain DNS, SPF, and DKIM before sending production alerts.
9. Confirm all migrations through `0007_digest_delivery_runs.sql` ran before testing signup, password reset, team invites, Stripe webhooks, or daily digests.
10. Open `/admin` and require every readiness item to be `Klar` before paid traffic is enabled. Test Stripe keys are deliberately reported as not ready.
11. Open `/api/health` and require HTTP 200 with every expected migration applied, then open `/api/health/worker` and require HTTP 200 with no stale or degraded sources.

## Domain Cutover

1. Add the custom domain to the Render web service.
2. Copy Render's DNS target into the domain provider and wait for TLS verification.
3. Change `APP_URL` to the final `https://` domain.
4. Update the Stripe webhook endpoint and customer portal return URLs.
5. Update the Resend sender domain and `ALERT_FROM_EMAIL`.
6. Redeploy, then verify `/api/health`, signup, reset-password email, checkout, portal, and one alert delivery.

## Backups

Render paid Postgres plans provide managed backups and PITR windows. The application image includes the PostgreSQL client, so a logical archive can also be created with:

```bash
npm run backup:logical
```

The command creates a compressed PostgreSQL custom-format archive and a SHA-256 manifest. Verify the newest archive without modifying a database:

```bash
npm run backup:verify
```

Ship both the `.dump` and `.dump.json` files to access-controlled object storage nightly. At least quarterly, restore the archive into a temporary empty Postgres database, run the web and worker health checks against it, and then delete the temporary database. A checksum/list verification is necessary but does not replace the quarterly restore drill.

## Free-tier limitation

The bundled monitoring worker runs every 30 minutes while the web instance is awake. Render free web services sleep during inactivity, so strict around-the-clock monitoring requires an always-on instance or an external scheduler calling `/api/cron/scan` with `SYSTEM_CRON_SECRET`.

The worker scans every enabled source unless `SCAN_LIMIT` is deliberately configured. Digest-only recipients receive one consolidated email after 07:00 Europe/Stockholm when approved changes are pending.

## Zero-Downtime Notes

Keep migrations additive for the MVP. Add nullable columns first, backfill separately, then enforce constraints in a later deploy.
