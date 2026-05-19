# Pivot: LeadMap → AI Receptionist Email Outreach

Goal: Stop using Twilio SMS. Use **email outreach** to sell your AI receptionist to Swedish small businesses. Reuse all existing leads, the Finder, and the CRM pipeline — just swap the outbound channel from SMS to email.

---

## The strategy (why this works)

**Who to target:** Businesses that lose money when they miss calls — dentists, plumbers, electricians, salons, vets, chiros, law firms, small restaurants. You already have hundreds of these in the DB.

**Email angle (better than "AI receptionist"):**
> Subject: *Missade ni mitt samtal igår?*
>
> *"Hej {name}, jag ringde er {time} och fick ingen svar. Det är förmodligen för att ni var upptagna med en kund. Vi har byggt en AI-receptionist som svarar i ert namn, bokar in tider och skickar detaljerna till er — så ni aldrig missar en kund igen. Vill ni se en 2-min demo?"*

This frames the problem with proof, not a pitch.

---

## What we'll build

### 1. Email collection (we already have most of it)
Email sources, in priority order:
- ✅ **Google Places** — already returns emails for ~10% of leads via existing `scrape-emails` function
- 🆕 **Website scraping upgrade** — extend `scrape-emails` to also try `/kontakt`, `/contact`, `/om-oss` subpages (not just homepage). Should bump coverage to ~40-50%.
- 🆕 **Firecrawl fallback** — for leads where simple scraping fails, use Firecrawl connector to render the page (handles JS-heavy sites). Boosts coverage to ~60-70%.
- 🆕 **Bulk "Find Emails" action** in CRM — select leads → background job fills `email` column

### 2. Email sending (replaces Twilio)
**Use Lovable Emails** (built into the platform — free tier, no Twilio cost). You set up a sender domain once (e.g. `notify.dindomän.se`), then every email comes from your brand.

Cost comparison:
- Twilio SMS: ~$0.07/msg → 1000 msgs = $70
- Lovable Emails: free for normal volumes

### 3. Email campaigns (mirror SMS campaigns)
New `email_campaigns` table + `send-email-campaign` edge function, modeled exactly on the existing SMS campaign system:
- Audience filter (niches, has-website, rating, country)
- Template with `{name}`, `{city}`, `{category}` variables
- Daily caps, idempotency (no double-emailing the same lead)
- Status tracking via `email_send_log` (sent / opened / replied / bounced)

### 4. Inbox for replies
When prospects reply to your outreach email, replies need to land somewhere you check:
- Easiest: replies go to your real Gmail. You read them there.
- Optional later: pipe replies into the CRM Inbox via Gmail connector

### 5. UI changes
- New page `/email-campaigns` (clone of CampaignsPage but for email)
- New "Email" column in lead list
- "Find Emails" button on lead detail + bulk action
- Dashboard KPI: "Leads with email" / "Emails sent today"

### 6. Keep Twilio? Toggle off, don't delete
Twilio code stays in case you want it later, but Settings gets a "Disable SMS campaigns" toggle so you stop accidentally burning credit.

---

## Build order (so you can send within 1 session)

1. **Set up email domain** (5 min — you'll click a button, add 2 DNS records at your registrar)
2. **Email infra** (auto — tool spins up queue, send log, suppression list)
3. **Schema:** Add `email_campaigns`, `email_campaign_runs` tables (mirror SMS structure)
4. **Upgrade `scrape-emails`** to crawl `/kontakt`, `/contact` subpages + add Firecrawl fallback
5. **New edge function `send-email-campaign`** (clone of `send-campaign-batch`, swap Twilio for Lovable Emails)
6. **Email Campaigns page** in UI
7. **Bulk "Find Emails" action** on Leads page
8. **Update messaging memory** with new AI receptionist templates (SE)
9. **Disable SMS auto-cron** so it stops trying to send

---

## What you need to do (in real life, not in the app)

1. **Pick a domain** for sending. Either a new domain (e.g. `aireceptionist.se`, ~$15/yr) or reuse an existing one. Tell me which.
2. **Have a 2-min demo ready** (Loom video of your AI receptionist taking a call) — link goes in every email.
3. **Have a booking link** (Cal.com / Calendly) — second CTA in email.

---

## Technical notes (skip if not technical)

- `email_send_log` already gets created by `setup_email_infra` — gives us delivery/bounce/complaint tracking for free
- Suppression list is automatic — bounces auto-block future sends
- Reusing existing `leads.email` column + adding `email_status` (`unknown` / `found` / `bounced` / `opted_out`)
- Reusing existing `outreach_opt_out`, `has_replied`, idempotency logic
- Firecrawl connector needs to be connected (free tier covers ~500 scrapes/mo)
- Edge functions to add: `send-email-campaign`, `find-lead-emails` (bulk)
- Edge functions to modify: `scrape-emails` (multi-page), `auto-send-campaigns` (skip SMS, dispatch email)
- Removing nothing — SMS stays as dead code behind a feature flag

---

## Out of scope (for this pass)

- Gmail connector for two-way inbox sync — replies go to your real Gmail for now
- Tracking pixels for opens — Lovable Emails handles delivery tracking, open tracking is a later add
- AI-personalized email bodies per lead — start with one good template, optimize after we see reply rate
- Multi-touch sequences (day 1, day 3, day 7) — phase 2 once single-shot is proven

Approve and I'll start building.