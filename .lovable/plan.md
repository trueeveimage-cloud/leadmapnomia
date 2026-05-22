# LeadMapAI → Leadline AI Sales Engine

## 1. Scoring: add S Tier + tighten high-value gate

Edit `src/lib/leadScoring.ts`:
- Extend `LeadTier` to `'S' | 'A+' | 'A' | 'B' | 'C'`.
- **Hard rule:** Only leads whose `detectNiche()` returns a **high-value** niche (cosmetic, dental, healthcare, law, plumber, electrician, locksmith, roofer, water_damage, real_estate, construction, car_dealer, car_detailer) can reach `S` or `A+`. Low-value / unknown niches cap at `A`.
- **S Tier** requires ALL of: high-value niche, `score >= 88`, phone present, email present, `reviews_count >= 30`, `rating >= 4.2`, `estValue === 'High'`.
- A+: high-value niche + score ≥ 80.
- A: score ≥ 65. B: ≥ 45. C: rest.
- Add badges: `S Tier`, `No Email Found`, `Urgent Calls`. Keep existing.

No migration needed (`lead_tier` is text).

## 2. Email scraper — already crawls /kontakt, /about, /boka. Extend to also try `/integritetspolicy`, `/privacy`, `/villkor` and bump per-page HTML cap from 100KB → 200KB. File: `supabase/functions/scrape-emails/index.ts`.

## 3. Hot Leads dashboard restructure

Edit `src/pages/HotLeadsPage.tsx`:
- Group results into 5 collapsible sections in this order:
  1. **S Tier** (purple accent)
  2. **A+ Hot Leads**
  3. **No Email Found — High Potential** (S/A+ niche, score ≥ 70, no email)
  4. **Gmail Outreach Queue** (selected + has email + not yet emailed)
  5. **Follow-up Queue** (emailed ≥ 2 days ago, no reply)
- Keep existing filter bar; add `Tier` multi-select (S/A+/A/B/C) and `Not contacted yet` toggle.
- Add per-row checkbox + bulk select. Selection drives the outreach queue.

## 4. Gmail bulk outreach

**Connector:** Gmail (via `standard_connectors--connect`, connector_id `google_mail`). This uses *the builder's* Gmail account — perfect for Leadline AI's outreach from one inbox.

**New edge function** `supabase/functions/send-gmail/index.ts`:
- Input: `{ leadId, to, subject, body }`. Validates with Zod.
- Builds RFC2822, base64url-encodes, POSTs to `https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send` with `Authorization: Bearer LOVABLE_API_KEY` + `X-Connection-Api-Key: GOOGLE_MAIL_API_KEY`.
- On success: inserts a row in `message_logs` with `channel='email'`, `direction='outbound'`, `status='sent'`, `provider='gmail'`, `provider_message_sid=<gmail id>`. Updates lead `last_outbound_at`, `outreach_stage='email_sent'`.

**Schema:** none new — reuse `message_logs` (already supports channel) and `leads.outreach_stage`.

**New component** `src/components/EmailOutreachModal.tsx`:
- Opens from Hot Leads bulk action ("Email selected").
- Subject + body editor pre-filled with niche-aware template (port `generateOutreachMessage` to email form: subject line + 3-paragraph body).
- Shows recipient list with per-row enable toggle.
- "Send all" with 1.5s delay between sends, progress counter, abort button.
- Skips leads where a `message_logs` row with `channel='email'` + `direction='outbound'` + same `lead_id` already exists (dedupe).

**Per-lead "Email" button** in `LeadQuickActions.tsx`: opens the same modal with one recipient.

**Email status on lead row:** show small badge derived from latest email log: `Sent`, `Replied` (inbound email log exists), `Follow-up due` (>48h since sent, no reply).

## 5. Follow-up surface

Add a derived "Follow-up Queue" section in HotLeadsPage filtering `outreach_stage='email_sent'` AND `last_outbound_at < now()-2d` AND no inbound email log. One-click "Send follow-up" reopens the modal with a short bump template.

## Out of scope
- Inbound Gmail polling (replies must be marked manually for now — Lovable can add Gmail watch later).
- Per-recipient deep personalization beyond `{name}` / `{city}` / `{niche}`.
- Email open/click tracking.

## Files

- `src/lib/leadScoring.ts` (S tier logic, gate)
- `src/components/LeadScoreBadge.tsx` (S tier styling, new badges)
- `src/pages/HotLeadsPage.tsx` (sections, selection, queues)
- `src/components/EmailOutreachModal.tsx` (new)
- `src/components/LeadQuickActions.tsx` (Email button)
- `src/components/LeadRow.tsx` (email status badge)
- `supabase/functions/scrape-emails/index.ts` (more paths, bigger cap)
- `supabase/functions/send-gmail/index.ts` (new)
- `src/index.css` (S tier purple token)

## One thing to confirm

Gmail connector sends from **your own Gmail account** — every email's `From` will be your address. That's what you want for cold outreach to feel personal. If you'd rather send from a separate domain (e.g. `hej@leadline.ai`), say so and I'll switch the edge function to use a transactional provider instead.
