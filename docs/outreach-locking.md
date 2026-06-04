# Outreach Locking

The shared frontend contract lives in `src/lib/sharedCrmContract.ts`.

The CRM stores these states on `leads.outreach_state`:

- `not_contacted`
- `email_sent`
- `sms_sent`
- `called`
- `replied`
- `follow_up_needed`
- `closed`
- `lost`
- `do_not_contact`

The shared frontend helper is `src/lib/outreachLock.ts`.
The backend/database gate is `public.acquire_outreach_lock`.

## Rules

- Email is blocked when `outreach_state = email_sent` or the lead has outbound email history.
- SMS is blocked when `outreach_state = sms_sent`.
- Calls and AI calls are blocked when `outreach_state = called`.
- Do-not-contact blocks all outreach.
- AI calls are blocked after 2 call attempts unless manually unlocked.
- Unlocking shows a warning because it can contact the same business twice.

## Duplicate prevention

Gmail, SMS, and Retell AI calls now call `public.acquire_outreach_lock` before contacting anyone. Gmail also checks prior outbound email by lead ID and by matching normalized email across duplicate leads. The database migration adds indexes for normalized email, normalized phone, Retell call IDs, and a unique `outreach_locks(lock_type, lock_value)` identity lock.

## History fields

The migration adds:

- `last_contacted_at`
- `last_contact_method`
- `outreach_count`
- `outreach_history`
- `do_not_contact`
