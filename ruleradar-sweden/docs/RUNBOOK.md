# Runbook

## New Source Onboarding

1. Add source with agency, topic tags, strategy, and priority.
2. Run extraction test.
3. Confirm the extracted text excludes nav, cookie, and footer noise.
4. Run one manual scan to create the baseline snapshot.
5. Leave review required enabled for the first week.

## Unexpected Mass Alert Spike

1. Pause outbound alerts.
2. Inspect source health, latest run metadata, and diff excerpts.
3. Suppress noisy changes.
4. Tighten source extraction or severity rules.
5. Re-run scans and resume alerting only after review.

## Cron Scan

Use the protected endpoint from Render Cron or a one-off terminal:

```bash
curl -X POST https://YOUR_APP_URL/api/cron/scan \
  -H "Authorization: Bearer $SYSTEM_CRON_SECRET"
```

Expected result:

- Baseline run stores snapshots without customer alerts.
- Changed sources create detected changes.
- Review-required changes wait in `/admin/review`.
- Approved changes create queued deliveries.
- Missing Resend keys leave deliveries queued instead of marking them sent.

## Low Confidence AI Summary

1. Keep status as review required.
2. Open the official source and stored diff.
3. Edit customer-facing copy.
4. Approve only when the source evidence supports the summary.

## Broken Source

1. Mark source degraded.
2. Switch strategy to `browser_fallback` or monitor a more stable endpoint.
3. Add a health note to the audit log.

## Billing Failure

Use Stripe as the source of truth. Keep the workspace in grace period, send the billing portal link, then downgrade access at grace-period end.

## Customer Asks Why They Got An Alert

Open the alert detail and show source URL, fetch timestamp, diff excerpt, summary JSON, delivery status, and review history.
