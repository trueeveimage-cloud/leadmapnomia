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
4. Let the web service run `npm run db:migrate` as the pre-deploy command.
5. Run `npm run db:seed` as a one-off job after the first deploy. This creates/updates the platform admin user from `ADMIN_EMAIL` and sets its password when `ADMIN_PASSWORD` is present.
6. Configure Stripe Customer Portal so customers can update payment methods from `/app/settings`.
7. Configure Stripe webhook URL: `https://your-app.example/api/billing/webhook` and subscribe at minimum to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded`, and `invoice.payment_action_required`.
8. Configure Resend domain DNS, SPF, and DKIM before sending production alerts.
9. Confirm all migrations through `0006_release_observability.sql` ran before testing signup, password reset, team invites, or Stripe webhooks.
10. Open `/admin` and require `5/5 system klara` before paid traffic is enabled.

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

## Zero-Downtime Notes

Keep migrations additive for the MVP. Add nullable columns first, backfill separately, then enforce constraints in a later deploy.
