# Gmail Auto Send

Gmail Auto Send lives at:

`Leadmap AI -> Gmail Auto Send`

Route:

`/leadmap/email-outreach`

## Saved settings

The page saves while typing to:

- Browser local storage key `nomia.emailOutreachDraft`
- Supabase `settings` key `nomia_gmail_auto_send`

This prevents the subject/body/settings from resetting when leaving the page.

## Page fields

- Subject
- Email body
- Variables: `business_name`, `city`, `niche`, `owner_name`
- Sender name
- Daily limit
- Delay between emails
- Test email
- Save
- Saved status

## Sending protection

The Gmail function blocks sending to already-contacted emails by checking prior outbound message logs for duplicate lead rows that share the same email address.
