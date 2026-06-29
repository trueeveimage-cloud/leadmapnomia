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
2. Set `APP_URL`, OpenAI, Stripe, Resend, and sender email environment variables.
3. Confirm the managed Postgres connection is injected as `DATABASE_URL`.
4. Let the web service run `npm run db:migrate` as the pre-deploy command.
5. Run `npm run db:seed` as a one-off job after the first deploy.
6. Configure Stripe webhook URL: `https://your-app.example/api/billing/webhook`.
7. Configure Resend domain DNS, SPF, and DKIM before sending production alerts.

## Backups

Render paid Postgres plans provide managed backups and PITR windows. Also run:

```bash
npm run backup:logical
```

Ship compressed logical backups to object storage nightly.

## Zero-Downtime Notes

Keep migrations additive for the MVP. Add nullable columns first, backfill separately, then enforce constraints in a later deploy.
