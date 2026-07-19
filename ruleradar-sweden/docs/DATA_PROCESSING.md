# Data Processing And Vendor Register

This register is the launch baseline for RuleRadar Sweden. It is an operational document, not legal advice. Review it whenever a vendor, region, data category, or retention period changes.

## Processing Summary

RuleRadar processes business account data, organization membership, notification recipients, subscription state, support/contact requests, official-source snapshots, generated summaries, review decisions, delivery logs, and anonymous first-party conversion events.

RuleRadar does not require employee-level payroll records, personal identity numbers, health details, or customer payroll files for the monitoring workflow. Customers must not place sensitive employee data in alert settings, support messages, or source requests.

## Vendor Register

| Vendor | Purpose | Data categories | Role / transfer note | Contract reference |
| --- | --- | --- | --- | --- |
| Render Services, Inc. | Web hosting, Postgres, logs, backups | Account, organization, alert, delivery, audit, and contact data | Processor; review selected service region and SCC terms | [Render DPA](https://render.com/dpa) |
| Stripe | Checkout, subscriptions, invoices, customer portal | Billing contact, organization, customer/subscription IDs, payment data held by Stripe | Processor and, for some payment/fraud purposes, independent controller | [Stripe DPA](https://stripe.com/legal/dpa) |
| Resend / Plus Five Five, Inc. | Transactional email delivery | Recipient email, message content, delivery metadata | Processor; US storage with SCC coverage stated by vendor | [Resend DPA](https://resend.com/legal/dpa) |
| OpenAI Ireland Ltd. | Structured summary of public-source changes | Source name, URL, topics, severity hint, changed excerpt | Processor; API request uses `store: false` | [OpenAI DPA](https://openai.com/policies/data-processing-addendum/) |

## Retention Baseline

- Active account and organization data: while the subscription is active.
- Billing identifiers and invoice references: according to accounting and legal obligations.
- Official-source snapshots and alert audit trail: 24 months by default, then review for deletion or aggregation.
- Contact requests: 12 months after the last substantive contact unless converted to a customer record.
- Password-reset tokens: one hour validity; expired/used rows may be deleted after 30 days.
- Pending organization invites: seven days validity; expired rows may be deleted after 30 days.
- Anonymous conversion events: 13 months maximum.
- Security and operational logs: 90 days unless an incident requires longer preservation.

The monitoring worker enforces the low-risk portions of this baseline on every run: expired or used reset tokens and invitations older than 30 days, anonymous conversion events older than 13 months, and non-pilot/non-customer contact requests inactive for 12 months are deleted automatically. Source evidence, billing records, customer accounts, and audit history require a separate reviewed deletion process.

## Data Subject Requests

1. Verify the requester and record scope/date.
2. Search users, organization membership, notification settings, contact requests, delivery logs, and billing references.
3. Coordinate Stripe/Resend/Render/OpenAI requests when vendor-held data is in scope.
4. Export, correct, restrict, or delete as applicable.
5. Preserve records required by law or active disputes and explain any exception.
6. Record completion in the audit log.

## Launch Owner Actions

- Accept or download each vendor DPA in the logged-in account.
- Record Render service and database regions.
- Confirm Stripe account legal entity and customer statement details.
- Verify Resend sender domain and review subprocessors.
- Confirm OpenAI API organization is covered by the current business terms and DPA.
- Replace placeholder RuleRadar legal identity/contact details before broad public sales.

The deployed app reads the final seller identity from `LEGAL_ENTITY_NAME`, `LEGAL_ORG_NUMBER`, `LEGAL_POSTAL_ADDRESS`, and `LEGAL_CONTACT_EMAIL`. The admin readiness panel remains incomplete until all four are present.
