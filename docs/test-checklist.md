# Manual Test Checklist

Use only your own test phone/email. Do not send to real leads during testing.

1. Add a test lead with your own phone/email.
2. Send one test email, then try sending again to confirm duplicate email detection blocks it.
3. Click `Call with AI` on the same test lead after Retell env vars are configured.
4. Confirm the lead changes to `outreach_state = called` and `call_status = Calling`.
5. Send a Retell webhook test payload and confirm transcript, summary, outcome, and call status are saved.
6. Mark the lead `Do not contact` and confirm Gmail, SMS, and AI call attempts are blocked.
7. Open `Nomia -> Email Outreach`, type subject/body/settings, refresh the page, and confirm values persist.
8. In Lead Finder, run/check filters for Sweden, UK, and Spain. Confirm Sweden/Goteborg does not show UK/Spain, UK/London only shows London/UK, and Spain/Marbella only shows Marbella/Spain.
