# Launch Checklist

Last evidence refresh: 19 July 2026. Checked items are backed by a live response or a completed repository verification; provider and owner assertions remain unchecked until verified directly.

- [x] Domain connected and serving HTTPS.
- [x] Render service and custom domain responding over HTTPS.
- [ ] Latest release deployed and `/api/health` confirms all 7 migrations.
- [ ] Migrations through `0007_digest_delivery_runs.sql` confirmed on production.
- [x] Five enabled seed sources healthy with no stale or degraded source.
- [x] Cloudflare inbound MX, SPF, and DMARC records published for `ruleradar.se`.
- [ ] Stripe products, prices, customer portal, and webhook events configured.
- [ ] Resend sender domain verified with SPF and DKIM.
- [ ] OpenAI key configured.
- [ ] Admin user created.
- [ ] Privacy notice published at `/privacy` with final legal identity and contact details.
- [x] DPA/vendor list drafted in `docs/DATA_PROCESSING.md`.
- [ ] Vendor DPAs accepted/downloaded in Render, Stripe, Resend, and OpenAI accounts.
- [ ] Test alert delivered to internal recipient.
- [ ] Test signup -> checkout -> webhook -> app settings subscription status.
- [ ] Test failed-payment webhook marks workspace `past_due`.
- [ ] Test customer portal and cancel-at-period-end flow.
- [ ] Test password reset email and one-time token consumption.
- [ ] Test team invite, seat limit, acceptance, and revocation.
- [ ] Replay one Stripe webhook and confirm it is ignored as a duplicate.
- [ ] High-severity review workflow tested.
- [ ] Backup job tested and restore path documented.
- [x] Logical backup creation, checksum manifest, archive verification, and restore drill documented in code/runbook.
- [x] Stripe subscription lifecycle reconciliation covered by automated tests.
- [x] Low-risk data retention cleanup runs after successful monitoring scans.
- [x] Local unit, type, lint, build, source QA, and isolated Playwright checks pass.
- [ ] Confirm conversion events appear in the admin 30-day summary without personal data.
- [ ] First 25 target firms prepared for outreach.

## Current hard blockers

- Stripe must use a live secret key and matching live prices/webhook. The admin console intentionally rejects `sk_test_` as production-ready.
- Resend must send from `ruleradar.se`, not a fallback domain.
- `LEGAL_ENTITY_NAME`, `LEGAL_ORG_NUMBER`, `LEGAL_POSTAL_ADDRESS`, and `LEGAL_CONTACT_EMAIL` must be set to the actual selling entity.
- A durable offsite backup destination and quarterly temporary-database restore drill must be established.

## Repeatable evidence commands

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run qa:sources
npm run qa:production -- https://ruleradar.se
npm run backup:logical
npm run backup:verify
```
