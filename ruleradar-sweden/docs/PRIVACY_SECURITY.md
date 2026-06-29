# Privacy And Security

RuleRadar Sweden processes business contact data, account records, subscriptions, notification preferences, official-source snapshots, summaries, and delivery logs.

## GDPR Baseline

- Collect only business contact details needed for account access and alert delivery.
- Avoid sensitive employee-specific data in alert emails.
- Keep official source text excerpts limited to what is necessary to explain the change.
- Maintain a privacy notice and vendor DPA list before production launch.
- Retain source snapshots and alert audit data for operational traceability; define deletion windows for inactive customer data.
- Log admin actions that approve, edit, suppress, or resend alerts.
- Rotate API keys and restrict platform-admin access.

## OpenAI

The summarizer sends only the source name, URL, topics, severity hint, and diff excerpt. It sets `store: false` and validates the response against a strict schema before any alert can be rendered.

## Email

Email alerts must not include customer employee records or sensitive payroll data. Each alert includes a source link, evidence excerpt, and informational-only footer.

## Breach Response

1. Freeze risky exports and outbound alerts.
2. Preserve logs.
3. Rotate affected secrets.
4. Assess scope and affected data categories.
5. Notify the supervisory authority without undue delay when GDPR Article 33 risk thresholds are met.
6. Notify affected customers with facts, mitigations, and next steps.
