# Retell Calling MVP

This MVP lets one CRM lead trigger one Retell outbound AI call, then stores Retell webhook results back on the lead.

## Supabase environment variables

Add these secrets in Supabase project settings or with `supabase secrets set`:

```sh
RETELL_API_KEY=...
RETELL_AGENT_ID=...
RETELL_FROM_NUMBER=+14155550123
RETELL_WEBHOOK_SECRET=...
LEADMAP_DEMO_LINK=https://...
```

`RETELL_FROM_NUMBER` and lead phone numbers must be E.164 numbers, for example `+46701234567`.

`RETELL_WEBHOOK_SECRET` should be the Retell webhook API key used to verify the `X-Retell-Signature` HMAC signature. For the MVP, signature verification is skipped when this secret is not set.

## Deploy functions

```sh
supabase functions deploy retell-start-call
supabase functions deploy retell-webhook
```

Deploy the latest migrations before testing:

```sh
supabase db push
```

## Retell webhook URL

Use this URL in Retell account-level or agent-level webhooks:

```text
https://<supabase-project-ref>.supabase.co/functions/v1/retell-webhook
```

Enable at least these voice events:

- `call_started`
- `call_ended`
- `call_analyzed`

`call_failed` is also handled defensively if Retell sends it.

## Test with your own phone number

1. Create or edit one test lead with your own E.164 phone number.
2. Confirm the lead is not marked `do_not_contact` or `outreach_opt_out`.
3. Open the Cold Call page and click `Call with AI`.
4. Confirm the lead changes to `Calling`.
5. Confirm `retell_call_id` is saved.
6. Answer the call and complete a short test conversation.
7. Open `/ai-calls`.
8. Confirm status, outcome, summary, transcript, and next step appear.

Do not test on real leads first. Use your own number until start-call and webhook updates are confirmed.

## Current protection rules

The start-call function blocks:

- missing or non-E.164 phone numbers
- `do_not_contact`
- `outreach_opt_out`
- current `Calling` status
- `call_attempts >= 2` unless `manualUnlock` is sent
- duplicate contacted phone numbers when detectable

The webhook is idempotent through `event_id` or an event/call fallback key stored in `outreach_history`.
