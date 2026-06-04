# Retell CRM MVP

## Required env vars

Set these in Supabase Edge Function secrets:

```bash
RETELL_API_KEY=
RETELL_AGENT_ID=
RETELL_FROM_NUMBER=
RETELL_WEBHOOK_SECRET=
LEADMAP_DEMO_LINK=
```

Do not hardcode secrets in the frontend.

## Start a call

The required public endpoint is:

`POST /api/retell/start-call`

It is routed to the single Supabase Edge Function `retell-start-call` via `public/_redirects`. Do not create a second Retell implementation.

Input:

```json
{ "leadId": "uuid" }
```

The function loads the lead, validates phone number, do-not-contact, calling state, and call limits, then calls Retell with dynamic variables for business name, owner name, niche, city, country, demo link, `my_name = Maged`, and `company_name = Leadmap AI`.

## Webhook

Configure Retell to call the required public endpoint:

`POST /api/webhooks/retell`

It is routed to the single Supabase Edge Function `retell-webhook` via `public/_redirects`.

The webhook matches leads by `metadata.lead_id` or `retell_call_id`, saves transcript, summary, outcome, and updates `call_status`. It is idempotent by storing webhook event IDs inside `outreach_history`.

## Safety

AI calls are blocked when a lead has no phone, is do-not-contact, is already calling, was already called, or has 2+ call attempts unless manually unlocked.

The backend lock gate is the database function `public.acquire_outreach_lock`. Gmail, SMS, and Retell must all use it.
