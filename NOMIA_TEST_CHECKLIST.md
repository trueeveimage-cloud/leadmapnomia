# Nomia CRM rollout checklist

Use only an owner-controlled email address and phone number. Keep the master pause enabled except during the single test action being verified.

- [ ] Open `/` while signed in and verify the Nomia and Leadmap workspace choices.
- [ ] Switch between workspaces and confirm counts, leads, notifications, campaigns, inbox, analytics, and exports never cross products.
- [ ] Open legacy URLs and confirm they redirect to canonical `/nomia/*` or `/leadmap/*` routes.
- [ ] Open the app signed out and confirm CRM records cannot be read or modified.
- [ ] Add a Nomia test lead using the owner's phone, email, website, place ID, and business identity.
- [ ] Confirm a duplicate email is blocked by `acquire_outreach_lock`.
- [ ] Confirm duplicate phone, domain, place, and business identities are blocked server-side.
- [ ] Create a Gmail review with the test lead, refresh, and confirm the rendered preview persists.
- [ ] Confirm a draft, paused, unreviewed, or unapproved Gmail campaign cannot send through the UI or a direct function call.
- [ ] Review and approve the test recipient, temporarily enable master and Gmail, send one message, then restore both pauses.
- [ ] Confirm the campaign recipient result, message log, lead timeline, and Nomia notification are saved.
- [ ] Reply from the owner-controlled mailbox and confirm the reply appears in Nomia Inbox and creates a notification.
- [ ] Log a manual call outcome and required follow-up date for the test lead.
- [ ] Create and approve an AI-call review containing only the owner-controlled number.
- [ ] Temporarily enable master and AI calls, start one approved test call, then restore both pauses.
- [ ] Confirm Retell changes the call status and the verified webhook stores transcript and result data.
- [ ] Create an appointment and confirm Booked Meetings increments and the lead enters Meeting Booked in the computed pipeline.
- [ ] Mark the test lead Do Not Contact and confirm manual call, AI call, Gmail, and legacy SMS are blocked at database level.
- [ ] Use the owner-only unlock action with a written reason and confirm the immutable activity and original lock remain.
- [ ] Confirm Sweden filters return Swedish leads only; UK and Spain remain inactive.
- [ ] Confirm Gmail settings and reviewed recipients persist after a full page refresh.
- [ ] Confirm all cron outreach jobs remain disabled.

After testing, leave `outreach_master_paused`, `nomia_gmail_paused`, `nomia_ai_calls_paused`, `nomia_sms_paused`, and `partner_outreach_paused` set to `true`.
