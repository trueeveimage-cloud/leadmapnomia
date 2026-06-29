# Architecture

RuleRadar Sweden is split into a Next.js web service, a background worker, shared domain packages, and Postgres.

## Services

- `apps/web`: marketing site, customer dashboard, admin panel, API routes, Stripe endpoints, health checks.
- `apps/worker`: scheduled scanner loop and one-off scan runner.
- `packages/db`: Drizzle schema, SQL migration, seed data for plans and official sources.
- `packages/monitoring`: fetchers, HTML/PDF text extraction, normalization, hashing, diffing, and severity rules.
- `packages/ai`: OpenAI Responses API integration with strict JSON schema validation and fallback summaries.
- `packages/notifications`: transactional email templates and Resend delivery.
- `packages/shared`: config validation, structured logging, common types, security helpers.

## Flow

1. Cron or worker selects enabled sources.
2. Fetcher retrieves HTML or PDF content using a RuleRadar user agent.
3. Normalizer removes page noise, canonicalizes text, and hashes content.
4. Diff engine compares the latest snapshot with the prior snapshot.
5. Severity classifier marks high-impact topics and large changes for review.
6. OpenAI summarizes the diff using strict schema output and `store: false`.
7. Review-required changes wait for admin approval; low-risk approved changes can render alerts.
8. Email delivery is logged with immutable alert history.

## Safety

Every customer-facing alert must include the official source URL, diff excerpt, and informational-only footer. High-impact topics include tax rates, contribution rates, filing deadlines, form-field layout changes, employer reporting workflows, low-confidence summaries, new sources, and unusually large changes.
