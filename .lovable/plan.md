
# Complete the Outreach Flow: Message -> Track -> Call -> Status

## What's Already Built
- Lead database with all fields (phone, status, outreach_stage, needs_call, etc.)
- Campaign wizard (audience filter, template, caps)
- Send batch edge function (currently uses MOCK provider)
- Inbound webhook (`twilio-inbound`) -- receives SMS replies, updates lead
- Status webhook (`twilio-status`) -- tracks delivery status
- Check-no-reply edge function -- moves non-repliers to call list
- Inbox page (shows inbound replies with quick actions)
- Call List page (shows leads needing calls, log outcomes)
- All status pages (Interested, Not Interested, Callbacks, etc.)

## What's Missing (3 things to make it fully work)

### 1. Connect Twilio (SMS Provider)
You need a Twilio account to send real SMS and receive replies automatically.

**Steps you do:**
1. Go to twilio.com and create an account (or log in)
2. Buy a phone number (costs about $1/month)
3. Get your credentials from the Twilio Console dashboard:
   - **Account SID** (starts with "AC...")
   - **Auth Token** (click to reveal it)
   - **Phone Number** (the number you bought, like +46701234567)

Once you give me those 3 values, I'll:
- Store them securely as backend secrets
- Update the send-campaign-batch function to use real Twilio SMS instead of mock
- Your campaigns will start sending real SMS

### 2. Set Up Twilio Webhooks (so replies come back)
After Twilio is connected, you need to tell Twilio WHERE to send incoming replies:

1. In Twilio Console, go to your phone number's settings
2. Set these two webhook URLs:

```text
Incoming Message URL:
https://olfucdwmegdnczwpgaeg.supabase.co/functions/v1/twilio-inbound

Status Callback URL:
https://olfucdwmegdnczwpgaeg.supabase.co/functions/v1/twilio-status
```

Both should be set to HTTP POST. These are already built and deployed -- they just need Twilio pointed at them.

### 3. Schedule the Auto-Check (moves non-repliers to Call List)
The `check-no-reply` function exists but isn't running on a schedule. I'll set up a cron job that runs every 30 minutes to automatically check for leads who haven't replied within your configured window (default: 48 hours) and move them to the Call List.

---

## The Complete Flow Once Set Up

```text
Finder finds leads --> Leads saved in Unsorted
        |
        v
Campaign sends SMS to leads with phone numbers
        |
        v
Lead replies? ----YES----> Appears in /inbox
   |                        You pick: Interested / Not Interested / Callback / etc.
   |                        Lead moves to that status page
   NO (after 48h)
   |
   v
Auto-moved to /call-list
   |
   v
You call them, pick outcome:
   Answered --> Pick status (Interested / Not Interested / Demo / etc.)
   No Answer --> Stays in call list, try again
   Busy --> Stays in call list
   Wrong Number --> Removed
   Callback --> Moves to /callbacks with scheduled date
```

## Technical Changes I'll Make

1. **Update `send-campaign-batch`** to call Twilio's REST API instead of inserting mock records
2. **Create a cron job** (database scheduled task) that calls `check-no-reply` every 30 minutes
3. **Add the 3 Twilio secrets** (will prompt you to enter them)

No new pages or UI changes needed -- everything is already wired up. It's purely a backend connection task.
